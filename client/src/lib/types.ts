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

export interface JobAnalysis {
  matchScore: number;
  gaps: string[];
  improvements: string[];
  guidance: JobGuidance;
  customMessage: string;
  customEmail: string;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  type: JobType;
  portal: Portal;
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
