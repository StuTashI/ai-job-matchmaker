export interface ParsedResume {
  name: string;
  email: string;
  phone?: string;
  summary: string;
  skills: string[];
  experience: {
    role: string;
    company: string;
    duration: string;
    highlights: string[];
  }[];
  education: string[];
  noticePeriodMonths?: number;
  careerNarrative?: string;
}

export type CompanySize = "large_enterprise" | "startup_small" | "unknown";

export interface ResumeFile {
  name: string;
  type: string;
  dataUrl: string;
}

export type JobType = "Remote" | "Hybrid" | "In Office";

export type Portal = "LinkedIn" | "Indeed" | "Wellfound" | "Naukri" | "Flexjobs" | "Google";

export interface Referrer {
  name: string;
  title: string;
  linkedin: string;
  email: string;
}

export type GapType = "hard_filter" | "positioning" | "volume_competition" | "structural_mismatch";
export type GuidancePath = "apply_standard" | "apply_referral" | "referral_first" | "reframe_then_apply" | "skip";

export const PATH_LABELS: Record<GuidancePath, string> = {
  apply_standard: "Apply standard",
  apply_referral: "Apply + referral",
  referral_first: "Referral-first, skip cold apply",
  reframe_then_apply: "Reframe then apply",
  skip: "Skip",
};

export const GAP_TYPE_LABELS: Record<GapType, string> = {
  hard_filter: "Hard filter gap",
  positioning: "Positioning gap",
  volume_competition: "Volume/competition gap",
  structural_mismatch: "Structural mismatch",
};

export interface JobGuidance {
  verdict: string;
  why: string[];
  gapType: GapType;
  path: GuidancePath;
  doThis: string[];
  confidenceNote: string;
}

// The six Resume<->JD Fit Scoring Agent dimensions, each 0-5. Weights below mirror
// server/src/services/matchScoring.ts's formula — kept here purely for display (the
// breakdown table in the Analyze drawer), the server never trusts a client-computed score.
export type DimensionKey =
  | "skillExperienceOverlap"
  | "domainIndustryMatch"
  | "roleSeniorityMatch"
  | "quantifiedImpactStrength"
  | "atsKeywordCoverage"
  | "ownershipScopeMatch";

export type DimensionScores = Record<DimensionKey, number>;

export type ScoreBand = "excellent" | "strong" | "moderate" | "weak";

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  skillExperienceOverlap: "Skill and Experience Overlap",
  domainIndustryMatch: "Domain and Industry Match",
  roleSeniorityMatch: "Role and Seniority Match",
  quantifiedImpactStrength: "Quantified Impact Strength",
  atsKeywordCoverage: "ATS Keyword Coverage",
  ownershipScopeMatch: "Ownership and Scope Match",
};

export const DIMENSION_WEIGHTS: Record<DimensionKey, number> = {
  skillExperienceOverlap: 0.25,
  domainIndustryMatch: 0.2,
  roleSeniorityMatch: 0.15,
  quantifiedImpactStrength: 0.15,
  atsKeywordCoverage: 0.15,
  ownershipScopeMatch: 0.1,
};

export const BAND_LABELS: Record<ScoreBand, string> = {
  excellent: "Excellent match — apply as-is",
  strong: "Strong match — apply after edits",
  moderate: "Moderate match — address gaps first",
  weak: "Weak match — don't apply yet",
};

export const BAND_STYLES: Record<ScoreBand, string> = {
  excellent: "bg-emerald-500",
  strong: "bg-emerald-500",
  moderate: "bg-amber-500",
  weak: "bg-rose-500",
};

export interface StrengthItem {
  jdRequirement: string;
  resumeEvidence: string;
}

export interface MismatchItem {
  jdRequirement: string;
  detail: string;
}

export interface NeedsImprovementItem {
  area: string;
  issue: string;
  resumeEvidence: string;
}

export interface SuggestedImprovement {
  targetArea: string;
  issue: string;
  before?: string;
  after?: string;
  fixDescription: string;
}

// The full evidence-based report (rubric sections 2-8) — present only once the on-demand
// deep analysis has succeeded; batch/list-view scoring never sets this.
export interface JobReport {
  verdict: string;
  whatsGood: StrengthItem[];
  whatsBad: MismatchItem[];
  needsImprovement: NeedsImprovementItem[];
  skillGaps: string[];
  suggestedImprovements: SuggestedImprovement[];
  doThis: string[];
  dontDoThis: string[];
}

export interface JobAnalysis {
  matchScore: number;
  band: ScoreBand;
  dimensions: DimensionScores;
  guidance: JobGuidance;
  report?: JobReport;
  // True only when list-view/batch scoring fell back to the local heuristic estimator
  // (Gemini unavailable, failed, or the daily quota was exhausted) instead of a real
  // Gemini-scored batch result. Never set on a report-bearing (deep, on-demand) analysis.
  estimated?: boolean;
  customMessage: string;
  customEmail: string;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  type: JobType;
  // Widened beyond the strict Portal union so manually-tracked jobs can carry a
  // free-typed "Other" source name — scraped jobs always still use a real Portal.
  portal: Portal | string;
  url: string;
  description: string;
  requirements: string[];
  postedAt: string;
  referrer?: Referrer;
  analysis?: JobAnalysis;
  applicantCount?: number;
  companySize?: CompanySize;
}

export type TrackerStage = "Interested" | "Applied" | "Interviewing" | "Offer Received" | "Archived";

export const TRACKER_STAGES: TrackerStage[] = [
  "Interested",
  "Applied",
  "Interviewing",
  "Offer Received",
  "Archived",
];

export interface TrackedJob {
  job: Job;
  stage: TrackerStage;
  addedAt: string;
}

export interface JobSearchCriteria {
  titles: string[];
  locations: string[];
  jobType: JobType | "All";
  sources: Portal[];
}

export interface LinkedInPostAuthor {
  name: string;
  headline?: string;
  profileUrl?: string;
}

export interface LinkedInPostEngagement {
  reactions?: number;
  comments?: number;
  reposts?: number;
}

// A LinkedIn hiring *post* (not a structured job-board listing) normalized into the
// shared Job shape for scoring, plus the extra author/engagement fields the dedicated
// LinkedInPostCard needs for display. Every function that only needs the Job subset
// (JobDetailDrawer, computeTodaysPriority, etc.) works on this unmodified.
export interface LinkedInJob extends Job {
  author: LinkedInPostAuthor;
  engagement?: LinkedInPostEngagement;
  // "structured" = LinkedIn itself attached a job card to the post (title/company/url
  // came straight from that card, zero inference); "classified" = extracted from free
  // post text via the heuristic/Gemini classifier. Surfaced in the UI for transparency.
  postSource: "structured" | "classified";
}

export interface LinkedInPostSearchCriteria {
  titles: string[];
  locations: string[];
}
