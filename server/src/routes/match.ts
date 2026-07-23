import { Router } from "express";
import { env } from "../env.js";
import { generateStructured } from "../services/gemini.js";
import {
  assembleListAnalysis,
  assembleReportAnalysis,
  BATCH_SCORE_SCHEMA,
  type BatchScoreResult,
  buildBatchScorePrompt,
  buildDeepReportPrompt,
  DEEP_REPORT_SCHEMA,
  type DeepReportGeminiResponse,
  estimateDimensionsHeuristic,
} from "../services/matchScoring.js";
import type { DimensionKey, Job, JobAnalysis, ParsedResume } from "../types.js";

const DIMENSION_KEYS: DimensionKey[] = [
  "skillExperienceOverlap",
  "domainIndustryMatch",
  "roleSeniorityMatch",
  "quantifiedImpactStrength",
  "atsKeywordCoverage",
  "ownershipScopeMatch",
];

function extractDimensions(source: Record<DimensionKey, number>): Record<DimensionKey, number> {
  const dims = {} as Record<DimensionKey, number>;
  for (const key of DIMENSION_KEYS) dims[key] = source[key];
  return dims;
}

export const matchRouter = Router();

// No deterministic fallback exists for this route — evidence-traced 0-5 scoring with
// resume-line citations can't be meaningfully approximated by a keyword heuristic, so an
// unconfigured/failed Gemini call surfaces as a clear "unavailable" response instead of a
// fabricated report.
matchRouter.post("/", async (req, res) => {
  try {
    const { resume, job } = req.body as { resume: ParsedResume; job: Job };
    if (!resume || !job) {
      res.status(400).json({ error: "resume and job are required" });
      return;
    }

    if (!env.hasGemini) {
      res.status(503).json({ error: "unavailable", reason: "gemini_not_configured" });
      return;
    }

    try {
      const raw = await generateStructured<DeepReportGeminiResponse>(buildDeepReportPrompt(resume, job), DEEP_REPORT_SCHEMA, 35_000);
      const { verdict, whatsGood, whatsBad, needsImprovement, skillGaps, suggestedImprovements, doThis, dontDoThis, ...dims } = raw;
      const analysis = assembleReportAnalysis(
        extractDimensions(dims),
        { verdict, whatsGood, whatsBad, needsImprovement, skillGaps, suggestedImprovements, doThis, dontDoThis },
        job,
      );
      res.json(analysis);
    } catch {
      res.status(503).json({ error: "unavailable", reason: "gemini_failed" });
    }
  } catch {
    res.status(500).json({ error: "Failed to score match" });
  }
});

// Batches every job from one search into a SINGLE Gemini call (never one call per job) —
// the whole point is capping list-view scoring to 1 call/search against a free-tier quota
// as low as ~20 requests/day, shared across every AI feature in this app. That quota is
// easy to exhaust in real use (a single large search can burn most of a day's budget), so
// unlike the deep report, this route always returns a real score for every job: any job
// Gemini didn't score (unconfigured, call failed/timed out, quota exhausted, or a
// malformed/missing entry in the response) falls back to `estimateDimensionsHeuristic()` —
// a coarse local estimate, marked `estimated: true` so the UI can show it as such rather
// than presenting a guess as if it were the real thing.
matchRouter.post("/batch", async (req, res) => {
  try {
    const { resume, jobs } = req.body as { resume: ParsedResume; jobs: Job[] };
    if (!resume || !Array.isArray(jobs)) {
      res.status(400).json({ error: "resume and jobs are required" });
      return;
    }

    if (jobs.length === 0) {
      res.json({ scores: {} });
      return;
    }

    const scores: Record<string, JobAnalysis> = {};

    if (env.hasGemini) {
      try {
        const { results } = await generateStructured<{ results: BatchScoreResult[] }>(
          buildBatchScorePrompt(resume, jobs),
          BATCH_SCORE_SCHEMA,
          45_000,
        );
        for (const result of results) {
          const job = jobs[result.index];
          if (!job) continue;
          try {
            scores[job.id] = assembleListAnalysis(extractDimensions(result), job);
          } catch {
            // One malformed entry shouldn't drop the rest of the batch — the heuristic
            // fallback loop below covers this job instead.
          }
        }
      } catch {
        // The whole call failed (quota exhausted, timeout, etc) — every job in this batch
        // falls through to the heuristic estimate below instead of coming back unscored.
      }
    }

    for (const job of jobs) {
      if (scores[job.id]) continue;
      try {
        scores[job.id] = assembleListAnalysis(estimateDimensionsHeuristic(resume, job), job, true);
      } catch {
        // Leave this one job unscored rather than failing the whole batch.
      }
    }

    res.json({ scores });
  } catch {
    res.status(500).json({ error: "Failed to batch score matches" });
  }
});
