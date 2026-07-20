import { ApifyClient } from "apify-client";
import { env, onKeysUpdated } from "../env.js";

let client: ApifyClient | null = env.hasApify ? new ApifyClient({ token: env.apifyToken }) : null;

onKeysUpdated(() => {
  client = env.hasApify ? new ApifyClient({ token: env.apifyToken }) : null;
});

const ACTOR_ID = "datadoping/linkedin-posts-search-scraper";
const ACTOR_TIMEOUT_SECS = 120;
// Actor charges per post; this is the per-keyword ceiling, not a total cap.
const MAX_POSTS_PER_KEYWORD = 50;

// Real shape confirmed via a live trial run against the actor (not guessed from docs) —
// `content` is only present when LinkedIn itself attached a job/link card to the post.
export interface RawLinkedInPost {
  author?: {
    name: string;
    headline?: string;
    profile_url?: string;
    image_url?: string;
  };
  comments?: number;
  content?: {
    title?: string;
    subtitle?: string;
    description?: string;
    url?: string;
    type?: string;
  };
  hashtags?: string[];
  post_url: string;
  posted_at?: {
    date?: string;
    display_text?: string;
    timestamp?: number;
  };
  reposts?: number | null;
  text: string;
  timestamp?: number;
  total_reactions?: number;
  // Echoes back whichever entry in the `keywords` array produced this post — used to
  // recover which searched role title a post came from.
  input?: string;
}

// No date granularity beyond past-24h/past-week/past-month exists on this actor — we
// always request the broadest window that covers our 15-day cap, then bucket ourselves.
export async function searchLinkedInPosts(keywords: string[]): Promise<RawLinkedInPost[]> {
  if (!client) throw new Error("apify not configured");
  if (keywords.length === 0) return [];
  const run = await client.actor(ACTOR_ID).call(
    {
      keywords,
      max_posts: MAX_POSTS_PER_KEYWORD,
      sort_by: "date_posted",
      date_filter: "past-month",
    },
    { timeout: ACTOR_TIMEOUT_SECS, memory: 512 },
  );
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return items as unknown as RawLinkedInPost[];
}
