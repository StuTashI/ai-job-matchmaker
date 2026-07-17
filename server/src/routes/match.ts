import { Router } from "express";
import { env } from "../env.js";
import { generateStructured } from "../services/gemini.js";
import { scoreMatchFallback } from "../services/matchFallback.js";
import { totalYearsOfExperience } from "../services/resumeFallback.js";
import {
  buildSignalsPrompt,
  computeScores,
  SIGNALS_SCHEMA,
  type GeminiSignals,
  type ScoringSignals,
} from "../services/scoringSignals.js";
import type { Job, JobAnalysis, ParsedResume } from "../types.js";

async function scoreViaGemini(resume: ParsedResume, job: Job): Promise<JobAnalysis> {
  // Longer budget than the default: this call now also writes guidance prose
  // (why/doThis), not just classifying structured signals.
  const { why, doThis, ...geminiSignals } = await generateStructured<GeminiSignals>(
    buildSignalsPrompt(resume, job),
    SIGNALS_SCHEMA,
    25_000,
  );
  const signals: ScoringSignals = {
    ...geminiSignals,
    jobTitle: job.title,
    company: job.company,
    yearsExperience: totalYearsOfExperience(resume.experience),
    applicantCount: job.applicantCount,
    companySize: job.companySize,
    noticePeriodMonths: resume.noticePeriodMonths,
  };
  return computeScores(signals, { why, doThis });
}

export const matchRouter = Router();

matchRouter.post("/", async (req, res) => {
  try {
    const { resume, job } = req.body as { resume: ParsedResume; job: Job };
    if (!resume || !job) {
      res.status(400).json({ error: "resume and job are required" });
      return;
    }

    if (env.hasGemini) {
      try {
        const scored = await scoreViaGemini(resume, job);
        res.json(scored);
        return;
      } catch {
        // fall through to local heuristic
      }
    }

    res.json(scoreMatchFallback(resume, job));
  } catch {
    res.status(500).json({ error: "Failed to score match" });
  }
});

matchRouter.post("/batch", (req, res) => {
  try {
    const { resume, jobs } = req.body as { resume: ParsedResume; jobs: Job[] };
    if (!resume || !Array.isArray(jobs)) {
      res.status(400).json({ error: "resume and jobs are required" });
      return;
    }

    const scores: Record<string, JobAnalysis> = {};
    for (const job of jobs) {
      scores[job.id] = scoreMatchFallback(resume, job);
    }
    res.json({ scores });
  } catch {
    res.status(500).json({ error: "Failed to batch score matches" });
  }
});
