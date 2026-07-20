import type { RawLinkedInPost } from "./linkedInPostsApify.js";

export const MAX_AGE_DAYS = 15;

const HIRING_INTENT_PATTERNS = [
  /\bhiring\b/i,
  /we'?re looking for/i,
  /\bopen position/i,
  /\bjob opening/i,
  /\bapply now\b/i,
  /\bdm (me|your resume)/i,
  /\bjoin (our|my) team/i,
  /\brole is (open|live)/i,
];

// "opentowork" deliberately excluded — that hashtag means the poster is a job *seeker*,
// not a company/recruiter hiring, and would be a real false-positive source here.
const HIRING_HASHTAGS = new Set(["hiring", "wearehiring", "nowhiring", "jobopening", "jobalert", "hiringalert"]);

const STOPWORDS = new Set(["a", "an", "the", "of", "and", "or", "for", "to", "in"]);

export interface ExtractedJobFields {
  title: string;
  company: string;
  location: string;
  url: string;
  postSource: "structured" | "classified";
}

function extractCompanyFromSubtitle(subtitle: string | undefined): string | undefined {
  if (!subtitle) return undefined;
  const match = subtitle.match(/^Job by (.+)$/i);
  return (match ? match[1] : subtitle).trim() || undefined;
}

// Age check runs first and cheapest — no point paying for Gemini classification on a
// post we're going to discard anyway. Missing timestamps err toward inclusion rather
// than silently dropping a post we simply can't date.
export function isWithinAgeLimit(post: RawLinkedInPost, maxDays = MAX_AGE_DAYS): boolean {
  const ts = post.posted_at?.timestamp ?? post.timestamp;
  if (!ts) return true;
  return Date.now() - ts <= maxDays * 24 * 60 * 60 * 1000;
}

// Tier A: LinkedIn itself attached a structured job card to this post (confirmed via a
// live trial run against the actor). When present, every field comes straight from that
// card — zero inference, zero fabrication risk, no AI/heuristic classification needed.
export function extractStructuredJobCard(post: RawLinkedInPost): ExtractedJobFields | null {
  const content = post.content;
  if (!content || content.type !== "job" || !content.title) return null;
  return {
    title: content.title,
    company: extractCompanyFromSubtitle(content.subtitle) ?? post.author?.name ?? "Unknown",
    location: content.description ?? "",
    url: content.url || post.post_url,
    postSource: "structured",
  };
}

function tokenizeRole(roleTitle: string): string[] {
  return roleTitle
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

// Layer 1 (always runs, deterministic): requires genuine hiring-intent phrasing AND a
// role-term match — catches posts that merely mention a role in passing without ever
// generating or inventing anything, so it carries zero fabrication risk by construction.
export function passesHiringIntentHeuristic(post: RawLinkedInPost, roleTitle: string): boolean {
  const text = post.text ?? "";
  const hashtags = (post.hashtags ?? []).map((h) => h.toLowerCase());
  const hasHiringSignal = hashtags.some((h) => HIRING_HASHTAGS.has(h)) || HIRING_INTENT_PATTERNS.some((re) => re.test(text));
  if (!hasHiringSignal) return false;

  const tokens = tokenizeRole(roleTitle);
  if (tokens.length === 0) return true;
  const haystack = text.toLowerCase();
  const matchCount = tokens.filter((token) => haystack.includes(token)).length;
  return matchCount >= Math.ceil(tokens.length / 2);
}

// LinkedIn headlines are often "Title @ Company" / "Title at Company" — a much better
// company guess than the poster's own personal name (which is what this used to fall
// back to, causing outreach to reference a person's name as if it were the employer).
function guessCompanyFromHeadline(headline: string | undefined): string | undefined {
  if (!headline) return undefined;
  const match = headline.match(/(?:@|\bat\b)\s+([A-Z][\w&.,'-]{1,60})/i);
  return match ? match[1].trim() : undefined;
}

// Used only when Gemini isn't configured (or the Layer-2 call fails) for a post that
// passed Layer 1 but has no structured job card — we deliberately do NOT invent a title
// from the prose text; we're honest that the only fact we're confident in is the role
// the user searched for, which is why this post surfaced at all. Same honesty applies to
// company: never fabricate a specific name we're not confident in — "Hiring company" is
// an honest generic placeholder, not a guess dressed up as a fact.
export function extractHeuristicFields(post: RawLinkedInPost, roleTitle: string): ExtractedJobFields {
  return {
    title: roleTitle,
    company: guessCompanyFromHeadline(post.author?.headline) ?? "Hiring company",
    location: "",
    url: post.post_url,
    postSource: "classified",
  };
}

export function tokenizeLocation(location: string): string[] {
  return location
    .toLowerCase()
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

// Soft/best-effort — the actor has no location field at all, so this is a text match
// against whatever free-text we have, not an authoritative filter like the Search tab's.
export function matchesLocationHint(post: RawLinkedInPost, extracted: ExtractedJobFields, locationTokens: string[]): boolean {
  if (locationTokens.length === 0) return true;
  const haystack = [post.text, post.author?.headline, extracted.location]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return locationTokens.some((token) => haystack.includes(token));
}
