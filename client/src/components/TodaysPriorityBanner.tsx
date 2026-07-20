import { Sparkles } from "lucide-react";
import type { Job } from "../lib/types";

interface TodaysPriorityBannerProps {
  insight: string;
  topJobs: Job[];
  onSelect?: (job: Job) => void;
}

export function TodaysPriorityBanner({ insight, topJobs, onSelect }: TodaysPriorityBannerProps) {
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="mb-1.5 flex items-center gap-2">
        <Sparkles size={16} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-amber-900">Today's Priority</h3>
      </div>
      <p className="text-sm text-amber-800">{insight}</p>
      {topJobs.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-amber-600">Top picks</span>
          {topJobs.map((job) =>
            onSelect ? (
              <button
                key={job.id}
                type="button"
                onClick={() => onSelect(job)}
                className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-left text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100"
              >
                {job.title} · {job.company}
                <span className="ml-1.5 font-normal text-amber-600">{job.analysis?.matchScore}%</span>
              </button>
            ) : (
              <span
                key={job.id}
                className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-left text-xs font-medium text-amber-900"
              >
                {job.title} · {job.company}
                <span className="ml-1.5 font-normal text-amber-600">{job.analysis?.matchScore}%</span>
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
