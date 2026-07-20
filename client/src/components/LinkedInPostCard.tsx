import { Bookmark, BookmarkCheck, ExternalLink, MessageCircle, Repeat2, ThumbsUp } from "lucide-react";
import type { LinkedInJob } from "../lib/types";
import { formatPostedAt } from "../lib/dateUtils";

const AVATAR_COLORS = [
  "bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-emerald-500", "bg-rose-500", "bg-indigo-500",
];

function avatarColor(name: string): string {
  const seed = name.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return AVATAR_COLORS[seed % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

// A readable summary of the post — emoji/hashtags stripped, whitespace collapsed,
// truncated to a clean sentence/word boundary. Not an AI abstract, just a cleaned
// excerpt of the real post text, so nothing here is invented.
function summarize(text: string, maxLength = 200): string {
  const cleaned = text
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/#\w+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  const truncated = cleaned.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${truncated.slice(0, lastSpace > 0 ? lastSpace : maxLength)}...`;
}

interface LinkedInPostCardProps {
  post: LinkedInJob;
  tracked: boolean;
  onTrack: (job: LinkedInJob) => void;
}

export function LinkedInPostCard({ post, tracked, onTrack }: LinkedInPostCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${avatarColor(post.author.name)}`}>
            {initials(post.author.name) || "?"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-slate-700">{post.author.name}</p>
            {post.author.headline && <p className="truncate text-[11px] text-slate-400">{post.author.headline}</p>}
          </div>
        </div>

        <h3 className="mt-1.5 truncate text-base font-semibold text-slate-900">{post.title}</h3>
        <p className="text-sm text-slate-600">
          {post.company}
          {post.location && post.location !== "Not specified" ? ` · ${post.location}` : ""} · {formatPostedAt(post.postedAt)}
        </p>

        {post.description && <p className="mt-1.5 text-xs text-slate-600">{summarize(post.description)}</p>}

        {post.requirements.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {post.requirements.slice(0, 6).map((req) => (
              <span key={req} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                {req}
              </span>
            ))}
          </div>
        )}

        {post.engagement && (
          <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-slate-400">
            {post.engagement.reactions != null && (
              <span className="flex items-center gap-1"><ThumbsUp size={12} /> {post.engagement.reactions}</span>
            )}
            {post.engagement.comments != null && (
              <span className="flex items-center gap-1"><MessageCircle size={12} /> {post.engagement.comments}</span>
            )}
            {post.engagement.reposts != null && (
              <span className="flex items-center gap-1"><Repeat2 size={12} /> {post.engagement.reposts}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-36">
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          View Post <ExternalLink size={14} />
        </a>
        <button
          type="button"
          onClick={() => onTrack(post)}
          disabled={tracked}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          {tracked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          {tracked ? "Tracked" : "Track"}
        </button>
      </div>
    </div>
  );
}
