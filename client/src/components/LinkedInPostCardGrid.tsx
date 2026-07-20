import type { LinkedInJob } from "../lib/types";
import { LinkedInPostCard } from "./LinkedInPostCard";

interface LinkedInPostCardGridProps {
  posts: LinkedInJob[];
  hasUnfilteredResults?: boolean;
  isTracked: (jobId: string) => boolean;
  scoring: boolean;
  onTrack: (job: LinkedInJob) => void;
}

export function LinkedInPostCardGrid({ posts, hasUnfilteredResults, isTracked, scoring, onTrack }: LinkedInPostCardGridProps) {
  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
        {hasUnfilteredResults
          ? "No posts match your current filters — try widening the post-age range or score threshold."
          : "No posts yet — run a search to see matching LinkedIn hiring posts."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {posts.map((post) => (
        <LinkedInPostCard key={post.id} post={post} tracked={isTracked(post.id)} scoring={scoring} onTrack={onTrack} />
      ))}
    </div>
  );
}
