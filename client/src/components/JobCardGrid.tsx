import type { Job } from "../lib/types";
import { JobCard } from "./JobCard";

interface JobCardGridProps {
  jobs: Job[];
  hasUnfilteredResults?: boolean;
  isTracked: (jobId: string) => boolean;
  scoring: boolean;
  scoringUnavailable: boolean;
  onAnalyze: (job: Job) => void;
  onTrack: (job: Job) => void;
}

export function JobCardGrid({ jobs, hasUnfilteredResults, isTracked, scoring, scoringUnavailable, onAnalyze, onTrack }: JobCardGridProps) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
        {hasUnfilteredResults
          ? "No jobs match your current filters — try widening the date or match score range."
          : "No jobs yet — run a search to see matching roles."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          tracked={isTracked(job.id)}
          scoring={scoring}
          scoringUnavailable={scoringUnavailable}
          onAnalyze={onAnalyze}
          onTrack={onTrack}
        />
      ))}
    </div>
  );
}
