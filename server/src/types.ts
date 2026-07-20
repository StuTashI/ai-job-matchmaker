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
  // Widened beyond the strict Portal union so manually-tracked jobs (client-only,
  // never sent through the scraping pipeline) can carry a free-typed "Other" source name.
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
// (scoringSignals.ts, matchFallback.ts, outreach) works on this unmodified.
export interface LinkedInJob extends Job {
  author: LinkedInPostAuthor;
  engagement?: LinkedInPostEngagement;
  // "structured" = LinkedIn itself attached a job card to the post (title/company/url
  // came straight from that card, zero inference); "classified" = extracted from free
  // post text via the heuristic/Gemini classifier. Surfaced in the UI for transparency.
  postSource: "structured" | "classified";
}

export interface JobSearchCriteria {
  titles: string[];
  locations: string[];
  jobType: JobType | "All";
  sources: Portal[];
}

export interface SingleTitleCriteria {
  title: string;
  location: string;
  jobType: JobType | "All";
}

export interface LinkedInPostSearchCriteria {
  titles: string[];
  locations: string[];
}
