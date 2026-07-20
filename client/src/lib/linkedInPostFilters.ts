import type { LinkedInJob } from "./types";
import { parsePostedAt } from "./dateUtils";

export type PostAgeFilter = "any" | "1d" | "3d" | "7d" | "10d" | "15d";
export type ScoreFilter = "any" | "90-100" | "80-89" | "70-79" | "60-69" | "below-60";
export type SortOption = "score-desc" | "score-asc" | "date-desc" | "date-asc";

export const POST_AGE_FILTER_OPTIONS: { value: PostAgeFilter; label: string }[] = [
  { value: "any", label: "Any time (up to 15 days)" },
  { value: "1d", label: "Last 1 day" },
  { value: "3d", label: "Last 3 days" },
  { value: "7d", label: "Last 7 days" },
  { value: "10d", label: "Last 10 days" },
  { value: "15d", label: "Last 15 days" },
];

// Recreated here scoped to this tab only — the main Search tab deliberately dropped its
// score filter in favor of a Source filter; this tab has no Source filter (LinkedIn-only)
// so a score filter is the more useful axis here instead.
export const SCORE_FILTER_OPTIONS: { value: ScoreFilter; label: string }[] = [
  { value: "any", label: "All scores" },
  { value: "90-100", label: "90% - 100%" },
  { value: "80-89", label: "80% - 89%" },
  { value: "70-79", label: "70% - 79%" },
  { value: "60-69", label: "60% - 69%" },
  { value: "below-60", label: "Below 60%" },
];

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "score-desc", label: "Match Score (High to Low)" },
  { value: "score-asc", label: "Match Score (Low to High)" },
  { value: "date-desc", label: "Post Date (Newest)" },
  { value: "date-asc", label: "Post Date (Oldest)" },
];

const POST_AGE_FILTER_MS: Record<Exclude<PostAgeFilter, "any">, number> = {
  "1d": 1 * 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "10d": 10 * 24 * 60 * 60 * 1000,
  "15d": 15 * 24 * 60 * 60 * 1000,
};

function matchesScoreFilter(score: number | undefined, filter: ScoreFilter): boolean {
  if (filter === "any") return true;
  if (score == null) return false;
  switch (filter) {
    case "90-100":
      return score >= 90;
    case "80-89":
      return score >= 80 && score <= 89;
    case "70-79":
      return score >= 70 && score <= 79;
    case "60-69":
      return score >= 60 && score <= 69;
    case "below-60":
      return score < 60;
  }
}

function matchesPostAgeFilter(postedAt: string, filter: PostAgeFilter): boolean {
  if (filter === "any") return true;
  const ts = parsePostedAt(postedAt);
  if (ts == null) return false;
  return Date.now() - ts <= POST_AGE_FILTER_MS[filter];
}

export function filterAndSortPosts(
  posts: LinkedInJob[],
  postAgeFilter: PostAgeFilter,
  scoreFilter: ScoreFilter,
  sort: SortOption,
): LinkedInJob[] {
  const filtered = posts.filter(
    (post) => matchesPostAgeFilter(post.postedAt, postAgeFilter) && matchesScoreFilter(post.analysis?.matchScore, scoreFilter),
  );

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "score-desc" || sort === "score-asc") {
      const scoreA = a.analysis?.matchScore;
      const scoreB = b.analysis?.matchScore;
      if (scoreA == null && scoreB == null) return 0;
      if (scoreA == null) return 1;
      if (scoreB == null) return -1;
      return sort === "score-desc" ? scoreB - scoreA : scoreA - scoreB;
    }
    const dateA = parsePostedAt(a.postedAt);
    const dateB = parsePostedAt(b.postedAt);
    if (dateA == null && dateB == null) return 0;
    if (dateA == null) return 1;
    if (dateB == null) return -1;
    return sort === "date-desc" ? dateB - dateA : dateA - dateB;
  });

  return sorted;
}
