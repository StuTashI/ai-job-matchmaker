import { Sparkles } from "lucide-react";
import type { Job } from "../lib/types";

interface TodaysPriorityBannerProps {
  jobs: Job[];
  reasoning: string;
  onSelect: (job: Job) => void;
}

export function TodaysPriorityBanner({ jobs, reasoning, onSelect }: TodaysPriorityBannerProps) {
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles size={16} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-amber-900">Today's Priority</h3>
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        {jobs.map((job) => (
          <button
            key={job.id}
            type="button"
            onClick={() => onSelect(job)}
            className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-left text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100"
          >
            {job.title} · {job.company}
            <span className="ml-1.5 text-xs font-normal text-amber-600">{job.analysis?.matchScore}%</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-amber-700">{reasoning}</p>
    </div>
  );
}
