import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { searchLinkedInPosts } from "../lib/api";
import type { LinkedInJob } from "../lib/types";
import { useAppState } from "../state/AppContext";
import { useToast } from "./Toast";
import { ComboboxChipInput } from "./ComboboxChipInput";
import { ROLE_SUGGESTIONS, LOCATION_SUGGESTIONS } from "../lib/searchSuggestions";

interface LinkedInPostsSearchPanelProps {
  onResults: (posts: LinkedInJob[]) => void;
}

export function LinkedInPostsSearchPanel({ onResults }: LinkedInPostsSearchPanelProps) {
  const { show } = useToast();
  const { linkedInForm, setLinkedInForm } = useAppState();
  const { titles, locations } = linkedInForm;
  const [loading, setLoading] = useState(false);

  function setTitles(titles: string[]) {
    setLinkedInForm((prev) => ({ ...prev, titles }));
  }
  function setLocations(locations: string[]) {
    setLinkedInForm((prev) => ({ ...prev, locations }));
  }

  async function handleSearch() {
    if (titles.length === 0) {
      show("Add at least one job title to search", "error");
      return;
    }
    setLoading(true);
    try {
      const posts = await searchLinkedInPosts({ titles, locations });
      onResults(posts);
      show(`Found ${posts.length} matching LinkedIn posts`, "success");
    } catch (err) {
      show(err instanceof Error ? err.message : "LinkedIn post search failed", "error");
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
          <p className="text-[11px] text-slate-400">
            Best-effort — matched against post text, since LinkedIn posts don't carry a structured location field. May miss posts that don't mention a location explicitly.
          </p>
        </label>

        <button
          type="button"
          onClick={handleSearch}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
          {loading ? "Searching..." : "Search LinkedIn Posts"}
        </button>
        <p className="text-[11px] text-slate-400">
          Only posts from the last 15 days are fetched. This counts against your Apify and Gemini usage.
        </p>
      </div>
    </div>
  );
}
