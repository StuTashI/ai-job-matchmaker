import type { LinkedInJob } from "./types";
import { parsePostedAt } from "./dateUtils";

export type PostAgeFilter = "any" | "1d" | "3d" | "7d" | "10d" | "15d";
export type SortOption = "date-desc" | "date-asc";

export const POST_AGE_FILTER_OPTIONS: { value: PostAgeFilter; label: string }[] = [
  { value: "any", label: "Any time (up to 15 days)" },
  { value: "1d", label: "Last 1 day" },
  { value: "3d", label: "Last 3 days" },
  { value: "7d", label: "Last 7 days" },
  { value: "10d", label: "Last 10 days" },
  { value: "15d", label: "Last 15 days" },
];

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
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

function matchesPostAgeFilter(postedAt: string, filter: PostAgeFilter): boolean {
  if (filter === "any") return true;
  const ts = parsePostedAt(postedAt);
  if (ts == null) return false;
  return Date.now() - ts <= POST_AGE_FILTER_MS[filter];
}

export function filterAndSortPosts(posts: LinkedInJob[], postAgeFilter: PostAgeFilter, sort: SortOption): LinkedInJob[] {
  const filtered = posts.filter((post) => matchesPostAgeFilter(post.postedAt, postAgeFilter));

  const sorted = [...filtered].sort((a, b) => {
    const dateA = parsePostedAt(a.postedAt);
    const dateB = parsePostedAt(b.postedAt);
    if (dateA == null && dateB == null) return 0;
    if (dateA == null) return 1;
    if (dateB == null) return -1;
    return sort === "date-desc" ? dateB - dateA : dateA - dateB;
  });

  return sorted;
}
