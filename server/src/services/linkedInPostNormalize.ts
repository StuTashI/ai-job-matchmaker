import type { LinkedInJob, Referrer } from "../types.js";
import type { RawLinkedInPost } from "./linkedInPostsApify.js";
import type { ExtractedJobFields } from "./linkedInPostFallback.js";
import { extractSkillsFromText } from "./skillDictionary.js";
import { inferType, slugify } from "./textHeuristics.js";

function makeId(url: string | undefined, fallback: string): string {
  return `LinkedIn:${url ?? fallback}`;
}

// Post prose is casual social-media text, not a structured JD — the generic
// extractRequirements() bullet-line heuristic (tuned for portal job descriptions) treats
// ANY 10-120 char line as a "requirement", which on a post means emoji-prefixed headline
// lines like "🚀 We're Hiring: Senior Product Manager" get treated as literal missing
// skills. Stay conservative here: real skill-dictionary matches, plus genuine
// "X years experience"-shaped lines only — never raw prose lines.
function extractLinkedInRequirements(description: string): string[] {
  // Single/double-letter dictionary entries (e.g. "R", the R programming language) are
  // too prone to false-positive matches in casual post prose (stray "R&D" mentions,
  // location abbreviations, etc.) — require at least 3 characters to count.
  const skills = extractSkillsFromText(description).filter((skill) => skill.length >= 3);
  const experienceLines = description
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s•\-*]+/, "").replace(/\p{Extended_Pictographic}/gu, "").trim())
    .filter((line) => line.length >= 8 && line.length <= 100)
    .filter((line) => /\d+\+?\s*(years?|yrs?)\b/i.test(line) && /experience/i.test(line));
  return Array.from(new Set([...skills, ...experienceLines])).slice(0, 8);
}

// The post author is a real, known individual — always use them as the referral
// contact instead of falling through to synthesizeReferrer(), which would fabricate a
// different, unrelated person for outreach. The email is still a best-guess synthesis
// (like every other referrer email in this app) since LinkedIn doesn't expose one.
function buildReferrer(post: RawLinkedInPost, company: string): Referrer {
  const name = post.author?.name?.trim() || "Unknown";
  const slug = slugify(name) || "contact";
  const companyDomain = slugify(company) || "company";
  return {
    name,
    title: post.author?.headline?.trim() || "LinkedIn",
    linkedin: post.author?.profile_url || post.post_url,
    email: `${slug}@${companyDomain}.com`,
  };
}

function resolvePostedAt(post: RawLinkedInPost): string {
  // Prefer the numeric epoch (unambiguous) over the "2026-07-17 16:03:17"-style date
  // string, which isn't a standard format `Date.parse` is guaranteed to handle correctly.
  const ts = post.posted_at?.timestamp ?? post.timestamp;
  if (ts) return new Date(ts).toISOString();
  return new Date().toISOString();
}

// One malformed post should never drop the whole batch — same resilience convention
// as jobNormalize.ts's per-portal mappers.
export function normalizeLinkedInPost(post: RawLinkedInPost, extracted: ExtractedJobFields): LinkedInJob | null {
  try {
    if (!post.post_url || !extracted.title) return null;
    const description = post.text?.trim() || extracted.location || "";

    return {
      id: makeId(post.post_url, `${extracted.title}-${extracted.company}`),
      title: extracted.title,
      company: extracted.company,
      location: extracted.location || "Not specified",
      type: inferType(`${extracted.location} ${description}`),
      portal: "LinkedIn",
      url: extracted.url || post.post_url,
      description,
      requirements: extractLinkedInRequirements(description),
      postedAt: resolvePostedAt(post),
      referrer: buildReferrer(post, extracted.company),
      author: {
        name: post.author?.name ?? "Unknown",
        headline: post.author?.headline,
        profileUrl: post.author?.profile_url,
      },
      engagement: {
        reactions: post.total_reactions,
        comments: post.comments,
        reposts: typeof post.reposts === "number" ? post.reposts : undefined,
      },
      postSource: extracted.postSource,
    };
  } catch {
    return null;
  }
}
