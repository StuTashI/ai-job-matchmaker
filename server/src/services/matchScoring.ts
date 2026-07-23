import { Type } from "@google/genai";
import type {
  CompanySize,
  DimensionKey,
  DimensionScores,
  GapType,
  GuidancePath,
  Job,
  JobAnalysis,
  JobGuidance,
  JobReport,
  MismatchItem,
  NeedsImprovementItem,
  ParsedResume,
  ScoreBand,
  StrengthItem,
  SuggestedImprovement,
} from "../types.js";

// ---------------------------------------------------------------------------
// Resume<->JD Fit Scoring Agent rubric — six dimensions, each scored 0-5 by
// Gemini via evidence tracing to the resume text. The formula below is always
// computed here, deterministically, from those 0-5 integers — Gemini never
// supplies a trusted final score, only classification + prose.
// ---------------------------------------------------------------------------

// Weight * 20 lands on an integer for every dimension (.25/.20/.15/.15/.15/.10 -> 5/4/3/3/3/2),
// so the total score is always an exact integer with zero floating-point rounding — "never
// round a borderline score up" is satisfied by construction, not a runtime rounding policy.
const DIMENSION_ORDER: { key: DimensionKey; label: string; weight: number; formulaMultiplier: number }[] = [
  { key: "skillExperienceOverlap", label: "Skill and Experience Overlap", weight: 0.25, formulaMultiplier: 5 },
  { key: "domainIndustryMatch", label: "Domain and Industry Match", weight: 0.2, formulaMultiplier: 4 },
  { key: "roleSeniorityMatch", label: "Role and Seniority Match", weight: 0.15, formulaMultiplier: 3 },
  { key: "quantifiedImpactStrength", label: "Quantified Impact Strength", weight: 0.15, formulaMultiplier: 3 },
  { key: "atsKeywordCoverage", label: "ATS Keyword Coverage", weight: 0.15, formulaMultiplier: 3 },
  { key: "ownershipScopeMatch", label: "Ownership and Scope Match", weight: 0.1, formulaMultiplier: 2 },
];

function clampDimension(value: number): number {
  return Math.min(5, Math.max(0, Math.round(value)));
}

// Defensive clamp against Gemini ever returning a non-integer/out-of-range value despite
// the Type.INTEGER schema hint — the formula must never see anything outside 0-5.
export function clampDimensions(raw: Record<DimensionKey, number>): DimensionScores {
  const clamped = {} as DimensionScores;
  for (const { key } of DIMENSION_ORDER) {
    clamped[key] = clampDimension(raw[key] ?? 0);
  }
  return clamped;
}

export function computeOverallScore(dims: DimensionScores): number {
  return DIMENSION_ORDER.reduce((sum, d) => sum + dims[d.key] * d.formulaMultiplier, 0);
}

export function bandFor(score: number): ScoreBand {
  if (score >= 85) return "excellent";
  if (score >= 70) return "strong";
  if (score >= 50) return "moderate";
  return "weak";
}

// ---------------------------------------------------------------------------
// Guidance Layer — the rubric itself has no gapType/path concept, so these are
// derived deterministically from the new dimension scores/band to keep the
// existing Guidance Layer (Today's Priority banner, drawer pills) alive.
// ---------------------------------------------------------------------------

function isHardFilter(dims: DimensionScores): boolean {
  // Near-zero on either "must basically match" dimension is a genuine disqualifier,
  // same spirit as the old model's domain-mandatory-unmet / function-mismatch hard gates.
  return dims.domainIndustryMatch <= 1 || dims.roleSeniorityMatch <= 1;
}

interface GapContext {
  skillGapsCount?: number;
  applicantCount?: number;
  companySize?: CompanySize;
}

export function classifyGapType(band: ScoreBand, dims: DimensionScores, ctx: GapContext = {}): GapType {
  if (isHardFilter(dims)) return "hard_filter";
  if (band === "weak") return "structural_mismatch";
  if (band === "moderate" && dims.skillExperienceOverlap <= 2 && dims.atsKeywordCoverage <= 2) {
    return "structural_mismatch";
  }
  // Only available once the deep report has run — sharpens the coarser batch-only guess.
  if (ctx.skillGapsCount != null && ctx.skillGapsCount >= 4 && band !== "excellent") {
    return "structural_mismatch";
  }
  const highVolume = (ctx.applicantCount != null && ctx.applicantCount > 150) || ctx.companySize === "large_enterprise";
  if (highVolume && (band === "excellent" || band === "strong")) return "volume_competition";
  return "positioning";
}

export function selectPath(gapType: GapType, band: ScoreBand): GuidancePath {
  switch (gapType) {
    case "hard_filter":
      return "referral_first";
    case "structural_mismatch":
      return "skip";
    case "volume_competition":
      return "apply_referral";
    case "positioning":
      return band === "excellent" ? "apply_standard" : "reframe_then_apply";
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

// Deterministic, weakest-dimension-first prose — no Gemini override needed here since
// dimension scores are always real numbers now, not a boolean/tier heuristic.
function buildWhy(dims: DimensionScores): string[] {
  const sorted = [...DIMENSION_ORDER].sort((a, b) => dims[a.key] - dims[b.key]);
  const lines: string[] = [];
  for (const d of sorted) {
    if (dims[d.key] >= 4) break;
    lines.push(`${d.label} scored ${dims[d.key]}/5 (${Math.round(d.weight * 100)}% weight).`);
    if (lines.length >= 2) break;
  }
  const strong = sorted
    .filter((d) => dims[d.key] >= 4)
    .slice(-3)
    .map((d) => `${d.label} ${dims[d.key]}/5`);
  if (strong.length > 0) {
    lines.push(`Everything else clears comfortably: ${strong.join(", ")}.`);
  }
  return lines.slice(0, 3);
}

// Covers the batch-only case (no report yet) — a trimmed version of the deep report's
// own doThis, since there's no skill-gap/evidence detail available at this stage.
function buildDoThisTemplate(job: Job, path: GuidancePath): string[] {
  const actions: string[] = [];
  const searchQuery = `${job.title} ${job.company}`.trim();

  if (path === "referral_first" || path === "apply_referral") {
    actions.push(
      `Search LinkedIn for "${searchQuery}", filter to 2nd-degree connections, and shortlist 2-3 people with a relevant title at ${job.company || "the company"}.`,
    );
  }
  if (path === "referral_first") {
    actions.push("Open the full Analyze report before reaching out — it names the specific gap to lead with honestly.");
  }
  if (path === "apply_referral") {
    actions.push("Apply through the standard flow today — don't wait, since applicant volume already looks high for this listing.");
  }
  if (path === "reframe_then_apply") {
    actions.push("Open the full Analyze report before applying — it'll name the specific area to reframe.");
  }
  if (path === "apply_standard") {
    actions.push("Apply through the standard flow.");
  }
  if (path === "skip") {
    actions.push(
      "Skip this one unless you have a specific strategic reason to pursue it — e.g. a warm connection at a founder-led team where a human, not an ATS, reviews applications.",
    );
  }
  return actions.slice(0, 3);
}

function buildConfidenceNote(gapType: GapType, path: GuidancePath): string {
  switch (gapType) {
    case "hard_filter":
      return "This assumes a referral path is used — a cold application through the standard Apply flow, competing against an ATS filter on the weak dimension, would likely convert lower than this score suggests.";
    case "volume_competition":
      return "This score reflects how well you match the role; your actual response odds are pulled down by how many people are already competing for this specific listing.";
    case "positioning":
      if (path === "reframe_then_apply") {
        return "This score assumes you address the Suggested Improvements before applying — without them, expect a lower real response rate than this number implies.";
      }
      return "This score reflects a genuinely strong overall match — normal application variance still applies.";
    case "structural_mismatch":
      return "Treat this as a ceiling, not a target — the fundamentals here don't line up, so even a strong application is unlikely to change the outcome much.";
  }
}

function buildGuidance(dims: DimensionScores, band: ScoreBand, job: Job, ctx: GapContext, reportDoThis?: string[]): JobGuidance {
  const gapType = classifyGapType(band, dims, ctx);
  const path = selectPath(gapType, band);
  return {
    verdict: buildVerdict(path),
    why: buildWhy(dims),
    gapType,
    path,
    doThis: reportDoThis && reportDoThis.length > 0 ? reportDoThis : buildDoThisTemplate(job, path),
    confidenceNote: buildConfidenceNote(gapType, path),
  };
}

// ---------------------------------------------------------------------------
// Heuristic dimension estimator — the ONE sanctioned fallback for match scoring,
// used only for list-view/batch scoring when Gemini is unavailable, fails, or the
// daily free-tier quota (as low as 20 requests/day, shared across every AI feature
// in this app) is exhausted. Deliberately coarse: a keyword/ratio-based guess, not a
// resurrection of the old heuristic scoring system. The on-demand deep report
// (single job, Analyze drawer) stays Gemini-only with no fallback — this estimator
// only ever feeds assembleListAnalysis, never assembleReportAnalysis. Results are
// marked `estimated: true` so the UI can visibly distinguish them from a real
// Gemini-scored badge rather than presenting a guess as if it were the real thing.
// ---------------------------------------------------------------------------

const OWNERSHIP_KEYWORDS = [
  "led", "owned", "managed", "founded", "drove", "spearheaded", "end-to-end", "end to end", "built from scratch", "launched",
];

const FALLBACK_DOMAIN_HINTS = [
  "fintech", "payments", "banking", "healthcare", "health tech", "e-commerce", "ecommerce", "saas", "b2b",
  "edtech", "logistics", "supply chain", "gaming", "travel", "hospitality", "media", "telecom", "automotive",
  "real estate", "insurance",
];

function buildResumeCorpus(resume: ParsedResume): string {
  return [resume.summary, ...resume.experience.flatMap((e) => [e.role, e.company, ...e.highlights])].join(" ").toLowerCase();
}

function ratioScale(ratio: number): number {
  return clampDimension(Math.round(ratio * 5));
}

function estimateSkillOverlap(corpus: string, resumeSkills: string[], job: Job): number {
  const requirements = job.requirements.length > 0 ? job.requirements : [job.title];
  const matched = requirements.filter((req) => {
    const normalized = req.toLowerCase().trim();
    return resumeSkills.some((s) => normalized.includes(s) || s.includes(normalized)) || corpus.includes(normalized);
  });
  return ratioScale(matched.length / requirements.length);
}

function estimateDomainMatch(corpus: string, job: Job): number {
  const jdText = `${job.title} ${job.description}`.toLowerCase();
  const jdDomains = FALLBACK_DOMAIN_HINTS.filter((hint) => jdText.includes(hint));
  if (jdDomains.length === 0) return 3; // JD doesn't call out a specific domain — neutral, not a penalty
  return jdDomains.some((hint) => corpus.includes(hint)) ? 4 : 1;
}

function classifySeniorityLevel(text: string): number {
  const lower = text.toLowerCase();
  if (/\b(intern|trainee)\b/.test(lower)) return 0;
  if (/\b(junior|associate)\b/.test(lower)) return 1;
  if (/\b(senior|sr\.?|staff|principal|lead)\b/.test(lower)) return 3;
  if (/\b(manager)\b/.test(lower)) return 4;
  if (/\b(director|head of)\b/.test(lower)) return 5;
  if (/\b(vp|vice president|chief|ceo|cto|cfo|coo)\b/.test(lower)) return 6;
  return 2;
}

function estimateSeniorityMatch(resume: ParsedResume, job: Job): number {
  const diff = Math.abs(classifySeniorityLevel(resume.experience[0]?.role ?? "") - classifySeniorityLevel(job.title));
  if (diff === 0) return 5;
  if (diff === 1) return 4;
  if (diff === 2) return 2;
  return 1;
}

function estimateQuantifiedImpact(resume: ParsedResume): number {
  const highlights = resume.experience[0]?.highlights ?? [];
  if (highlights.length === 0) return 2;
  return ratioScale(highlights.filter((h) => /\d/.test(h)).length / highlights.length);
}

function estimateAtsKeywordCoverage(corpus: string, job: Job): number {
  const words = `${job.title} ${job.requirements.join(" ")}`
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
  if (words.length === 0) return 3;
  return ratioScale(words.filter((w) => corpus.includes(w)).length / words.length);
}

function estimateOwnershipScope(resume: ParsedResume): number {
  const highlights = resume.experience[0]?.highlights ?? [];
  if (highlights.length === 0) return 2;
  const withOwnership = highlights.filter((h) => OWNERSHIP_KEYWORDS.some((kw) => h.toLowerCase().includes(kw)));
  return ratioScale(withOwnership.length / highlights.length);
}

export function estimateDimensionsHeuristic(resume: ParsedResume, job: Job): Record<DimensionKey, number> {
  const corpus = buildResumeCorpus(resume);
  const resumeSkills = resume.skills.map((s) => s.toLowerCase().trim());
  return {
    skillExperienceOverlap: estimateSkillOverlap(corpus, resumeSkills, job),
    domainIndustryMatch: estimateDomainMatch(corpus, job),
    roleSeniorityMatch: estimateSeniorityMatch(resume, job),
    quantifiedImpactStrength: estimateQuantifiedImpact(resume),
    atsKeywordCoverage: estimateAtsKeywordCoverage(corpus, job),
    ownershipScopeMatch: estimateOwnershipScope(resume),
  };
}

// ---------------------------------------------------------------------------
// Assembly — turns raw (already-clamped) dimension scores into a full JobAnalysis,
// for the two call sites (batched list-view score, on-demand deep report).
// ---------------------------------------------------------------------------

export function assembleListAnalysis(rawDims: Record<DimensionKey, number>, job: Job, estimated = false): JobAnalysis {
  const dims = clampDimensions(rawDims);
  const matchScore = computeOverallScore(dims);
  const band = bandFor(matchScore);
  const guidance = buildGuidance(dims, band, job, { applicantCount: job.applicantCount, companySize: job.companySize });
  return { matchScore, band, dimensions: dims, guidance, estimated, customMessage: "", customEmail: "" };
}

export function assembleReportAnalysis(rawDims: Record<DimensionKey, number>, report: JobReport, job: Job): JobAnalysis {
  const dims = clampDimensions(rawDims);
  const matchScore = computeOverallScore(dims);
  const band = bandFor(matchScore);
  const guidance = buildGuidance(
    dims,
    band,
    job,
    { applicantCount: job.applicantCount, companySize: job.companySize, skillGapsCount: report.skillGaps.length },
    report.doThis,
  );
  return { matchScore, band, dimensions: dims, guidance, report, customMessage: "", customEmail: "" };
}

// ---------------------------------------------------------------------------
// Gemini call #1 — deep per-job report (single job, on-demand Analyze drawer).
// Returns the six dimension integers plus every rubric prose section; the
// formula/band/guidance above are always computed locally, never trusted from Gemini.
// ---------------------------------------------------------------------------

export interface DeepReportGeminiResponse extends DimensionScores {
  verdict: string;
  whatsGood: StrengthItem[];
  whatsBad: MismatchItem[];
  needsImprovement: NeedsImprovementItem[];
  skillGaps: string[];
  suggestedImprovements: SuggestedImprovement[];
  doThis: string[];
  dontDoThis: string[];
}

export const DEEP_REPORT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    skillExperienceOverlap: { type: Type.INTEGER },
    domainIndustryMatch: { type: Type.INTEGER },
    roleSeniorityMatch: { type: Type.INTEGER },
    quantifiedImpactStrength: { type: Type.INTEGER },
    atsKeywordCoverage: { type: Type.INTEGER },
    ownershipScopeMatch: { type: Type.INTEGER },
    verdict: { type: Type.STRING },
    whatsGood: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { jdRequirement: { type: Type.STRING }, resumeEvidence: { type: Type.STRING } },
        required: ["jdRequirement", "resumeEvidence"],
      },
    },
    whatsBad: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { jdRequirement: { type: Type.STRING }, detail: { type: Type.STRING } },
        required: ["jdRequirement", "detail"],
      },
    },
    needsImprovement: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          area: { type: Type.STRING },
          issue: { type: Type.STRING },
          resumeEvidence: { type: Type.STRING },
        },
        required: ["area", "issue", "resumeEvidence"],
      },
    },
    skillGaps: { type: Type.ARRAY, items: { type: Type.STRING } },
    suggestedImprovements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          targetArea: { type: Type.STRING },
          issue: { type: Type.STRING },
          before: { type: Type.STRING },
          after: { type: Type.STRING },
          fixDescription: { type: Type.STRING },
        },
        required: ["targetArea", "issue", "fixDescription"],
      },
    },
    doThis: { type: Type.ARRAY, items: { type: Type.STRING } },
    dontDoThis: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "skillExperienceOverlap",
    "domainIndustryMatch",
    "roleSeniorityMatch",
    "quantifiedImpactStrength",
    "atsKeywordCoverage",
    "ownershipScopeMatch",
    "verdict",
    "whatsGood",
    "whatsBad",
    "needsImprovement",
    "skillGaps",
    "suggestedImprovements",
    "doThis",
    "dontDoThis",
  ],
};

export function buildDeepReportPrompt(resume: ParsedResume, job: Job): string {
  return `You are scoring a candidate resume against a job description using a strict, evidence-based rubric. This is a working tool, not a pep talk — score honestly, never invent anything not literally in the resume, and never soften a real gap.

RESUME
Name: ${resume.name}
Summary: ${resume.summary}
Skills: ${resume.skills.join(", ")}
Experience: ${resume.experience.map((e) => `${e.role} at ${e.company} (${e.duration}): ${e.highlights.join("; ")}`).join(" | ")}
Education: ${resume.education.join(", ")}

JOB DESCRIPTION
Title: ${job.title} at ${job.company}
Requirements: ${job.requirements.join(", ")}
Full description: ${job.description.slice(0, 3000)}

Score each dimension 0-5 based on how clearly the RESUME demonstrates it:
- skillExperienceOverlap (weight 25%): how directly the resume's actual work matches the core skills the JD asks for.
- domainIndustryMatch (weight 20%): alignment with the JD's industry, product category, or customer type.
- roleSeniorityMatch (weight 15%): whether the resume's scope and title history support the level this JD is hiring for.
- quantifiedImpactStrength (weight 15%): whether achievements are stated with real numbers and outcomes, not just responsibilities.
- atsKeywordCoverage (weight 15%): whether the resume uses the literal terms/phrases the JD uses, not just synonyms.
- ownershipScopeMatch (weight 10%): whether the resume shows genuine end-to-end ownership versus a supporting role.

HARD RULES — follow these exactly:
- Every claim must trace back to a specific line in the resume above. Do not infer a skill, tool, certification, or domain exposure that isn't written there.
- If a JD requirement has nothing in the resume to match it, put it in skillGaps — do not soften it or assume it's implied.
- resumeEvidence and before values must be an exact or extremely close quote of an actual line from the resume above — never a paraphrase presented as a quote, never fabricated.
- whatsBad must be direct — no hedging words like "might" or "could".
- needsImprovement is different from whatsBad: use it for real experience that's just weakly WRITTEN (vague bullets, missing metrics, generic phrasing, buzzwords) — not for missing experience.
- For each suggestedImprovements item, if the fix would require a metric the resume doesn't provide, leave "after" empty and say so explicitly in fixDescription — never invent a plausible-sounding number.
- doThis and dontDoThis must be short, concrete, and specific to this resume/JD pair — no generic advice.
- Never round a borderline dimension score up to make the match look better than it is.

Return your full assessment as JSON matching the schema.`;
}

// ---------------------------------------------------------------------------
// Gemini call #2 — batched list-view scoring (one call for the WHOLE search result
// set, never one call per job — this is the entire point: keep quota to 1 call/search
// instead of 40-80). No prose, just the six dimension integers per job.
// ---------------------------------------------------------------------------

export const BATCH_SCORE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          index: { type: Type.INTEGER },
          skillExperienceOverlap: { type: Type.INTEGER },
          domainIndustryMatch: { type: Type.INTEGER },
          roleSeniorityMatch: { type: Type.INTEGER },
          quantifiedImpactStrength: { type: Type.INTEGER },
          atsKeywordCoverage: { type: Type.INTEGER },
          ownershipScopeMatch: { type: Type.INTEGER },
        },
        required: [
          "index",
          "skillExperienceOverlap",
          "domainIndustryMatch",
          "roleSeniorityMatch",
          "quantifiedImpactStrength",
          "atsKeywordCoverage",
          "ownershipScopeMatch",
        ],
      },
    },
  },
  required: ["results"],
};

export interface BatchScoreResult extends DimensionScores {
  index: number;
}

export function buildBatchScorePrompt(resume: ParsedResume, jobs: Job[]): string {
  const numbered = jobs
    .map((job, index) => {
      const reqs = job.requirements.slice(0, 8).join(", ");
      const desc = job.description.slice(0, 700);
      return `[${index}] Title: ${job.title} | Company: ${job.company}\nRequirements: ${reqs}\nDescription: ${desc}`;
    })
    .join("\n\n");

  return `You are scoring a candidate resume against many job descriptions at once, using a strict evidence-based rubric. For EACH numbered job below, score six dimensions 0-5 based on how clearly the RESUME demonstrates them relative to that job:
- skillExperienceOverlap (25% weight): how directly the resume's actual work matches the core skills the job asks for.
- domainIndustryMatch (20%): alignment with the job's industry/product category/customer type.
- roleSeniorityMatch (15%): whether the resume's scope and title history support the level this job is hiring for.
- quantifiedImpactStrength (15%): whether the resume's achievements are stated with real numbers and outcomes.
- atsKeywordCoverage (15%): whether the resume uses the literal terms/phrases each job uses.
- ownershipScopeMatch (10%): whether the resume shows genuine end-to-end ownership versus a supporting role.

Score honestly — do not invent a match that isn't there, and do not round a weak fit up.

RESUME
Summary: ${resume.summary}
Skills: ${resume.skills.join(", ")}
Experience: ${resume.experience.map((e) => `${e.role} at ${e.company} (${e.duration}): ${e.highlights.join("; ")}`).join(" | ")}

JOBS
${numbered}

Return one result per job index, in the "results" array — no prose, just the six integer scores per job.`;
}
