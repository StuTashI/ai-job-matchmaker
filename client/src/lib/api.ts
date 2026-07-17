import type { Job, JobAnalysis, JobSearchCriteria, ParsedResume, Referrer } from "./types";

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

export async function matchJob(resume: ParsedResume, job: Job): Promise<JobAnalysis> {
  const res = await fetch("/api/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, job }),
  });
  return handleJson<JobAnalysis>(res);
}

// Chunked so the request body stays small regardless of how many jobs a search returns
// (some sources are uncapped and can return hundreds of results in one search).
const BATCH_CHUNK_SIZE = 150;

export async function batchMatch(resume: ParsedResume, jobs: Job[]): Promise<Record<string, JobAnalysis>> {
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
      const data = await handleJson<{ scores: Record<string, JobAnalysis> }>(res);
      return data.scores;
    }),
  );

  return Object.assign({}, ...chunkResults);
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
