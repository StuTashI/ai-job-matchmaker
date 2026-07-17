import type { Job } from "./types";

export interface PriorityPick {
  jobs: Job[];
  reasoning: string;
}

/**
 * Batch-level guidance instruction: don't just list scores for every job with
 * equal weight — surface the 1-2 jobs worth spending today's limited outreach
 * effort on, preferring an actionable path over a raw high score.
 */
export function computeTodaysPriority(jobs: Job[]): PriorityPick | null {
  const scored = jobs.filter((j) => j.analysis?.guidance);
  if (scored.length === 0) return null;

  const actionable = scored.filter((j) => j.analysis!.guidance.path !== "skip");
  const pool = actionable.length > 0 ? actionable : scored;

  const sorted = [...pool].sort((a, b) => {
    const scoreDiff = b.analysis!.matchScore - a.analysis!.matchScore;
    if (scoreDiff !== 0) return scoreDiff;
    const aApplicants = a.applicantCount ?? Number.MAX_SAFE_INTEGER;
    const bApplicants = b.applicantCount ?? Number.MAX_SAFE_INTEGER;
    return aApplicants - bApplicants;
  });

  const picks = sorted.slice(0, 2);
  if (picks.length === 0) return null;

  const scoresText = picks.map((p) => `${p.analysis!.matchScore}%`).join(", ");
  const hasLowCompetition = picks.some((p) => p.applicantCount != null && p.applicantCount < 30);

  const reasoning =
    actionable.length > 0
      ? `Best relevancy-to-effort ratio in this batch${hasLowCompetition ? ", with lower applicant competition" : ""} — highest match scores (${scoresText}) that also have a clear actionable path, rather than a "skip."`
      : `These scored highest in this batch (${scoresText}), though none currently have a strong recommended path — worth a second look before committing outreach effort elsewhere.`;

  return { jobs: picks, reasoning };
}
