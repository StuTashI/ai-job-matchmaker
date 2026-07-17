import type { Job, JobAnalysis, ParsedResume } from "../types.js";
import { computeScores, extractSignalsHeuristic } from "./scoringSignals.js";

export function scoreMatchFallback(resume: ParsedResume, job: Job): JobAnalysis {
  const signals = extractSignalsHeuristic(resume, job);
  return computeScores(signals);
}
