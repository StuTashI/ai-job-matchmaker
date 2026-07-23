import { useMemo, useRef, useState } from "react";
import type { Job, JobAnalysis, LinkedInJob, ParsedResume } from "../lib/types";
import { batchMatch } from "../lib/api";
import { filterAndSortJobs, type DateFilter, type SourceFilter, type SortOption } from "../lib/jobFilters";
import {
  filterAndSortPosts,
  type PostAgeFilter,
  type SortOption as LinkedInSortOption,
} from "../lib/linkedInPostFilters";
import { computeTodaysPriority } from "../lib/priority";
import { ResumeUploader } from "../components/ResumeUploader";
import { CareerSummaryCard } from "../components/CareerSummaryCard";
import { JobSearchPanel } from "../components/JobSearchPanel";
import { JobCardGrid } from "../components/JobCardGrid";
import { JobFilterSortBar } from "../components/JobFilterSortBar";
import { LinkedInPostsSearchPanel } from "../components/LinkedInPostsSearchPanel";
import { LinkedInPostCardGrid } from "../components/LinkedInPostCardGrid";
import { LinkedInPostFilterBar } from "../components/LinkedInPostFilterBar";
import { JobDetailDrawer } from "../components/JobDetailDrawer";
import { TodaysPriorityBanner } from "../components/TodaysPriorityBanner";
import { useAppState } from "../state/AppContext";
import { useToast } from "../components/Toast";

type SearchTab = "findJobs" | "linkedinPosts";

export function HomePage() {
  const { resume, isTracked, track, jobs, setJobs, linkedInPosts, setLinkedInPosts } = useAppState();
  const { show } = useToast();
  const [activeTab, setActiveTab] = useState<SearchTab>("findJobs");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const [scoring, setScoring] = useState(false);
  const [scoringUnavailable, setScoringUnavailable] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>("any");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("any");
  const [sort, setSort] = useState<SortOption>("score-desc");

  const [postAgeFilter, setPostAgeFilter] = useState<PostAgeFilter>("any");
  const [linkedInSort, setLinkedInSort] = useState<LinkedInSortOption>("date-desc");

  // Session-lifetime score cache, keyed by job id — avoids re-burning a Gemini call (or a
  // heuristic re-estimate) on a job already scored this session, whether from a prior batch
  // search or a completed deep Analyze report (see handleAnalysisUpdated). Cleared whenever
  // the resume itself changes, since a cached score is only valid for the resume it was
  // computed against.
  const scoreCacheRef = useRef<Map<string, JobAnalysis>>(new Map());
  const cachedForResumeRef = useRef<ParsedResume | null>(null);

  function cacheAndApply(jobId: string, analysis: JobAnalysis) {
    scoreCacheRef.current.set(jobId, analysis);
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, analysis } : j)));
  }

  // Called by JobDetailDrawer once a deep Analyze report succeeds, so the richer,
  // Gemini-scored analysis (report included) replaces whatever coarser batch score was
  // cached for this job, and survives a drawer close/reopen without re-fetching.
  function handleAnalysisUpdated(jobId: string, analysis: JobAnalysis) {
    cacheAndApply(jobId, analysis);
  }

  async function handleResults(results: Job[]) {
    if (cachedForResumeRef.current !== resume) {
      scoreCacheRef.current.clear();
      cachedForResumeRef.current = resume;
    }
    const cache = scoreCacheRef.current;
    setJobs(results.map((job) => ({ ...job, analysis: cache.get(job.id) ?? job.analysis })));
    setScoringUnavailable(false);
    if (!resume || results.length === 0) return;

    const needsScoring = results.filter((job) => !cache.has(job.id));
    if (needsScoring.length === 0) return;

    setScoring(true);
    try {
      const { scores } = await batchMatch(resume, needsScoring);
      for (const [jobId, analysis] of Object.entries(scores)) cache.set(jobId, analysis);
      setJobs(results.map((job) => ({ ...job, analysis: cache.get(job.id) ?? job.analysis })));
    } catch (err) {
      show(err instanceof Error ? err.message : "Failed to score matches", "error");
      setScoringUnavailable(true);
    } finally {
      setScoring(false);
    }
  }

  function handleLinkedInResults(results: LinkedInJob[]) {
    setLinkedInPosts(results);
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

  const visibleLinkedInPosts = useMemo(
    () => filterAndSortPosts(linkedInPosts, postAgeFilter, linkedInSort),
    [linkedInPosts, postAgeFilter, linkedInSort],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <ResumeUploader />
      {resume && <CareerSummaryCard resume={resume} />}

      <div className="flex border-b border-slate-200">
        {([
          { key: "findJobs", label: "Find Jobs" },
          { key: "linkedinPosts", label: "LinkedIn Job Posts" },
        ] as { key: SearchTab; label: string }[]).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "findJobs" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
          <div className="min-w-0 lg:sticky lg:top-8 lg:self-start">
            <JobSearchPanel onResults={handleResults} />
          </div>
          <div className="min-w-0">
            {todaysPriority && (
              <TodaysPriorityBanner insight={todaysPriority.insight} topJobs={todaysPriority.topJobs} onSelect={setSelectedJob} />
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
              scoringUnavailable={scoringUnavailable}
              onAnalyze={setSelectedJob}
              onTrack={handleTrack}
            />
          </div>
        </div>
      )}

      {activeTab === "linkedinPosts" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
          <div className="min-w-0 lg:sticky lg:top-8 lg:self-start">
            <LinkedInPostsSearchPanel onResults={handleLinkedInResults} />
          </div>
          <div className="min-w-0">
            <LinkedInPostFilterBar
              resultCount={visibleLinkedInPosts.length}
              postAgeFilter={postAgeFilter}
              sort={linkedInSort}
              onPostAgeFilterChange={setPostAgeFilter}
              onSortChange={setLinkedInSort}
            />
            <LinkedInPostCardGrid
              posts={visibleLinkedInPosts}
              hasUnfilteredResults={linkedInPosts.length > 0}
              isTracked={isTracked}
              onTrack={handleTrack}
            />
          </div>
        </div>
      )}

      <JobDetailDrawer job={selectedJob} onClose={() => setSelectedJob(null)} onAnalysisUpdated={handleAnalysisUpdated} />
    </div>
  );
}
