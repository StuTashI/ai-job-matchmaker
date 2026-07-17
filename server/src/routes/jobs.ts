import { Router } from "express";
import { env } from "../env.js";
import { runActor } from "../services/apify.js";
import { searchGroundedJobs } from "../services/gemini.js";
import { normalizeActorItems, normalizeGroundingResult } from "../services/jobNormalize.js";
import type { Job, JobSearchCriteria, Portal, SingleTitleCriteria } from "../types.js";

const ALL_PORTALS: Portal[] = ["LinkedIn", "Indeed", "Wellfound", "Naukri", "Flexjobs", "Google"];
const OUTER_TIMEOUT_MS = 90_000;
// Google has no result/page cap, so it can legitimately take longer than the other actors.
const GOOGLE_OUTER_TIMEOUT_MS = 210_000;
const PORTAL_ACTOR_TIMEOUT_MS: Partial<Record<Portal, number>> = { Google: 190_000 };

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

const STOPWORDS = new Set(["a", "an", "the", "of", "and", "or", "for", "to", "in"]);

function relevanceFilter(jobs: Job[], criteria: SingleTitleCriteria): Job[] {
  const tokens = criteria.title
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token && !STOPWORDS.has(token));
  if (tokens.length === 0) return jobs;
  const requiredMatches = Math.floor(tokens.length / 2) + 1;
  return jobs.filter((job) => {
    const haystack = job.title.toLowerCase();
    const matchCount = tokens.filter((token) => haystack.includes(token)).length;
    return matchCount >= requiredMatches;
  });
}

async function groundingFallback(portal: Portal, criteria: SingleTitleCriteria): Promise<Job[]> {
  if (!env.hasGemini) return [];
  try {
    const query = `Find current open job openings for "${criteria.title}" in ${criteria.location} on ${portal}. Include job title, company, direct application link, and a recruiter or hiring contact if available.`;
    const grounding = await searchGroundedJobs(query);
    return normalizeGroundingResult(portal, grounding, criteria.title);
  } catch {
    return [];
  }
}

async function searchPortal(portal: Portal, criteria: SingleTitleCriteria): Promise<Job[]> {
  if (env.hasApify) {
    try {
      const raw = await withTimeout(runActor(portal, criteria), PORTAL_ACTOR_TIMEOUT_MS[portal] ?? 60_000, []);
      const jobs = relevanceFilter(normalizeActorItems(portal, raw), criteria);
      if (jobs.length > 0) return jobs;
    } catch {
      // fall through to grounding fallback
    }
  }
  return groundingFallback(portal, criteria);
}

export const jobsRouter = Router();

jobsRouter.post("/search", async (req, res) => {
  try {
    const body = req.body as Partial<JobSearchCriteria>;
    const titles = (body.titles ?? []).map((t) => t.trim()).filter(Boolean);
    const locations = (body.locations ?? []).map((l) => l.trim()).filter(Boolean);
    const criteria: JobSearchCriteria = {
      titles,
      locations: locations.length > 0 ? locations : ["Bengaluru, Karnataka"],
      jobType: body.jobType ?? "All",
      sources: body.sources && body.sources.length > 0 ? body.sources : ALL_PORTALS,
    };

    if (criteria.titles.length === 0) {
      res.status(400).json({ error: "at least one title is required" });
      return;
    }

    const tasks = criteria.titles.flatMap((title) =>
      criteria.locations.flatMap((location) =>
        criteria.sources.map((portal) => {
          const singleCriteria: SingleTitleCriteria = { title, location, jobType: criteria.jobType };
          const outerTimeout = portal === "Google" ? GOOGLE_OUTER_TIMEOUT_MS : OUTER_TIMEOUT_MS;
          return withTimeout(searchPortal(portal, singleCriteria), outerTimeout, []);
        }),
      ),
    );

    const settled = await Promise.allSettled(tasks);

    let jobs = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));

    if (criteria.jobType !== "All") {
      jobs = jobs.filter((job) => job.type === criteria.jobType);
    }

    const seen = new Set<string>();
    jobs = jobs.filter((job) => {
      if (seen.has(job.id)) return false;
      seen.add(job.id);
      return true;
    });

    res.json({ jobs });
  } catch {
    res.status(500).json({ error: "Failed to search jobs" });
  }
});
