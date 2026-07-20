import { useMemo, useState } from "react";
import type { Job, LinkedInJob } from "../lib/types";
import { batchMatch } from "../lib/api";
import { filterAndSortJobs, type DateFilter, type SourceFilter, type SortOption } from "../lib/jobFilters";
import {
  filterAndSortPosts,
  type PostAgeFilter,
  type ScoreFilter as LinkedInScoreFilter,
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
  const [dateFilter, setDateFilter] = useState<DateFilter>("any");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("any");
  const [sort, setSort] = useState<SortOption>("score-desc");

  const [linkedInScoring, setLinkedInScoring] = useState(false);
  const [postAgeFilter, setPostAgeFilter] = useState<PostAgeFilter>("any");
  const [linkedInScoreFilter, setLinkedInScoreFilter] = useState<LinkedInScoreFilter>("any");
  const [linkedInSort, setLinkedInSort] = useState<LinkedInSortOption>("score-desc");

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

  async function handleLinkedInResults(results: LinkedInJob[]) {
    setLinkedInPosts(results);
    if (!resume || results.length === 0) return;
    setLinkedInScoring(true);
    try {
      const scores = await batchMatch(resume, results);
      setLinkedInPosts(results.map((post) => ({ ...post, analysis: scores[post.id] ?? post.analysis })));
    } catch (err) {
      show(err instanceof Error ? err.message : "Failed to score matches", "error");
    } finally {
      setLinkedInScoring(false);
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

  const visibleLinkedInPosts = useMemo(
    () => filterAndSortPosts(linkedInPosts, postAgeFilter, linkedInScoreFilter, linkedInSort),
    [linkedInPosts, postAgeFilter, linkedInScoreFilter, linkedInSort],
  );
  const linkedInTodaysPriority = useMemo(() => computeTodaysPriority(linkedInPosts), [linkedInPosts]);

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
            {linkedInTodaysPriority && (
              <TodaysPriorityBanner insight={linkedInTodaysPriority.insight} topJobs={linkedInTodaysPriority.topJobs} />
            )}
            <LinkedInPostFilterBar
              resultCount={visibleLinkedInPosts.length}
              postAgeFilter={postAgeFilter}
              scoreFilter={linkedInScoreFilter}
              sort={linkedInSort}
              onPostAgeFilterChange={setPostAgeFilter}
              onScoreFilterChange={setLinkedInScoreFilter}
              onSortChange={setLinkedInSort}
            />
            <LinkedInPostCardGrid
              posts={visibleLinkedInPosts}
              hasUnfilteredResults={linkedInPosts.length > 0}
              isTracked={isTracked}
              scoring={linkedInScoring}
              onTrack={handleTrack}
            />
          </div>
        </div>
      )}

      <JobDetailDrawer job={selectedJob} onClose={() => setSelectedJob(null)} />
    </div>
  );
}
