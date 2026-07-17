import type { JobType, Portal } from "../types.js";
import { extractSkillsFromText } from "./skillDictionary.js";

export function inferType(text: string): JobType {
  const t = text.toLowerCase();
  if (/\bremote\b/.test(t)) return "Remote";
  if (/\bhybrid\b/.test(t)) return "Hybrid";
  return "In Office";
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractRequirements(description: string, extra: string[] = []): string[] {
  const fromDictionary = extractSkillsFromText(description);
  const bulletLines = description
    .split(/\r?\n|(?<=[.;])\s(?=[A-Z•\-])/)
    .map((l) => l.replace(/^[\s•\-*]+/, "").trim())
    .filter((l) => l.length >= 10 && l.length <= 120);

  const combined = Array.from(new Set([...extra, ...fromDictionary, ...bulletLines]));
  return combined.slice(0, 8);
}

export function guessPortalFromUrl(url: string | undefined): Portal {
  const u = (url ?? "").toLowerCase();
  if (u.includes("linkedin.com")) return "LinkedIn";
  if (u.includes("indeed.com")) return "Indeed";
  if (u.includes("wellfound.com") || u.includes("angel.co")) return "Wellfound";
  if (u.includes("naukri.com")) return "Naukri";
  if (u.includes("flexjobs.com")) return "Flexjobs";
  return "LinkedIn";
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function hashSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
