import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { searchJobs } from "../lib/api";
import type { Job, JobType, Portal } from "../lib/types";
import { useAppState } from "../state/AppContext";
import { useToast } from "./Toast";
import { ComboboxChipInput } from "./ComboboxChipInput";
import { ROLE_SUGGESTIONS, LOCATION_SUGGESTIONS } from "../lib/searchSuggestions";

const ALL_PORTALS: Portal[] = ["LinkedIn", "Indeed", "Wellfound", "Naukri", "Flexjobs", "Google"];
const JOB_TYPES: (JobType | "All")[] = ["All", "Remote", "Hybrid", "In Office"];

interface JobSearchPanelProps {
  onResults: (jobs: Job[]) => void;
}

export function JobSearchPanel({ onResults }: JobSearchPanelProps) {
  const { show } = useToast();
  const { form, setForm } = useAppState();
  const { titles, locations, jobType, sources } = form;
  const [loading, setLoading] = useState(false);

  function setTitles(titles: string[]) {
    setForm((prev) => ({ ...prev, titles }));
  }
  function setLocations(locations: string[]) {
    setForm((prev) => ({ ...prev, locations }));
  }
  function setJobType(jobType: JobType | "All") {
    setForm((prev) => ({ ...prev, jobType }));
  }
  function toggleSource(portal: Portal) {
    setForm((prev) => ({
      ...prev,
      sources: prev.sources.includes(portal) ? prev.sources.filter((p) => p !== portal) : [...prev.sources, portal],
    }));
  }

  async function handleSearch() {
    if (titles.length === 0) {
      show("Add at least one job title to search", "error");
      return;
    }
    setLoading(true);
    try {
      const jobs = await searchJobs({ titles, locations, jobType, sources });
      onResults(jobs);
      show(`Found ${jobs.length} matching jobs`, "success");
    } catch (err) {
      show(err instanceof Error ? err.message : "Job search failed", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="space-y-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Job Title / Role</span>
          <ComboboxChipInput
            values={titles}
            onChange={setTitles}
            suggestions={ROLE_SUGGESTIONS}
            placeholder="Search or type a role"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Location</span>
          <ComboboxChipInput
            values={locations}
            onChange={setLocations}
            suggestions={LOCATION_SUGGESTIONS}
            placeholder="Search or type a location"
          />
        </label>

        <div>
          <span className="text-sm font-medium text-slate-700">Job Type</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {JOB_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setJobType(type)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  jobType === type
                    ? "border-indigo-500 bg-indigo-500 text-white"
                    : "border-slate-300 text-slate-600 hover:border-indigo-300"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="text-sm font-medium text-slate-700">Sources</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {ALL_PORTALS.map((portal) => (
              <label
                key={portal}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  sources.includes(portal)
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-300 text-slate-600"
                }`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={sources.includes(portal)}
                  onChange={() => toggleSource(portal)}
                />
                {portal}
              </label>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSearch}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
          {loading ? "Searching..." : "Search Jobs"}
        </button>
      </div>
    </div>
  );
}
