import type { Job, Portal } from "./types";
import { parsePostedAt } from "./dateUtils";

export type DateFilter = "any" | "24h" | "3d" | "7d" | "14d" | "30d";
export type SourceFilter = "any" | Portal;
export type SortOption = "score-desc" | "score-asc" | "date-desc" | "date-asc";

export const DATE_FILTER_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "24h", label: "Last 24 hours" },
  { value: "3d", label: "Last 3 days" },
  { value: "7d", label: "Last 7 days" },
  { value: "14d", label: "Last 14 days" },
  { value: "30d", label: "Last 30 days" },
];

const ALL_PORTALS: Portal[] = ["LinkedIn", "Indeed", "Wellfound", "Naukri", "Flexjobs", "Google"];

export const SOURCE_FILTER_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: "any", label: "All sources" },
  ...ALL_PORTALS.map((portal) => ({ value: portal as SourceFilter, label: portal })),
];

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "score-desc", label: "Match Score (High to Low)" },
  { value: "score-asc", label: "Match Score (Low to High)" },
  { value: "date-desc", label: "Date Posted (Newest)" },
  { value: "date-asc", label: "Date Posted (Oldest)" },
];

const DATE_FILTER_MS: Record<Exclude<DateFilter, "any">, number> = {
  "24h": 1 * 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "14d": 14 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

function matchesSourceFilter(portal: Portal, filter: SourceFilter): boolean {
  if (filter === "any") return true;
  return portal === filter;
}

function matchesDateFilter(postedAt: string, filter: DateFilter): boolean {
  if (filter === "any") return true;
  const ts = parsePostedAt(postedAt);
  if (ts == null) return false;
  return Date.now() - ts <= DATE_FILTER_MS[filter];
}

export function filterAndSortJobs(
  jobs: Job[],
  dateFilter: DateFilter,
  sourceFilter: SourceFilter,
  sort: SortOption,
): Job[] {
  const filtered = jobs.filter(
    (job) => matchesDateFilter(job.postedAt, dateFilter) && matchesSourceFilter(job.portal, sourceFilter),
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
