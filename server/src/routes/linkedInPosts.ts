import { Router } from "express";
import { Type } from "@google/genai";
import { env } from "../env.js";
import { generateStructured } from "../services/gemini.js";
import { searchLinkedInPosts, type RawLinkedInPost } from "../services/linkedInPostsApify.js";
import {
  extractHeuristicFields,
  extractStructuredJobCard,
  isWithinAgeLimit,
  matchesLocationHint,
  passesHiringIntentHeuristic,
  tokenizeLocation,
  type ExtractedJobFields,
} from "../services/linkedInPostFallback.js";
import { normalizeLinkedInPost } from "../services/linkedInPostNormalize.js";
import type { LinkedInJob, LinkedInPostSearchCriteria } from "../types.js";

// Layer 2 classification is batched (not one Gemini call per post) to control latency
// and this project's already-tight Gemini quota.
const CLASSIFY_CHUNK_SIZE = 12;

const CLASSIFY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          index: { type: Type.INTEGER },
          isGenuineJobPost: { type: Type.BOOLEAN },
          title: { type: Type.STRING },
          company: { type: Type.STRING },
          location: { type: Type.STRING },
        },
        required: ["index", "isGenuineJobPost"],
      },
    },
  },
  required: ["results"],
};

interface ClassifyResult {
  index: number;
  isGenuineJobPost: boolean;
  title?: string;
  company?: string;
  location?: string;
}

function buildClassifyPrompt(posts: { index: number; text: string }[]): string {
  const numbered = posts.map((p) => `[${p.index}] """${p.text.slice(0, 1500)}"""`).join("\n\n");
  return `You are screening LinkedIn posts to find genuine, first-party hiring announcements — not posts that merely mention a job title in passing, complain about work, congratulate someone, or discuss industry news.

For EACH numbered post below, decide isGenuineJobPost, and if true, extract title/company/location as VERBATIM substrings or extremely close paraphrases of what's actually written in that post's text — never invent a company name, title, or location that isn't genuinely present or clearly implied by the text. If you are not confident a post is a real hiring announcement for a specific role, set isGenuineJobPost to false rather than guessing. Bias toward exclusion over fabrication — a missed post is a far smaller problem than a fabricated one.

POSTS:
${numbered}

Return one result per post index, in the "results" array.`;
}

async function classifyWithGemini(
  candidates: { post: RawLinkedInPost; roleTitle: string }[],
): Promise<Map<number, ExtractedJobFields>> {
  const results = new Map<number, ExtractedJobFields>();
  for (let i = 0; i < candidates.length; i += CLASSIFY_CHUNK_SIZE) {
    const chunk = candidates.slice(i, i + CLASSIFY_CHUNK_SIZE);
    try {
      const { results: classified } = await generateStructured<{ results: ClassifyResult[] }>(
        buildClassifyPrompt(chunk.map((c, idx) => ({ index: idx, text: c.post.text ?? "" }))),
        CLASSIFY_SCHEMA,
        25_000,
      );
      for (const result of classified) {
        const candidate = chunk[result.index];
        if (!candidate || !result.isGenuineJobPost || !result.title) continue;
        // Belt-and-suspenders: reject any extracted company that doesn't literally
        // appear anywhere in the source post — a cheap guard against fabrication.
        const haystack = (candidate.post.text ?? "").toLowerCase();
        const company = result.company?.trim();
        if (company && !haystack.includes(company.toLowerCase())) continue;
        results.set(i + result.index, {
          title: result.title.trim(),
          company: company || candidate.post.author?.name || "Unknown",
          location: result.location?.trim() ?? "",
          url: candidate.post.post_url,
          postSource: "classified",
        });
      }
    } catch {
      // fall through — this chunk's candidates simply won't get Gemini-enriched;
      // the heuristic-only fields are applied by the caller instead.
    }
  }
  return results;
}

export const linkedInPostsRouter = Router();

linkedInPostsRouter.post("/search", async (req, res) => {
  try {
    const body = req.body as Partial<LinkedInPostSearchCriteria>;
    const titles = (body.titles ?? []).map((t) => t.trim()).filter(Boolean);
    const locations = (body.locations ?? []).map((l) => l.trim()).filter(Boolean);

    if (titles.length === 0) {
      res.status(400).json({ error: "at least one title is required" });
      return;
    }
    if (!env.hasApify) {
      res.status(400).json({ error: "Apify is not configured" });
      return;
    }

    // Free-tier Apify accounts cap at 4 keywords/run — an external constraint we don't
    // engineer around, same as this app already surfaces Gemini's tight free quota.
    const keywordToTitle = new Map<string, string>();
    for (const title of titles) {
      keywordToTitle.set(`${title} hiring`, title);
    }

    let rawPosts: RawLinkedInPost[];
    try {
      rawPosts = await searchLinkedInPosts(Array.from(keywordToTitle.keys()));
    } catch {
      res.json({ jobs: [] });
      return;
    }

    // Cheapest filter first: hard age cutoff before anything gets classified.
    const recentPosts = rawPosts.filter((post) => isWithinAgeLimit(post));

    const structured: { post: RawLinkedInPost; extracted: ExtractedJobFields }[] = [];
    const needsClassification: { post: RawLinkedInPost; roleTitle: string }[] = [];

    for (const post of recentPosts) {
      const roleTitle = keywordToTitle.get(post.input ?? "") ?? titles[0];
      const structuredCard = extractStructuredJobCard(post);
      if (structuredCard) {
        structured.push({ post, extracted: structuredCard });
        continue;
      }
      if (passesHiringIntentHeuristic(post, roleTitle)) {
        needsClassification.push({ post, roleTitle });
      }
    }

    const classified = env.hasGemini ? await classifyWithGemini(needsClassification) : new Map<number, ExtractedJobFields>();

    const heuristicOnly = needsClassification
      .map((candidate, index) => ({ candidate, extracted: classified.get(index) }))
      .map(({ candidate, extracted }) => ({
        post: candidate.post,
        extracted: extracted ?? extractHeuristicFields(candidate.post, candidate.roleTitle),
      }));

    const locationTokens = locations.flatMap(tokenizeLocation);

    const jobs: LinkedInJob[] = [...structured, ...heuristicOnly]
      .filter(({ post, extracted }) => matchesLocationHint(post, extracted, locationTokens))
      .map(({ post, extracted }) => normalizeLinkedInPost(post, extracted))
      .filter((job): job is LinkedInJob => job !== null);

    const seen = new Set<string>();
    const deduped = jobs.filter((job) => {
      if (seen.has(job.id)) return false;
      seen.add(job.id);
      return true;
    });

    res.json({ jobs: deduped });
  } catch {
    res.status(500).json({ error: "Failed to search LinkedIn posts" });
  }
});
