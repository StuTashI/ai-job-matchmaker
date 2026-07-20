import { Bookmark, BookmarkCheck, Briefcase, Calendar, MapPin } from "lucide-react";
import type { Job } from "../lib/types";
import { formatPostedAt } from "../lib/dateUtils";

const PORTAL_COLORS: Record<string, string> = {
  LinkedIn: "bg-sky-100 text-sky-700",
  Indeed: "bg-blue-100 text-blue-700",
  Wellfound: "bg-violet-100 text-violet-700",
  Naukri: "bg-amber-100 text-amber-700",
  Flexjobs: "bg-emerald-100 text-emerald-700",
  Google: "bg-rose-100 text-rose-700",
};
const DEFAULT_PORTAL_COLOR = "bg-slate-100 text-slate-600";

function scoreColor(score: number): string {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 55) return "bg-amber-500";
  return "bg-rose-500";
}

interface JobCardProps {
  job: Job;
  tracked: boolean;
  scoring: boolean;
  onAnalyze: (job: Job) => void;
  onTrack: (job: Job) => void;
}

export function JobCard({ job, tracked, scoring, onAnalyze, onTrack }: JobCardProps) {
  const score = job.analysis?.matchScore;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center">
      <div className="flex shrink-0 items-center justify-center sm:w-16">
        {scoring ? (
          <div className="h-11 w-11 animate-pulse rounded-full bg-slate-200" />
        ) : score != null ? (
          <span className={`flex h-11 w-11 items-center justify-center rounded-full text-xs font-bold text-white ${scoreColor(score)}`}>
            {score}%
          </span>
        ) : (
          <span className="text-center text-[10px] text-slate-400">No score</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PORTAL_COLORS[job.portal] ?? DEFAULT_PORTAL_COLOR}`}>{job.portal}</span>
          <h3 className="truncate text-base font-semibold text-slate-900">{job.title}</h3>
        </div>
        <p className="text-sm text-slate-600">{job.company}</p>
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <MapPin size={14} /> {job.location || "Not specified"}
          </span>
          <span className="flex items-center gap-1">
            <Briefcase size={14} /> {job.type}
          </span>
          <span className="flex items-center gap-1">
            <Calendar size={14} /> {formatPostedAt(job.postedAt)}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onAnalyze(job)}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          Analyze
        </button>
        <button
          type="button"
          onClick={() => onTrack(job)}
          disabled={tracked}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          {tracked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          {tracked ? "Tracked" : "Track"}
        </button>
      </div>
    </div>
  );
}
