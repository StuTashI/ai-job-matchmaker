import type { Job, JobAnalysis, JobSearchCriteria, LinkedInJob, LinkedInPostSearchCriteria, ParsedResume, Referrer } from "./types";

async function handleJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function parseResume(file: File): Promise<ParsedResume> {
  const formData = new FormData();
  formData.append("resume", file);
  const res = await fetch("/api/resume/parse", { method: "POST", body: formData });
  return handleJson<ParsedResume>(res);
}

export async function searchJobs(criteria: JobSearchCriteria): Promise<Job[]> {
  const res = await fetch("/api/jobs/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(criteria),
  });
  const data = await handleJson<{ jobs: Job[] }>(res);
  return data.jobs;
}

export async function searchLinkedInPosts(criteria: LinkedInPostSearchCriteria): Promise<LinkedInJob[]> {
  const res = await fetch("/api/linkedin-posts/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(criteria),
  });
  const data = await handleJson<{ jobs: LinkedInJob[] }>(res);
  return data.jobs;
}

// Doesn't reuse handleJson — this route's 503 body carries a `reason` (gemini_not_configured
// vs gemini_failed) that's worth surfacing as a specific, actionable message instead of the
// generic word "unavailable", since there's no fallback here and the user needs to know
// whether to configure a key or just wait out the free-tier daily quota.
export async function matchJob(resume: ParsedResume, job: Job): Promise<JobAnalysis> {
  const res = await fetch("/api/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, job }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body.reason === "gemini_not_configured") {
      throw new Error("Gemini isn't configured — add a key on the Configuration page to unlock the deep report.");
    }
    if (body.reason === "gemini_failed") {
      throw new Error(
        "The Gemini call failed or timed out — this is often the free-tier daily quota (as low as 20 requests/day, shared across every AI feature in this app) being exhausted. Try again later, or add a different key on the Configuration page.",
      );
    }
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<JobAnalysis>;
}

// Chunked so the request body stays small regardless of how many jobs a search returns
// (some sources are uncapped and can return hundreds of results in one search). Each chunk
// is scored via a single batched Gemini call server-side — a >150-result search costing 2+
// Gemini calls instead of 1 is a known, accepted edge case, not something engineered around.
const BATCH_CHUNK_SIZE = 150;

export interface BatchMatchResult {
  scores: Record<string, JobAnalysis>;
}

// Server-side, every job in the response gets a real score — either Gemini-scored, or a
// heuristic estimate (marked `analysis.estimated`) if Gemini was unavailable/failed/out of
// quota. `unavailable` no longer exists here for that reason; a rejected promise below means
// the request itself failed (network/server error), not a Gemini-side failure.
export async function batchMatch(resume: ParsedResume, jobs: Job[]): Promise<BatchMatchResult> {
  const chunks: Job[][] = [];
  for (let i = 0; i < jobs.length; i += BATCH_CHUNK_SIZE) {
    chunks.push(jobs.slice(i, i + BATCH_CHUNK_SIZE));
  }

  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      const res = await fetch("/api/match/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume, jobs: chunk }),
      });
      return handleJson<{ scores: Record<string, JobAnalysis> }>(res);
    }),
  );

  return { scores: Object.assign({}, ...chunkResults.map((r) => r.scores)) };
}

export interface OutreachResult {
  customMessage: string;
  customEmail: string;
  referrer: Referrer;
}

export async function getOutreach(resume: ParsedResume, job: Job): Promise<OutreachResult> {
  const res = await fetch("/api/outreach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, job }),
  });
  return handleJson<OutreachResult>(res);
}

export interface RegenerateOutreachResult {
  text: string;
  usedAi: boolean;
}

export async function regenerateOutreach(
  resume: ParsedResume,
  job: Job,
  channel: "message" | "email",
  previous: string,
  variant: number,
): Promise<RegenerateOutreachResult> {
  const res = await fetch("/api/outreach/regenerate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, job, channel, previous, variant }),
  });
  return handleJson<RegenerateOutreachResult>(res);
}

export interface ConfigStatus {
  hasGemini: boolean;
  hasApify: boolean;
  geminiKeyPreview: string | null;
  apifyTokenPreview: string | null;
}

export async function getConfigStatus(): Promise<ConfigStatus> {
  const res = await fetch("/api/config");
  return handleJson<ConfigStatus>(res);
}

export async function saveConfig(updates: { geminiApiKey?: string; apifyToken?: string }): Promise<ConfigStatus> {
  const res = await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  return handleJson<ConfigStatus>(res);
}
