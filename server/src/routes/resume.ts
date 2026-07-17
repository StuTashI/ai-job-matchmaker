import { Router } from "express";
import multer from "multer";
import { Type } from "@google/genai";
import { env } from "../env.js";
import { extractResumeText } from "../services/resumeExtract.js";
import { generateStructured } from "../services/gemini.js";
import { parseResumeFallback } from "../services/resumeFallback.js";
import type { ParsedResume } from "../types.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const RESUME_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    email: { type: Type.STRING },
    phone: { type: Type.STRING },
    summary: { type: Type.STRING },
    skills: { type: Type.ARRAY, items: { type: Type.STRING } },
    experience: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          role: { type: Type.STRING },
          company: { type: Type.STRING },
          duration: { type: Type.STRING },
          highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["role", "company", "duration", "highlights"],
      },
    },
    education: { type: Type.ARRAY, items: { type: Type.STRING } },
    noticePeriodMonths: { type: Type.NUMBER },
    careerNarrative: { type: Type.STRING },
  },
  required: ["name", "email", "summary", "skills", "experience", "education", "careerNarrative"],
};

function buildPrompt(text: string): string {
  return `You are a precise resume parser. Extract structured information from the resume text below and return it strictly matching the provided JSON schema. If a field is not present, use an empty string or empty array as appropriate.

Follow these rules carefully:
- skills: if the resume has an explicit "Skills" / "Core Competencies" / "Technologies" / "Tools" section, use those items essentially verbatim (just clean up stray punctuation) — that section is the candidate's own authoritative list of their competencies. Do NOT add a skill just because a technology or tool is named somewhere in an experience bullet describing a product, a system's data, a domain, or infrastructure the candidate's team/product touched — only include it if the bullet clearly shows the candidate personally used or built with it. When in doubt, leave it out rather than guess.
- experience: include every role, especially the most recent/current one — roles ending in "Present", "Current", "Ongoing", or "Till Date" are still active and must be included with today's context as the end date. Each highlight should be the complete bullet as one sentence (resume text may hard-wrap a single bullet across lines — rejoin those into one highlight rather than truncating at the line break).
- summary: capture the full summary/objective paragraph (it is often 2-4 sentences or line-wrapped), not just its first line.
- noticePeriodMonths: if the resume states a notice period (e.g. "Notice Period: 30 days" or "2 months"), convert it to months; omit the field entirely if not stated.
- careerNarrative: write a warm, concise 3-4 sentence synthesis of this person's career, in third person, as flowing prose (not a bullet list) — like a strong LinkedIn "About" section rather than a dry objective statement. Cover: their overall trajectory (years of experience, seniority progression), 2-3 of their most impressive concrete achievements (name real specifics — metrics, scale, what they built — not generic phrasing), and what they're clearly strongest at. Base this only on what the resume actually shows.

Resume text:
"""
${text.slice(0, 12000)}
"""`;
}

export const resumeRouter = Router();

resumeRouter.post("/parse", upload.single("resume"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No resume file uploaded" });
      return;
    }

    const text = await extractResumeText(file.buffer, file.mimetype, file.originalname);
    if (!text.trim()) {
      res.status(422).json({ error: "Could not extract any text from the uploaded file" });
      return;
    }

    if (env.hasGemini) {
      try {
        // Longer budget than the default: parsing a full resume *and* composing the
        // career narrative in one call takes noticeably longer than short scoring/outreach calls.
        const parsed = await generateStructured<ParsedResume>(buildPrompt(text), RESUME_SCHEMA, 30_000);
        res.json(parsed);
        return;
      } catch {
        // fall through to local heuristic parser
      }
    }

    res.json(parseResumeFallback(text));
  } catch (err) {
    res.status(500).json({ error: "Failed to parse resume" });
  }
});
