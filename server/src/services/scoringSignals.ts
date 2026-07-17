import { Type } from "@google/genai";
import type { CompanySize, GapType, GuidancePath, Job, JobAnalysis, JobGuidance, ParsedResume } from "../types.js";
import { totalYearsOfExperience } from "./resumeFallback.js";

// ---------------------------------------------------------------------------
// Signal types — these are the structured inputs to computeScores(), the
// pure deterministic function implementing the scoring pseudocode. Both the
// fast local heuristic path and the Gemini-powered path produce this same
// shape; only the classification quality differs between them.
// ---------------------------------------------------------------------------

export type DomainTier = "no_domain_specified" | "mandatory_unmet" | "transferable" | "direct";
export type ScopeTier = "under" | "aligned" | "over";
export type ContextTier = "mismatch" | "neutral" | "match";

export interface ScoringSignals {
  jobTitle: string;
  company: string;
  functionMatch: boolean;
  profileFunction: string;
  jdFunction: string;
  domainTier: DomainTier;
  missingMandatoryDomain?: string;
  yearsExperience: number;
  minYearsRequired?: number;
  maxYearsRequired?: number;
  requiredSkillsTotal: number;
  requiredSkillsMatched: number;
  niceToHaveSkillsTotal: number;
  niceToHaveSkillsMatched: number;
  missingRequiredSkills: string[];
  missingNiceToHaveSkills: string[];
  scopeTier: ScopeTier;
  contextTier: ContextTier;
  applicantCount?: number;
  companySize?: CompanySize;
  noticePeriodMonths?: number;
}

// ---------------------------------------------------------------------------
// Function / domain / scope classification dictionaries (heuristic path)
// ---------------------------------------------------------------------------

const FUNCTION_KEYWORDS: Record<string, string[]> = {
  "Product Management": ["product manager", "product management", "product owner", "product lead"],
  Engineering: [
    "software engineer", "developer", "sde", "backend", "front end", "frontend", "full stack",
    "devops", "engineering manager", "architect", "site reliability", "platform engineer",
  ],
  Design: ["designer", "ux", "ui/", "ui design", "product design"],
  "Data & Analytics": [
    "data scientist", "data analyst", "data engineer", "analytics", "machine learning", "ml engineer", "ai engineer",
  ],
  Sales: ["sales", "account executive", "business development", "bdr", "sdr"],
  Marketing: ["marketing", "growth", "seo", "content marketing", "brand"],
  Finance: ["finance", "accounting", "financial analyst", "fp&a", "controller"],
  Operations: ["operations", "ops manager", "supply chain", "logistics"],
  "Human Resources": ["human resources", "hr business partner", "talent acquisition", "recruiter", "people ops"],
  "Customer Success": ["customer success", "account manager", "customer support"],
};

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  Fintech: ["fintech", "payments", "banking", "lending", "insurtech", "insurance"],
  Healthcare: ["healthcare", "health tech", "medtech", "clinical", "pharma", "hospital"],
  "E-commerce": ["e-commerce", "ecommerce", "retail", "marketplace", "d2c"],
  "SaaS / B2B Software": ["saas", "b2b software", "enterprise software"],
  EdTech: ["edtech", "education technology", "e-learning"],
  "Logistics & Supply Chain": ["logistics", "supply chain", "fulfillment", "last-mile"],
  Gaming: ["gaming", "game studio", "esports"],
  "Travel & Hospitality": ["travel", "hospitality", "hotel", "airline"],
  "Media & Entertainment": ["media", "entertainment", "streaming", "content platform"],
  Telecom: ["telecom", "telecommunications"],
  Automotive: ["automotive", "mobility", " ev "],
  "Real Estate": ["real estate", "proptech"],
};

const MANDATORY_MARKER_RE = /\b(required|must have|minimum|essential|mandatory)\b/i;
const NICE_TO_HAVE_MARKER_RE = /\b(nice to have|preferred|bonus|a plus|good to have|plus)\b/i;
const YEARS_RANGE_RE = /(\d+)\s*(?:\+|-|to)?\s*(\d+)?\s*\+?\s*years?/i;

function classifyFromKeywords(text: string): string {
  const lower = text.toLowerCase();
  let best = "General";
  let bestHits = 0;
  for (const [fn, keywords] of Object.entries(FUNCTION_KEYWORDS)) {
    const hits = keywords.filter((kw) => lower.includes(kw)).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = fn;
    }
  }
  return best;
}

/**
 * Classifies primaryText (e.g. a role/job title) first — titles are a clean,
 * unambiguous signal. Only falls back to secondaryText (e.g. prose highlights
 * or a full job description) when the title alone doesn't match anything,
 * since prose often mentions other functions in passing (e.g. a PM's
 * highlights describing "Account Executives" who use their product) that
 * would otherwise wrongly outweigh the one clear title-based signal.
 */
function classifyFunction(primaryText: string, secondaryText = ""): string {
  const primary = classifyFromKeywords(primaryText);
  if (primary !== "General") return primary;
  return classifyFromKeywords(secondaryText);
}

function extractDomains(text: string): Set<string> {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) found.add(domain);
  }
  return found;
}

function findDomainTier(
  profileDomains: Set<string>,
  jobDescription: string,
): { tier: DomainTier; missingMandatoryDomain?: string } {
  const lines = jobDescription.split(/\r?\n|(?<=[.;])\s/);
  let mandatoryDomain: string | undefined;
  const jdDomains = new Set<string>();

  for (const line of lines) {
    const lineDomains = extractDomains(line);
    for (const d of lineDomains) {
      jdDomains.add(d);
      if (MANDATORY_MARKER_RE.test(line) && !mandatoryDomain) mandatoryDomain = d;
    }
  }

  if (jdDomains.size === 0) return { tier: "no_domain_specified" };

  if (mandatoryDomain) {
    if (profileDomains.has(mandatoryDomain)) return { tier: "direct" };
    return { tier: "mandatory_unmet", missingMandatoryDomain: mandatoryDomain };
  }

  const intersects = Array.from(jdDomains).some((d) => profileDomains.has(d));
  if (intersects) return { tier: "direct" };
  if (profileDomains.size > 0) return { tier: "transferable" };
  return { tier: "no_domain_specified" };
}

function extractYearsRange(text: string): { min?: number; max?: number } {
  const match = text.match(YEARS_RANGE_RE);
  if (!match) return {};
  const first = Number(match[1]);
  const second = match[2] ? Number(match[2]) : undefined;
  if (second != null && second > first) return { min: first, max: second };
  return { min: first };
}

const SCOPE_TITLE_LEVELS: { pattern: RegExp; level: number }[] = [
  { pattern: /\b(intern|trainee)\b/i, level: 0 },
  { pattern: /\b(junior|associate)\b/i, level: 1 },
  { pattern: /\b(senior|sr\.?|principal|staff|lead)\b/i, level: 3 },
  { pattern: /\b(manager)\b/i, level: 5 },
  { pattern: /\b(senior manager|director)\b/i, level: 6 },
  { pattern: /\b(vp|vice president|head of)\b/i, level: 7 },
  { pattern: /\b(chief|ceo|cto|cfo|coo)\b/i, level: 8 },
];

function classifyScopeLevel(title: string, yearsExp: number): number {
  for (const { pattern, level } of SCOPE_TITLE_LEVELS) {
    if (pattern.test(title)) return level;
  }
  // No explicit seniority word in the title — fall back to years of experience.
  if (yearsExp >= 8) return 4;
  if (yearsExp >= 5) return 3;
  if (yearsExp >= 2) return 2;
  return 1;
}

function matchScopeTier(profileScope: number, jdScope: number): ScopeTier {
  const diff = jdScope - profileScope;
  if (diff >= 2) return "under";
  if (diff <= -2) return "over";
  return "aligned";
}

const LARGE_ENTERPRISE_HINTS = [
  "google", "amazon", "microsoft", "meta", "apple", "netflix", "tcs", "infosys", "wipro",
  "accenture", "cognizant", "ibm", "oracle", "sap", "capgemini", "hcl", "deloitte", "flipkart",
];

function classifyCompanySizeFromName(companyName: string): CompanySize {
  const lower = companyName.toLowerCase();
  if (LARGE_ENTERPRISE_HINTS.some((hint) => lower.includes(hint))) return "large_enterprise";
  return "unknown";
}

function findStatedCompanyContext(jobDescription: string): CompanySize | null {
  const lower = jobDescription.toLowerCase();
  if (/(startup experience|early-stage startup|scrappy startup)/.test(lower)) return "startup_small";
  if (/(enterprise experience|large organization experience|fortune 500 experience|mnc experience)/.test(lower)) {
    return "large_enterprise";
  }
  return null;
}

function matchContextTier(profileCompanySize: CompanySize, statedContext: CompanySize | null): ContextTier {
  if (!statedContext) return "neutral";
  if (profileCompanySize === "unknown") return "neutral";
  return profileCompanySize === statedContext ? "match" : "mismatch";
}

function splitRequiredAndNiceToHave(job: Job): { required: string[]; niceToHave: string[] } {
  const lines = job.description.split(/\r?\n/).filter(Boolean);
  const required = new Set<string>();
  const niceToHave = new Set<string>();
  let currentBucket: "required" | "nice" | null = null;

  for (const line of lines) {
    if (/^(requirements|must have|minimum qualifications|qualifications)\s*:?$/i.test(line.trim())) {
      currentBucket = "required";
      continue;
    }
    if (/^(nice to have|preferred|bonus|good to have)\s*:?$/i.test(line.trim())) {
      currentBucket = "nice";
      continue;
    }
    if (currentBucket === "nice" && line.trim().length > 3) {
      niceToHave.add(line.trim());
    }
  }

  // If we couldn't detect explicit sections, fall back to the pre-extracted
  // requirements[] list (already capped/cleaned) treated entirely as required.
  if (required.size === 0 && niceToHave.size === 0) {
    return { required: job.requirements, niceToHave: [] };
  }
  return { required: job.requirements.filter((r) => !niceToHave.has(r)), niceToHave: Array.from(niceToHave) };
}

function isDomainTerm(text: string): boolean {
  const lower = text.toLowerCase();
  return Object.values(DOMAIN_KEYWORDS).some((keywords) => keywords.some((kw) => lower.includes(kw)));
}

function buildCandidateCorpus(resume: ParsedResume): string {
  const parts = [resume.summary, ...resume.experience.flatMap((e) => [e.role, ...e.highlights])];
  return parts.join(" ").toLowerCase();
}

/**
 * A requirement counts as matched if it overlaps the curated skills list, OR if it's
 * clearly evidenced in the broader experience narrative (role titles, highlights,
 * summary) even when it isn't phrased as a discrete "skill" — e.g. a role titled
 * "Senior Product Manager (AI Products)" clearly demonstrates "AI Products" experience
 * even though that exact phrase never appears in a Skills section.
 */
function skillIsMatched(resumeSkills: Set<string>, corpus: string, requirement: string): boolean {
  const normReq = requirement.toLowerCase().trim();
  if (Array.from(resumeSkills).some((skill) => normReq.includes(skill) || skill.includes(normReq))) return true;
  if (corpus.includes(normReq)) return true;
  const words = normReq.split(/\s+/).filter((w) => w.length > 2);
  if (words.length < 2) return false;
  const hits = words.filter((w) => corpus.includes(w)).length;
  return hits / words.length >= 0.75;
}

// ---------------------------------------------------------------------------
// Heuristic signal extraction (fast, free, used for batch list scoring)
// ---------------------------------------------------------------------------

export function extractSignalsHeuristic(resume: ParsedResume, job: Job): ScoringSignals {
  const resumeSkills = new Set(resume.skills.map((s) => s.toLowerCase().trim()));
  const candidateCorpus = buildCandidateCorpus(resume);
  const recentRole = resume.experience[0];
  const profileFunction = classifyFunction(
    recentRole?.role ?? "",
    `${resume.summary} ${recentRole?.highlights.join(" ") ?? ""}`,
  );
  const jdFunction = classifyFunction(job.title, job.description);

  const profileDomains = extractDomains(
    `${resume.summary} ${resume.experience.map((e) => `${e.company} ${e.highlights.join(" ")}`).join(" ")}`,
  );
  const { tier: domainTier, missingMandatoryDomain } = findDomainTier(profileDomains, job.description);

  const yearsExperience = totalYearsOfExperience(resume.experience);
  const { min: minYearsRequired, max: maxYearsRequired } = extractYearsRange(`${job.title} ${job.description}`);

  const { required: requiredRaw, niceToHave: niceToHaveRaw } = splitRequiredAndNiceToHave(job);
  const required = requiredRaw.filter((r) => !isDomainTerm(r));
  const niceToHave = niceToHaveRaw.filter((r) => !isDomainTerm(r));
  const missingRequiredSkills = required.filter((r) => !skillIsMatched(resumeSkills, candidateCorpus, r));
  const missingNiceToHaveSkills = niceToHave.filter((r) => !skillIsMatched(resumeSkills, candidateCorpus, r));

  const profileScope = classifyScopeLevel(recentRole?.role ?? "", yearsExperience);
  const jdScope = classifyScopeLevel(job.title, 0);
  const scopeTier = matchScopeTier(profileScope, jdScope);

  const profileCompanySize = recentRole ? classifyCompanySizeFromName(recentRole.company) : "unknown";
  const statedContext = findStatedCompanyContext(job.description);
  const contextTier = matchContextTier(profileCompanySize, statedContext);

  return {
    jobTitle: job.title,
    company: job.company,
    functionMatch: profileFunction === "General" || jdFunction === "General" || profileFunction === jdFunction,
    profileFunction,
    jdFunction,
    domainTier,
    missingMandatoryDomain,
    yearsExperience,
    minYearsRequired,
    maxYearsRequired,
    requiredSkillsTotal: required.length,
    requiredSkillsMatched: required.length - missingRequiredSkills.length,
    niceToHaveSkillsTotal: niceToHave.length,
    niceToHaveSkillsMatched: niceToHave.length - missingNiceToHaveSkills.length,
    missingRequiredSkills,
    missingNiceToHaveSkills,
    scopeTier,
    contextTier,
    applicantCount: job.applicantCount,
    companySize: job.companySize,
    noticePeriodMonths: resume.noticePeriodMonths,
  };
}

// ---------------------------------------------------------------------------
// Deterministic scoring — implements the pseudocode exactly. Both the
// heuristic path and the Gemini-signals path feed into this same function so
// the arithmetic never diverges between them.
// ---------------------------------------------------------------------------

// Weights per the six scored dimensions (function match, domain, skills, experience,
// scope, company context) — sums to 1.0.
const WEIGHTS = {
  function: 0.25,
  domain: 0.25,
  skills: 0.2,
  experience: 0.15,
  scope: 0.1,
  companyContext: 0.05,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scoreFunctionMatch(signals: ScoringSignals): number {
  // The hard gate for a genuine mismatch (Rule 1) is applied separately in
  // scoreRelevancy; this sub-score is what feeds the weighted average when the
  // function does match (or is ambiguous enough that functionMatch is true).
  return signals.functionMatch ? 95 : 30;
}

function scoreDomain(signals: ScoringSignals): number {
  switch (signals.domainTier) {
    case "mandatory_unmet":
      // Rule 2: an unmet "must have" JD requirement forces its own dimension near zero.
      return 8;
    case "transferable":
      // Rule 3: analogous-but-not-identical experience gets partial credit — never 0, never 100.
      return 40;
    case "direct":
      return 95;
    case "no_domain_specified":
      return 70;
  }
}

function scoreExperience(signals: ScoringSignals): number {
  const { yearsExperience, minYearsRequired, maxYearsRequired } = signals;
  if (minYearsRequired == null) return 75;
  if (yearsExperience < minYearsRequired) {
    // Rule 4: under-qualification degrades steeply — the further below the bar, the sharper the drop.
    const ratio = minYearsRequired > 0 ? yearsExperience / minYearsRequired : 0;
    return clamp(30 + ratio * 50, 20, 80);
  }
  if (maxYearsRequired != null && yearsExperience > maxYearsRequired) {
    // Rule 4: over-qualification degrades gently — a couple of years over barely moves the needle.
    const overBy = yearsExperience - maxYearsRequired;
    return clamp(95 - overBy * 3, 55, 95);
  }
  return 95;
}

function scoreSkills(signals: ScoringSignals): number {
  const requiredRatio = signals.requiredSkillsTotal > 0 ? signals.requiredSkillsMatched / signals.requiredSkillsTotal : 1;
  const niceRatio = signals.niceToHaveSkillsTotal > 0 ? signals.niceToHaveSkillsMatched / signals.niceToHaveSkillsTotal : 1;
  return clamp(requiredRatio * 80 + niceRatio * 20, 0, 100);
}

function scoreScope(signals: ScoringSignals): number {
  switch (signals.scopeTier) {
    case "aligned":
      return 95;
    case "over":
      return 65;
    case "under":
      return 50;
  }
}

function scoreCompanyContext(signals: ScoringSignals): number {
  switch (signals.contextTier) {
    case "match":
      return 90;
    case "neutral":
      return 75;
    case "mismatch":
      return 30;
  }
}

function isMandatoryFilterUnmet(signals: ScoringSignals): boolean {
  if (signals.domainTier === "mandatory_unmet") return true;
  if (signals.minYearsRequired != null && signals.yearsExperience < signals.minYearsRequired * 0.5) return true;
  if (signals.requiredSkillsTotal >= 2 && signals.requiredSkillsMatched / signals.requiredSkillsTotal < 0.25) return true;
  return false;
}

function scoreRelevancy(signals: ScoringSignals): number {
  if (!signals.functionMatch) {
    // Rule 1: function mismatch is a hard gate, not just a weighted dimension — cap at
    // 20 regardless of how strong everything else is. Scale a small amount within that
    // band by skill overlap so results aren't all identical.
    const overlapRatio = signals.requiredSkillsTotal > 0 ? signals.requiredSkillsMatched / signals.requiredSkillsTotal : 0;
    return Math.round(clamp(2 + overlapRatio * 18, 0, 20));
  }

  const scores = {
    function: scoreFunctionMatch(signals),
    domain: scoreDomain(signals),
    skills: scoreSkills(signals),
    experience: scoreExperience(signals),
    scope: scoreScope(signals),
    companyContext: scoreCompanyContext(signals),
  };

  let weighted =
    scores.function * WEIGHTS.function +
    scores.domain * WEIGHTS.domain +
    scores.skills * WEIGHTS.skills +
    scores.experience * WEIGHTS.experience +
    scores.scope * WEIGHTS.scope +
    scores.companyContext * WEIGHTS.companyContext;

  // Rule 2: any unmet mandatory JD requirement caps the total in the 55-60 band, even
  // if every other dimension scores well — an ATS/recruiter screen on that specific
  // term is likely to filter the application before a human sees it.
  if (isMandatoryFilterUnmet(signals)) {
    weighted = Math.min(weighted, 58);
  }

  return Math.round(clamp(weighted, 0, 100));
}

function buildGapsAndImprovements(signals: ScoringSignals): { gaps: string[]; improvements: string[] } {
  const gaps: string[] = [];
  const improvements: string[] = [];

  if (!signals.functionMatch) {
    gaps.push(`This role is in ${signals.jdFunction}, while your background is primarily in ${signals.profileFunction}`);
    improvements.push(
      `Tailor your resume to highlight any ${signals.jdFunction}-adjacent work, or prioritize roles closer to your ${signals.profileFunction} background.`,
    );
  }

  if (signals.domainTier === "mandatory_unmet" && signals.missingMandatoryDomain) {
    gaps.push(`Missing required domain experience in ${signals.missingMandatoryDomain}`);
    improvements.push(
      `Highlight any exposure to ${signals.missingMandatoryDomain} (projects, clients, or adjacent work), even if it wasn't your primary focus.`,
    );
  }

  if (signals.minYearsRequired != null && signals.yearsExperience < signals.minYearsRequired) {
    gaps.push(`${signals.yearsExperience} years of experience vs. the ${signals.minYearsRequired}+ years typically expected`);
    improvements.push("Emphasize the scope and impact of your experience to help offset a shorter tenure.");
  }

  for (const skill of signals.missingRequiredSkills) {
    if (gaps.length >= 4) break;
    gaps.push(skill);
    improvements.push(`Add a project or measurable achievement demonstrating ${skill} to strengthen your fit for this role.`);
  }
  for (const skill of signals.missingNiceToHaveSkills) {
    if (gaps.length >= 4) break;
    gaps.push(skill);
    improvements.push(`Consider adding ${skill} — it's listed as a nice-to-have for this role.`);
  }

  if (gaps.length === 0) {
    improvements.push("Quantify your recent achievements with concrete metrics to stand out further.");
  }

  return { gaps: gaps.slice(0, 4), improvements: improvements.slice(0, 4) };
}

// ---------------------------------------------------------------------------
// Guidance generation — Step 3 (gap type classification) is always deterministic
// so it's consistent and auditable regardless of which signal path produced it.
// Step 4's prose (why/doThis) can be overridden with Gemini-authored text when
// available; verdict/confidenceNote stay template-driven since they don't need
// creative writing, just a consistent label tied to the classification.
// ---------------------------------------------------------------------------

interface SubScores {
  function: number;
  domain: number;
  skills: number;
  experience: number;
  scope: number;
  companyContext: number;
}

function computeSubScores(signals: ScoringSignals): SubScores {
  return {
    function: scoreFunctionMatch(signals),
    domain: scoreDomain(signals),
    skills: scoreSkills(signals),
    experience: scoreExperience(signals),
    scope: scoreScope(signals),
    companyContext: scoreCompanyContext(signals),
  };
}

/** Step 3: classify why the score is what it is — determines which action path applies. */
function classifyGapType(signals: ScoringSignals, matchScore: number): GapType {
  if (!signals.functionMatch) return "structural_mismatch";
  if (isMandatoryFilterUnmet(signals)) return "hard_filter";
  if (matchScore < 55 && signals.scopeTier !== "aligned" && signals.domainTier !== "direct") {
    return "structural_mismatch";
  }
  const highVolume = (signals.applicantCount != null && signals.applicantCount > 150) || signals.companySize === "large_enterprise";
  if (highVolume && matchScore >= 60) return "volume_competition";
  return "positioning";
}

function selectPath(gapType: GapType, matchScore: number): GuidancePath {
  switch (gapType) {
    case "hard_filter":
      return "referral_first";
    case "volume_competition":
      return "apply_referral";
    case "structural_mismatch":
      return "skip";
    case "positioning":
      return matchScore >= 80 ? "apply_standard" : "reframe_then_apply";
  }
}

function buildVerdict(path: GuidancePath): string {
  switch (path) {
    case "apply_standard":
      return "Strong fit — apply through the standard flow.";
    case "apply_referral":
      return "Good fit, but competition is steep — apply, and pursue a referral in parallel.";
    case "referral_first":
      return "Partial fit — referral-first, don't cold-apply.";
    case "reframe_then_apply":
      return "Solid fit — reframe your positioning before applying.";
    case "skip":
      return "Weak fit — skip unless you have a specific strategic reason to pursue it.";
  }
}

function buildWhy(subScores: SubScores): string[] {
  const dims: { key: keyof SubScores; label: string; weight: number }[] = [
    { key: "function", label: "Function match", weight: WEIGHTS.function },
    { key: "domain", label: "Domain match", weight: WEIGHTS.domain },
    { key: "skills", label: "Skill match", weight: WEIGHTS.skills },
    { key: "experience", label: "Experience match", weight: WEIGHTS.experience },
    { key: "scope", label: "Scope/seniority match", weight: WEIGHTS.scope },
    { key: "companyContext", label: "Company context fit", weight: WEIGHTS.companyContext },
  ];
  const sorted = [...dims].sort((a, b) => subScores[a.key] - subScores[b.key]);

  const lines: string[] = [];
  for (const d of sorted) {
    if (subScores[d.key] >= 70) break;
    lines.push(`${d.label} scored ${subScores[d.key]}/100 (${Math.round(d.weight * 100)}% weight).`);
    if (lines.length >= 2) break;
  }

  const strong = sorted
    .filter((d) => subScores[d.key] >= 70)
    .slice(-3)
    .map((d) => `${d.label} ${subScores[d.key]}`);
  if (strong.length > 0) {
    lines.push(`Everything else clears comfortably: ${strong.join(", ")}.`);
  }

  return lines.slice(0, 3);
}

function topReframeGap(signals: ScoringSignals): string | undefined {
  return signals.missingRequiredSkills[0] ?? signals.missingNiceToHaveSkills[0];
}

function buildDoThis(signals: ScoringSignals, path: GuidancePath): string[] {
  const actions: string[] = [];
  const searchQuery = `${signals.jobTitle} ${signals.company}`.trim();

  if (path === "referral_first" || path === "apply_referral") {
    actions.push(
      `Search LinkedIn for "${searchQuery}", filter to 2nd-degree connections, and shortlist 2-3 people with a title like "${signals.jobTitle}" or a recruiting title at ${signals.company || "the company"}.`,
    );
  }
  if (path === "referral_first") {
    actions.push("Send a direct message that leads with your strongest matching experience and names the gap upfront — do not soften or omit it.");
    if (signals.missingMandatoryDomain) {
      actions.push(
        `Before any conversation, spend under an hour on a primer covering ${signals.missingMandatoryDomain} basics — enough to hold a first conversation, not to claim expertise you don't have.`,
      );
    }
  }
  if (path === "apply_referral") {
    actions.push("Apply through the standard flow today — don't wait, since applicant volume is already high for this listing.");
  }
  if (path === "reframe_then_apply" || path === "apply_standard") {
    const topGap = topReframeGap(signals);
    if (topGap) {
      actions.push(
        `Before applying, edit your most recent role's bullets to explicitly connect your experience to "${topGap}" — name it directly rather than assuming the reviewer infers it.`,
      );
    }
    actions.push(
      path === "apply_standard"
        ? "Apply through the standard flow."
        : "Apply through the standard flow once the reframe above is in place.",
    );
  }
  if (path === "skip") {
    actions.push(
      "Skip this one unless you have a specific strategic reason to pursue it — e.g. a warm connection at a founder-led team where a human, not an ATS, reviews applications.",
    );
  }
  if (signals.noticePeriodMonths != null && signals.noticePeriodMonths >= 3 && path !== "skip") {
    actions.push("Mention your notice period proactively once a conversation starts — a fast-moving team may otherwise assume you're not immediately available.");
  }

  return actions.slice(0, 4);
}

function buildConfidenceNote(gapType: GapType, path: GuidancePath, hasReframeGap: boolean): string {
  switch (gapType) {
    case "hard_filter":
      return "This assumes a referral path is used — a cold application through the standard Apply flow, competing against an ATS filter on the unmet requirement, would likely convert lower than this score suggests.";
    case "volume_competition":
      return "This score reflects how well you match the role; your actual response odds are pulled down by how many people are already competing for this specific listing.";
    case "positioning":
      if (path === "reframe_then_apply" || hasReframeGap) {
        return "This score assumes you make the reframe above explicit in your application — without it, expect a lower real response rate than this number implies.";
      }
      return "This score reflects a genuinely strong overall match — normal application variance still applies.";
    case "structural_mismatch":
      return "Treat this as a ceiling, not a target — the fundamentals here don't line up, so even a strong application is unlikely to change the outcome much.";
  }
}

function buildGuidance(
  signals: ScoringSignals,
  matchScore: number,
  overrides?: { why?: string[]; doThis?: string[] },
): JobGuidance {
  const subScores = computeSubScores(signals);
  const gapType = classifyGapType(signals, matchScore);
  const path = selectPath(gapType, matchScore);

  return {
    verdict: buildVerdict(path),
    why: overrides?.why && overrides.why.length > 0 ? overrides.why : buildWhy(subScores),
    gapType,
    path,
    doThis: overrides?.doThis && overrides.doThis.length > 0 ? overrides.doThis : buildDoThis(signals, path),
    confidenceNote: buildConfidenceNote(gapType, path, Boolean(topReframeGap(signals))),
  };
}

export function computeScores(
  signals: ScoringSignals,
  guidanceOverrides?: { why?: string[]; doThis?: string[] },
): JobAnalysis {
  const matchScore = scoreRelevancy(signals);
  const { gaps, improvements } = buildGapsAndImprovements(signals);
  const guidance = buildGuidance(signals, matchScore, guidanceOverrides);

  return { matchScore, gaps, improvements, guidance, customMessage: "", customEmail: "" };
}

// ---------------------------------------------------------------------------
// Gemini-powered signal extraction (used by the on-demand Analyze drawer) —
// asks the model to classify the qualitative signals only; the final scores
// are always computed by computeScores() above so the arithmetic matches the
// heuristic path exactly.
// ---------------------------------------------------------------------------

export const SIGNALS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    functionMatch: { type: Type.BOOLEAN },
    profileFunction: { type: Type.STRING },
    jdFunction: { type: Type.STRING },
    domainTier: { type: Type.STRING, enum: ["no_domain_specified", "mandatory_unmet", "transferable", "direct"] },
    missingMandatoryDomain: { type: Type.STRING },
    minYearsRequired: { type: Type.NUMBER },
    maxYearsRequired: { type: Type.NUMBER },
    requiredSkillsTotal: { type: Type.NUMBER },
    requiredSkillsMatched: { type: Type.NUMBER },
    niceToHaveSkillsTotal: { type: Type.NUMBER },
    niceToHaveSkillsMatched: { type: Type.NUMBER },
    missingRequiredSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
    missingNiceToHaveSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
    scopeTier: { type: Type.STRING, enum: ["under", "aligned", "over"] },
    contextTier: { type: Type.STRING, enum: ["mismatch", "neutral", "match"] },
    why: { type: Type.ARRAY, items: { type: Type.STRING } },
    doThis: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "functionMatch", "profileFunction", "jdFunction", "domainTier",
    "requiredSkillsTotal", "requiredSkillsMatched", "niceToHaveSkillsTotal", "niceToHaveSkillsMatched",
    "missingRequiredSkills", "missingNiceToHaveSkills", "scopeTier", "contextTier", "why", "doThis",
  ],
};

export type GeminiSignals = Omit<
  ScoringSignals,
  "yearsExperience" | "applicantCount" | "companySize" | "noticePeriodMonths" | "jobTitle" | "company"
> & {
  why: string[];
  doThis: string[];
};

export function buildSignalsPrompt(resume: ParsedResume, job: Job): string {
  return `You are an expert technical recruiter classifying a candidate's fit for a job on several structured dimensions. Read both profiles carefully and return your classification as JSON matching the schema.

CANDIDATE PROFILE
Most recent role: ${resume.experience[0]?.role ?? "unknown"} at ${resume.experience[0]?.company ?? "unknown"}
Skills: ${resume.skills.join(", ")}
Summary: ${resume.summary}
Experience history: ${resume.experience.map((e) => `${e.role} at ${e.company} (${e.duration}): ${e.highlights.join("; ")}`).join(" | ")}

JOB DESCRIPTION
Title: ${job.title} at ${job.company}
Requirements listed: ${job.requirements.join(", ")}
Full description: ${job.description.slice(0, 3000)}

Classify:
- functionMatch: does the candidate's functional background (e.g. Product, Engineering, Sales, Design, Data) match the function this JD is ACTUALLY hiring for day-to-day — not just a similar-sounding title? Watch for a JD that's mislabeled or dressed up with adjacent language (e.g. a Business Analyst, Technical Program Manager, or Product Marketing Manager role described using "Product" language, when the core function differs from genuine Product Management). true/false.
- profileFunction / jdFunction: short labels for each (e.g. "Product Management", "Engineering").
- domainTier: "mandatory_unmet" if the JD explicitly requires industry/domain experience (e.g. fintech, healthcare) the candidate doesn't have; "direct" if the candidate has clearly matching domain experience; "transferable" if the candidate has relevant-but-different domain experience; "no_domain_specified" if the JD doesn't call out a specific domain requirement. If mandatory_unmet, also set missingMandatoryDomain to the domain name.
- minYearsRequired / maxYearsRequired: years of experience the JD calls for, if stated (omit if not stated).
- requiredSkillsTotal / requiredSkillsMatched: count the JD's explicitly required/must-have skills (tools, technologies, competencies) — do NOT include industry/domain terms here (e.g. "Fintech", "Healthcare"), those belong only in domainTier above, not in the skills count.
- niceToHaveSkillsTotal / niceToHaveSkillsMatched: same, for explicitly nice-to-have/preferred/bonus skills (0 if the JD doesn't distinguish any).
- missingRequiredSkills / missingNiceToHaveSkills: the specific skill names missing from each bucket (up to 6 each), excluding any industry/domain terms already captured by domainTier.
- scopeTier: "aligned" if the seniority/scope of the JD matches the candidate's demonstrated scope (team size led, budget, IC vs management level); "under" if the JD wants someone more senior/broader scope than the candidate has shown; "over" if the candidate is clearly overqualified/more senior than the role.
- contextTier: "match"/"mismatch"/"neutral" — only mark match or mismatch if the JD explicitly states a company-type preference (e.g. "startup experience required", "enterprise background preferred") and you can tell whether the candidate's background aligns; otherwise "neutral".
- why: 1 to 3 short sentences explaining the biggest drivers of the fit (good or bad) — name the weakest dimension(s) explicitly and explain why in plain language (e.g. "Domain match is weak — no fintech background, and this role is built around payments"), then briefly note what's strong. Don't just restate a dimension name; explain the reasoning.
- doThis: 2 to 4 concrete, specific actions the candidate can execute today, grounded in this specific job and company. Never write vague advice like "improve your domain knowledge" or "network more" — instead name exactly what to read (and roughly how long that should take) or exactly what to search for and on which platform (e.g. "Search LinkedIn for '${job.title} ${job.company}', filter to 2nd-degree connections, and message 2-3 people with a relevant title"). If there's a real capability or domain gap, state it honestly in any suggested outreach language rather than papering over it — never suggest the candidate claim skills or experience they don't have.`;
}
