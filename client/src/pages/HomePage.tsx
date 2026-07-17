import { useMemo, useState } from "react";
import type { Job } from "../lib/types";
import { batchMatch } from "../lib/api";
import { filterAndSortJobs, type DateFilter, type SourceFilter, type SortOption } from "../lib/jobFilters";
import { computeTodaysPriority } from "../lib/priority";
import { ResumeUploader } from "../components/ResumeUploader";
import { CareerSummaryCard } from "../components/CareerSummaryCard";
import { JobSearchPanel } from "../components/JobSearchPanel";
import { JobCardGrid } from "../components/JobCardGrid";
import { JobFilterSortBar } from "../components/JobFilterSortBar";
import { JobDetailDrawer } from "../components/JobDetailDrawer";
import { TodaysPriorityBanner } from "../components/TodaysPriorityBanner";
import { useAppState } from "../state/AppContext";
import { useToast } from "../components/Toast";

export function HomePage() {
  const { resume, isTracked, track, jobs, setJobs } = useAppState();
  const { show } = useToast();
  const [scoring, setScoring] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>("any");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("any");
  const [sort, setSort] = useState<SortOption>("score-desc");

  async function handleResults(results: Job[]) {
    setJobs(results);
    if (!resume || results.length === 0) return;
    setScoring(true);
    try {
      const scores = await batchMatch(resume, results);
      setJobs(results.map((job) => ({ ...job, analysis: scores[job.id] ?? job.analysis })));
    } catch (err) {
      show(err instanceof Error ? err.message : "Failed to score matches", "error");
    } finally {
      setScoring(false);
    }
  }

  function handleTrack(job: Job) {
    track(job);
    show("Job added to your tracker", "success");
  }

  const visibleJobs = useMemo(
    () => filterAndSortJobs(jobs, dateFilter, sourceFilter, sort),
    [jobs, dateFilter, sourceFilter, sort],
  );

  const todaysPriority = useMemo(() => computeTodaysPriority(jobs), [jobs]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <ResumeUploader />
      {resume && <CareerSummaryCard resume={resume} />}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
        <div className="min-w-0 lg:sticky lg:top-8 lg:self-start">
          <JobSearchPanel onResults={handleResults} />
        </div>
        <div className="min-w-0">
          {todaysPriority && (
            <TodaysPriorityBanner
              jobs={todaysPriority.jobs}
              reasoning={todaysPriority.reasoning}
              onSelect={setSelectedJob}
            />
          )}
          <JobFilterSortBar
            resultCount={visibleJobs.length}
            dateFilter={dateFilter}
            sourceFilter={sourceFilter}
            sort={sort}
            onDateFilterChange={setDateFilter}
            onSourceFilterChange={setSourceFilter}
            onSortChange={setSort}
          />
          <JobCardGrid
            jobs={visibleJobs}
            hasUnfilteredResults={jobs.length > 0}
            isTracked={isTracked}
            scoring={scoring}
            onAnalyze={setSelectedJob}
            onTrack={handleTrack}
          />
        </div>
      </div>
      <JobDetailDrawer job={selectedJob} onClose={() => setSelectedJob(null)} />
    </div>
  );
}
