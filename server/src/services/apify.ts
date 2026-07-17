import { ApifyClient } from "apify-client";
import { env, onKeysUpdated } from "../env.js";
import type { Portal, SingleTitleCriteria } from "../types.js";

let client: ApifyClient | null = env.hasApify ? new ApifyClient({ token: env.apifyToken }) : null;

onKeysUpdated(() => {
  client = env.hasApify ? new ApifyClient({ token: env.apifyToken }) : null;
});

export const ACTORS: Record<Portal, string> = {
  LinkedIn: "curious_coder/linkedin-jobs-scraper",
  Indeed: "valig/indeed-jobs-scraper",
  Naukri: "blackfalcondata/naukri-jobs-feed",
  Wellfound: "crawlerbros/wellfound-scraper",
  Flexjobs: "shahidirfan/flexjobs-scraper",
  Google: "johnvc/Google-Jobs-Scraper",
};

const ACTOR_TIMEOUT_SECS = 60;
// Google has no result cap (see buildActorInput), so fetching every page can genuinely
// take longer than the other actors — give it a longer run budget accordingly.
const GOOGLE_ACTOR_TIMEOUT_SECS = 180;
const MAX_ITEMS = 40;

function linkedInSearchUrl(criteria: SingleTitleCriteria): string {
  const params = new URLSearchParams({ keywords: criteria.title, location: criteria.location });
  const wtMap: Record<string, string> = { Remote: "2", Hybrid: "3", "In Office": "1" };
  if (criteria.jobType !== "All" && wtMap[criteria.jobType]) {
    params.set("f_WT", wtMap[criteria.jobType]);
  }
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

function buildActorInput(portal: Portal, criteria: SingleTitleCriteria): Record<string, unknown> {
  switch (portal) {
    case "LinkedIn":
      return { urls: [linkedInSearchUrl(criteria)], count: MAX_ITEMS, scrapeCompany: false };
    case "Indeed":
      return {
        country: "in",
        title: criteria.title,
        location: criteria.location,
        limit: MAX_ITEMS,
        datePosted: "",
      };
    case "Naukri": {
      const input: Record<string, unknown> = {
        keyword: criteria.title,
        location: criteria.location,
        maxResults: MAX_ITEMS,
        fetchDetails: true,
      };
      const workModeMap: Record<string, string> = { Remote: "remote", Hybrid: "hybrid", "In Office": "office" };
      if (criteria.jobType !== "All" && workModeMap[criteria.jobType]) {
        input.workMode = workModeMap[criteria.jobType];
      }
      return input;
    }
    case "Wellfound":
      return {
        keyword: criteria.title,
        location: criteria.location,
        remoteOnly: criteria.jobType === "Remote",
        maxItems: MAX_ITEMS,
      };
    case "Flexjobs":
      return {
        startUrls: [
          `https://www.flexjobs.com/search?search=${encodeURIComponent(criteria.title)}`,
          "https://www.flexjobs.com/remote-jobs",
        ],
        results_wanted: MAX_ITEMS,
        maxPagesPerList: 5,
      };
    case "Google":
      // No result/page cap here — the actor's own defaults (100 results, unlimited
      // pagination) apply, per explicit request not to restrict this source.
      return {
        query: criteria.title,
        location: criteria.location,
        country: "in",
      };
  }
}

export async function runActor(portal: Portal, criteria: SingleTitleCriteria): Promise<unknown[]> {
  if (!client) throw new Error("apify not configured");
  const actorId = ACTORS[portal];
  const input = buildActorInput(portal, criteria);
  const run = await client.actor(actorId).call(input, {
    timeout: portal === "Google" ? GOOGLE_ACTOR_TIMEOUT_SECS : ACTOR_TIMEOUT_SECS,
    memory: 1024,
  });
  const { items } = await client
    .dataset(run.defaultDatasetId)
    .listItems(portal === "Google" ? {} : { limit: MAX_ITEMS });
  return items;
}
