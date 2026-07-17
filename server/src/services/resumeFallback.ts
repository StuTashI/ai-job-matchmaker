import type { ParsedResume } from "../types.js";
import { extractSkillsFromText } from "./skillDictionary.js";

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /(\+?\d[\d\s-]{8,14}\d)/;
const ONGOING_RE = /\b(?:present|current|ongoing|till date|now)\b/i;
const MONTH_PREFIX = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-zA-Z]*\\.?\\s+";
const YEAR = "(?:19|20)\\d{2}";
// A date token is an optional month name followed by a year (e.g. "Feb 2025", "2025"),
// or an ongoing-role word (e.g. "Current"). Resumes commonly pair a month+year start
// with a month+year (or bare ongoing-word) end, e.g. "Feb 2025 – Current" / "Jan 2024 – Jan 2025".
const DATE_TOKEN = `(?:(?:${MONTH_PREFIX})?${YEAR}|${ONGOING_RE.source})`;
const DATE_RANGE_RE = new RegExp(`\\b(${DATE_TOKEN})\\s*[-–—]+\\s*(${DATE_TOKEN})\\b`, "i");
const EDUCATION_RE = /\b(B\.?Tech|B\.?E\.?|Bachelor|Master|M\.?Tech|MBA|PhD|Diploma|B\.?Sc|M\.?Sc|BCA|MCA)\b/i;
const BULLET_RE = /^[\s•\-*▪◦]+/;
const NOTICE_PERIOD_RE = /notice period[:\s]*([0-9]+)\s*(day|week|month)/i;
const SKILLS_HEADER_RE = /^(core competenc(y|ies)|technical skills|skills|competenc(y|ies)|tools\s*&?\s*technologies|technologies)(\s*&\s*[\w\s]+)?\s*:?$/i;
const SECTION_HEADER_RE =
  /^(work experience|professional experience|experience|employment history|education|projects|certifications|awards|publications|summary|objective|career summary)\b/i;
const PAGE_MARKER_RE = /^-*\s*\d+\s*of\s*\d+\s*-*$/i;
const EDUCATION_HEADER_RE = /^education\b/i;

function parseNoticePeriodMonths(text: string): number | undefined {
  const match = text.match(NOTICE_PERIOD_RE);
  if (!match) return undefined;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith("day")) return value / 30;
  if (unit.startsWith("week")) return value / 4.345;
  return value;
}

function parseYearsFromRange(range: string): number {
  const match = range.match(/(\d{4})/g);
  const startYear = match?.[0] ? Number(match[0]) : null;
  const isOngoing = ONGOING_RE.test(range);
  const endYear = isOngoing ? new Date().getUTCFullYear() : match?.[1] ? Number(match[1]) : startYear;
  if (startYear == null || endYear == null) return 0;
  return Math.max(0, endYear - startYear);
}

export function totalYearsOfExperience(experience: ParsedResume["experience"]): number {
  return experience.reduce((sum, exp) => sum + parseYearsFromRange(exp.duration), 0);
}

function looksLikeSectionHeader(line: string): boolean {
  if (SECTION_HEADER_RE.test(line)) return true;
  return line.length < 40 && line === line.toUpperCase() && /^[A-Z\s&]+$/.test(line);
}

/** Scans backward from a date-range line to find its "Role | Company | Location"
 * style header, which can span multiple wrapped physical lines. */
function findRoleLine(lines: string[], dateLineIdx: number): string {
  for (let back = 1; back <= 3; back++) {
    const idx = dateLineIdx - back;
    if (idx < 0) break;
    const candidate = lines[idx];
    if (BULLET_RE.test(candidate)) break;
    if (candidate.includes("|")) return candidate;
  }
  const prev = lines[dateLineIdx - 1];
  return prev && !BULLET_RE.test(prev) ? prev : "";
}

function extractSkillsSectionText(lines: string[]): string | null {
  const headerIdx = lines.findIndex((l) => SKILLS_HEADER_RE.test(l));
  if (headerIdx === -1) return null;
  const collected: string[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (looksLikeSectionHeader(line)) break;
    collected.push(line);
  }
  return collected.join(" ");
}

function splitSkillPhrases(sectionText: string): string[] {
  let parts: string[];
  if ((sectionText.match(/•/g) || []).length >= 2) {
    parts = sectionText.split("•");
  } else if ((sectionText.match(/\|/g) || []).length >= 2) {
    parts = sectionText.split("|");
  } else {
    parts = sectionText.split(",");
  }
  return parts.map((p) => p.trim()).filter((p) => p.length >= 2 && p.length <= 60);
}

function extractSummary(lines: string[], name: string): string {
  const nameIdx = lines.indexOf(name);
  const startIdx = lines.findIndex(
    (l, i) => i > nameIdx && !EMAIL_RE.test(l) && !PHONE_RE.test(l) && !/^\(.*\)$/.test(l),
  );
  if (startIdx === -1) return "";
  const collected: string[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (looksLikeSectionHeader(line) || SKILLS_HEADER_RE.test(line) || DATE_RANGE_RE.test(line)) break;
    collected.push(line);
  }
  return collected.join(" ");
}

function buildCareerNarrativeFallback(
  name: string,
  experience: ParsedResume["experience"],
  skills: string[],
): string {
  if (experience.length === 0) return "";

  const years = totalYearsOfExperience(experience);
  const recent = experience[0];
  const companies = Array.from(new Set(experience.map((e) => e.company).filter(Boolean))).slice(0, 4);
  const topSkills = skills.slice(0, 5);

  const sentences: string[] = [];

  const yearsPhrase = years > 0 ? `${Math.round(years)}+ years of experience` : "experience";
  sentences.push(
    recent.role
      ? `${name} brings ${yearsPhrase}, most recently as ${recent.role}${recent.company ? ` at ${recent.company}` : ""}.`
      : `${name} brings ${yearsPhrase}.`,
  );

  if (companies.length > 1) {
    sentences.push(`Their career spans ${companies.join(", ")}.`);
  }

  const notableHighlights = experience
    .flatMap((e) => e.highlights.slice(0, 1))
    .filter(Boolean)
    .slice(0, 2);
  if (notableHighlights.length > 0) {
    sentences.push(`Standout work includes ${notableHighlights.map((h) => h.replace(/\.$/, "")).join("; and ")}.`);
  }

  if (topSkills.length > 0) {
    sentences.push(`Core strengths include ${topSkills.join(", ")}.`);
  }

  return sentences.join(" ");
}

export function parseResumeFallback(text: string): ParsedResume {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !PAGE_MARKER_RE.test(l));

  const emailMatch = text.match(EMAIL_RE);
  const phoneMatch = text.match(PHONE_RE);

  const name = lines.find((l) => !EMAIL_RE.test(l) && !PHONE_RE.test(l) && l.length < 60 && l.length > 1) ?? "Candidate";

  const skillsSectionText = extractSkillsSectionText(lines);
  const skills = skillsSectionText ? splitSkillPhrases(skillsSectionText) : extractSkillsFromText(text);

  const education = lines.filter((l) => EDUCATION_RE.test(l)).slice(0, 5);

  const educationHeaderIdx = lines.findIndex((l) => EDUCATION_HEADER_RE.test(l));
  const experienceEndIdx = educationHeaderIdx === -1 ? lines.length : educationHeaderIdx;

  const experience: ParsedResume["experience"] = [];
  let current: ParsedResume["experience"][number] | null = null;

  for (let i = 0; i < experienceEndIdx; i++) {
    const line = lines[i];
    const dateMatch = line.match(DATE_RANGE_RE);
    if (dateMatch) {
      if (current) experience.push(current);
      const roleLine = findRoleLine(lines, i);
      // Prefer splitting on "|" alone when present (the common "Role | Company | Location"
      // format) — splitting on bare hyphens too would wrongly break titles like
      // "Product Manager - 2" or descriptors like "E-Commerce".
      const parts = roleLine.includes("|")
        ? roleLine.split("|").map((p) => p.trim()).filter(Boolean)
        : roleLine.split(/\s+at\s+|\s+-\s+/i).map((p) => p.trim()).filter(Boolean);
      current = {
        role: parts[0] ?? roleLine,
        company: parts[1] ?? "",
        duration: dateMatch[0],
        highlights: [],
      };
      continue;
    }
    if (current) {
      if (BULLET_RE.test(line)) {
        current.highlights.push(line.replace(BULLET_RE, "").trim());
      } else if (current.highlights.length > 0 && !line.includes("|") && !looksLikeSectionHeader(line)) {
        // Wrapped continuation of the previous bullet line.
        const lastIdx = current.highlights.length - 1;
        current.highlights[lastIdx] = `${current.highlights[lastIdx]} ${line}`;
      }
    }
  }
  if (current) experience.push(current);
  for (const exp of experience) {
    exp.highlights = exp.highlights.slice(0, 5);
  }

  const summary = extractSummary(lines, name);

  return {
    name,
    email: emailMatch?.[0] ?? "",
    phone: phoneMatch?.[0],
    summary,
    skills,
    experience,
    education,
    noticePeriodMonths: parseNoticePeriodMonths(text),
    careerNarrative: buildCareerNarrativeFallback(name, experience, skills),
  };
}
