import type { Job, ParsedResume, Referrer } from "../types.js";
import { hashSeed, slugify } from "./textHeuristics.js";

const FIRST_NAMES = ["Ananya", "Rohan", "Priya", "Karan", "Meera", "Arjun", "Divya", "Sanjay"];
const LAST_NAMES = ["Sharma", "Verma", "Iyer", "Reddy", "Nair", "Kapoor", "Rao", "Menon"];
const TITLES = ["Talent Acquisition Lead", "VP of Engineering", "Senior Recruiter", "Head of Talent"];

// Job poster / recruiter titles get a "happy to apply, introducing myself first" ask;
// everyone else (a product/eng person at the company, not the poster) gets a referral/pointer ask.
const JOB_POSTER_TITLES = new Set(["Talent Acquisition Lead", "Senior Recruiter", "Head of Talent"]);

export function isJobPoster(referrer: Referrer): boolean {
  return JOB_POSTER_TITLES.has(referrer.title);
}

export function synthesizeReferrer(job: Job): Referrer {
  const seed = hashSeed(job.id || `${job.title}-${job.company}`);
  const firstName = FIRST_NAMES[seed % FIRST_NAMES.length];
  const lastName = LAST_NAMES[Math.floor(seed / FIRST_NAMES.length) % LAST_NAMES.length];
  const title = TITLES[seed % TITLES.length];
  const name = `${firstName} ${lastName}`;
  const slug = slugify(name);
  const companyDomain = slugify(job.company || "company");
  return {
    name,
    title,
    linkedin: `https://linkedin.com/in/${slug}`,
    email: `${slug}@${companyDomain}.com`,
  };
}

function tenureAtRecentRole(duration: string): string {
  const match = duration.match(/(\d{4})/);
  const isPresent = /present/i.test(duration);
  if (!match || !isPresent) return "recently";
  const startYear = Number(match[1]);
  const years = new Date().getUTCFullYear() - startYear;
  if (years <= 0) return "the last year";
  if (years === 1) return "the last year";
  return `the last ${years} years`;
}

function normalize(term: string): string {
  return term.toLowerCase().trim();
}

function asFragment(sentence: string): string {
  const trimmed = sentence.replace(/\.$/, "").trim();
  const firstWord = trimmed.split(" ")[0] ?? "";
  const isAcronym = firstWord.length > 1 && firstWord === firstWord.toUpperCase();
  if (isAcronym) return trimmed;
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

function overlappingSkills(resume: ParsedResume, job: Job, limit: number): string[] {
  const resumeSkills = resume.skills;
  const requirements = job.requirements.map(normalize);
  const overlap = resumeSkills.filter((skill) => requirements.some((req) => req.includes(normalize(skill)) || normalize(skill).includes(req)));
  const pool = overlap.length > 0 ? overlap : resumeSkills;
  return pool.slice(0, limit);
}

// Used only when outreach is drafted before any Gemini-scored analysis exists for this job
// (job.analysis?.report is absent) — a small substring-overlap check against job.requirements,
// just enough to name one honest gap. Not a resurrection of the retired heuristic scoring
// system; the real gap list now comes from job.analysis.report.skillGaps once scoring has run.
export function extractLikelyGap(resume: ParsedResume, job: Job): string | undefined {
  const resumeSkills = resume.skills.map(normalize);
  const corpus = `${resume.summary} ${resume.experience.flatMap((e) => [e.role, ...e.highlights]).join(" ")}`.toLowerCase();
  for (const requirement of job.requirements) {
    const normalized = normalize(requirement);
    if (!normalized) continue;
    const isMatched =
      resumeSkills.some((skill) => normalized.includes(skill) || skill.includes(normalized)) || corpus.includes(normalized);
    if (!isMatched) return requirement;
  }
  return undefined;
}

// HOOK: names the exact opening (and, for InMail/email, the real job link — never fabricated
// or shortened) as the reason for reaching out. This is the "I did my research" signal, so it
// always leads. A few equivalent lead-ins let "regenerate" produce a genuinely different draft
// even without Gemini, instead of silently returning the exact same template text.
const HOOK_LEAD_INS = [
  "I'm reaching out about a specific opening",
  "Wanted to reach out about a specific opening",
  "Reaching out because of a specific opening",
];

function buildHook(job: Job, channel: "message" | "email", variant: number): string {
  const leadIn = HOOK_LEAD_INS[variant % HOOK_LEAD_INS.length];
  const titlePhrase = `${job.title}${job.company ? ` at ${job.company}` : ""}`;
  if (!job.url) {
    return `${leadIn} — ${titlePhrase}.`;
  }
  return channel === "email"
    ? `${leadIn} — ${titlePhrase}: ${job.url}`
    : `${leadIn} — ${titlePhrase}. Here's the posting I'm referencing: ${job.url}`;
}

// BRIDGE: who the sender is, told through relevance to the recipient — capped to the top 2
// concrete achievements from the most recent role, never a full bio. Metric-bearing
// highlights (a number, a %) are surfaced first — a quantified result reads stronger than
// a narrative-only one — with variant-based rotation on top of that for regenerate.
function pickHighlights(highlights: string[], variant: number): string[] {
  const available = highlights.filter(Boolean);
  if (available.length === 0) return [];
  const hasMetric = (h: string) => /\d/.test(h);
  const metricSorted = [...available].sort((a, b) => Number(hasMetric(b)) - Number(hasMetric(a)));
  const offset = variant % metricSorted.length;
  const rotated = [...metricSorted.slice(offset), ...metricSorted.slice(0, offset)];
  return rotated.slice(0, 2);
}

// The closing "why this matters" clause used to be a single canned sentence regardless of
// the job — names an actual overlapping skill/domain from the job's requirements instead,
// so it reads as genuinely tied to this posting rather than a placeholder.
function relevanceClause(resume: ParsedResume, job: Job): string {
  const overlap = overlappingSkills(resume, job, 2);
  if (overlap.length > 0) {
    return `particularly relevant given this role's focus on ${overlap.join(" and ")}`;
  }
  if (job.company) {
    return `well-aligned with what ${job.company} is building`;
  }
  return "closely aligned with what this role is asking for";
}

// Email gets a second sentence of room for the relevance clause (per the original
// five-part doc: "slightly more room for the Bridge" in email); the LinkedIn message stays
// to one tight sentence — a real structural difference between the two, not just a subject
// line and sign-off.
function buildBridge(resume: ParsedResume, job: Job, variant: number, channel: "message" | "email"): string {
  const recentExp = resume.experience[0];
  const highlightList = recentExp ? pickHighlights(recentExp.highlights, variant).map((h) => asFragment(h)) : [];
  const relevance = relevanceClause(resume, job);

  if (recentExp && highlightList.length > 0) {
    const lead = `Quick context on me: I'm a ${recentExp.role} at ${recentExp.company || "my current company"}, where I ${highlightList.join(" and ")}.`;
    return channel === "email" ? `${lead} That's ${relevance}.` : `${lead.slice(0, -1)}, ${relevance}.`;
  }
  if (recentExp) {
    return `Quick context on me: I'm a ${recentExp.role} at ${recentExp.company || "my current company"}, where I've spent ${tenureAtRecentRole(recentExp.duration)} building hands-on experience ${relevance}.`;
  }
  const bridgeSkills = overlappingSkills(resume, job, 2).join(" and ") || "this space";
  return `Quick context on me: my background across ${bridgeSkills} is ${relevance}.`;
}

// THE ASK: always explicit, and shaped by who's being messaged — a job poster gets a
// "happy to apply, introducing myself first" framing, anyone else gets a referral/pointer ask.
const POSTER_ASKS = [
  "I'd be glad to apply through the standard process, but wanted to introduce myself directly first.",
  "Happy to go through the standard application, but wanted to say hello directly first.",
  "I'll apply through the usual process either way, but wanted to put a face to the application first.",
  "Planning to apply through the standard flow, but figured a direct hello first couldn't hurt.",
];
const NON_POSTER_ASKS = [
  "Would you be open to a referral, or pointing me to whoever's closest to this hire?",
  "Any chance you'd be open to a referral, or could point me to the right person for this?",
  "Would you be willing to refer me, or nudge me toward whoever owns this hire?",
  "Open to referring me, or is there someone closer to this search I should be talking to?",
];

function buildAsk(referrer: Referrer, variant: number): string {
  const options = isJobPoster(referrer) ? POSTER_ASKS : NON_POSTER_ASKS;
  return options[variant % options.length];
}

// LOW-FRICTION CLOSE: makes it easy to say yes to something small.
const POSTER_CLOSES = [
  "Even a quick yes/no on whether to apply now would be plenty.",
  "No pressure either way — even a quick heads-up would help me decide next steps.",
  "Totally fine if now's not the right time — a quick heads-up either way helps.",
  "Even a one-line reply would be plenty to go on.",
];
const NON_POSTER_CLOSES = [
  "A short reply, or even just a redirect to the right person, is genuinely enough.",
  "Even a quick pointer to the right person would mean a lot.",
  "No worries if it's not you — even a name to redirect to would help a lot.",
  "Happy to keep this brief — a quick reply either way is genuinely enough.",
];

function lowFrictionClose(referrer: Referrer, variant: number): string {
  const options = isJobPoster(referrer) ? POSTER_CLOSES : NON_POSTER_CLOSES;
  return options[variant % options.length];
}

// HONEST GAP: only included when a real gap exists — named plainly, once, never apologized for.
function buildHonestGap(topGap: string | undefined): string | null {
  if (!topGap) return null;
  const trimmed = topGap.trim();
  // Some gap phrases already end in a noun like "experience"/"knowledge"/"expertise" —
  // appending "experience" again produces an awkward double-noun ("compliance knowledge
  // experience"). Only append it when the phrase doesn't already end in one.
  const alreadyHasNoun = /\b(experience|knowledge|expertise|skills?)$/i.test(trimmed);
  const gapPhrase = alreadyHasNoun ? trimmed : `${trimmed} experience`;
  return `One honest gap: I don't have direct ${gapPhrase} — flagging it upfront rather than hoping it doesn't surface later.`;
}

export function draftOutreachFallback(
  resume: ParsedResume,
  job: Job,
  referrer: Referrer,
  gaps: string[],
  variant = 0,
): { customMessage: string; customEmail: string } {
  const referrerFirstName = referrer.name.split(" ")[0];
  const topGap = gaps[0];
  const gapLine = buildHonestGap(topGap);
  const askLine = `${buildAsk(referrer, variant)} ${lowFrictionClose(referrer, variant)}`;

  // LinkedIn InMail: 80-150 words, full 5-part structure.
  const messageParts = [
    `Hi ${referrerFirstName},`,
    "",
    buildHook(job, "message", variant),
    "",
    buildBridge(resume, job, variant, "message"),
    ...(gapLine ? ["", gapLine] : []),
    "",
    askLine,
    "",
    "Thanks for your time,",
    resume.name,
  ];
  const customMessage = messageParts.join("\n");

  // Email: 120-180 words, subject line REQUIRED and must name the exact role (never a generic
  // phrase like "Reaching out"), full link included in the body.
  const emailParts = [
    `Subject: Referral — ${job.title}`,
    "",
    `Hi ${referrerFirstName},`,
    "",
    buildHook(job, "email", variant),
    "",
    buildBridge(resume, job, variant, "email"),
    ...(gapLine ? ["", gapLine] : []),
    "",
    askLine,
    "",
    "Thanks for considering it,",
    resume.name,
    resume.email,
    resume.phone ?? "",
  ];
  const customEmail = emailParts.join("\n");

  return { customMessage, customEmail };
}
