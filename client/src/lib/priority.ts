import type { GuidancePath, Job } from "./types";

export interface PriorityInsight {
  insight: string;
  topJobs: Job[];
}

const STRONG_MATCH_THRESHOLD = 80;

const PATH_PHRASES: Partial<Record<GuidancePath, (count: number) => string>> = {
  apply_standard: (n) => `${n} ready to apply directly`,
  apply_referral: (n) => `${n} worth applying while also seeking a referral`,
  referral_first: (n) => `${n} best approached via a referral first`,
  reframe_then_apply: (n) => `${n} worth reframing your pitch on before applying`,
  skip: (n) => `${n} probably worth skipping`,
};

/**
 * Batch-level guidance instruction: this is meant to read as an aggregate insight about
 * today's batch ("X jobs look like strong matches, split Y ready-to-apply / Z
 * referral-first"), not as a directive to go apply to one specific named job — the
 * per-job guidance object already carries that nuance, this banner just summarizes it.
 */
export function computeTodaysPriority(jobs: Job[]): PriorityInsight | null {
  const scored = jobs.filter((j) => j.analysis?.guidance);
  if (scored.length === 0) return null;

  const strong = scored.filter((j) => j.analysis!.matchScore >= STRONG_MATCH_THRESHOLD);

  if (strong.length === 0) {
    const best = [...scored].sort((a, b) => b.analysis!.matchScore - a.analysis!.matchScore)[0];
    return {
      insight: `None of today's ${scored.length} scored ${scored.length === 1 ? "job" : "jobs"} cleared a strong-match bar (${STRONG_MATCH_THRESHOLD}%+) — the highest is ${best.analysis!.matchScore}%. Worth a second look before committing outreach effort here today.`,
      topJobs: [],
    };
  }

  const pathCounts = strong.reduce<Partial<Record<GuidancePath, number>>>((acc, j) => {
    const path = j.analysis!.guidance.path;
    acc[path] = (acc[path] ?? 0) + 1;
    return acc;
  }, {});

  const breakdown = (Object.keys(pathCounts) as GuidancePath[])
    .map((path) => PATH_PHRASES[path]?.(pathCounts[path]!))
    .filter((phrase): phrase is string => Boolean(phrase))
    .join(", ");

  const lowCompetitionCount = strong.filter((j) => j.applicantCount != null && j.applicantCount < 30).length;
  const competitionNote = lowCompetitionCount > 0 ? ` ${lowCompetitionCount} also have lower applicant competition.` : "";

  const insight = `${strong.length} ${strong.length === 1 ? "job" : "jobs"} in this batch ${strong.length === 1 ? "looks" : "look"} like a strong match (${STRONG_MATCH_THRESHOLD}%+)${breakdown ? ` — ${breakdown}.` : "."}${competitionNote}`;

  const actionable = strong.filter((j) => j.analysis!.guidance.path !== "skip");
  const pool = actionable.length > 0 ? actionable : strong;
  const topJobs = [...pool]
    .sort((a, b) => {
      const scoreDiff = b.analysis!.matchScore - a.analysis!.matchScore;
      if (scoreDiff !== 0) return scoreDiff;
      const aApplicants = a.applicantCount ?? Number.MAX_SAFE_INTEGER;
      const bApplicants = b.applicantCount ?? Number.MAX_SAFE_INTEGER;
      return aApplicants - bApplicants;
    })
    .slice(0, 2);

  return { insight, topJobs };
}
