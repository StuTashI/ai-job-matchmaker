import { Router } from "express";
import { Type } from "@google/genai";
import { env } from "../env.js";
import { generateStructured } from "../services/gemini.js";
import { draftOutreachFallback, extractLikelyGap, isJobPoster, synthesizeReferrer } from "../services/outreachFallback.js";
import type { Job, ParsedResume, Referrer } from "../types.js";

const OUTREACH_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    customMessage: { type: Type.STRING },
    customEmail: { type: Type.STRING },
    referrer: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        title: { type: Type.STRING },
        linkedin: { type: Type.STRING },
        email: { type: Type.STRING },
      },
      required: ["name", "title", "linkedin", "email"],
    },
  },
  required: ["customMessage", "customEmail", "referrer"],
};

const REGENERATE_SCHEMA = {
  type: Type.OBJECT,
  properties: { text: { type: Type.STRING } },
  required: ["text"],
};

type Channel = "message" | "email";

// Shared five-part structure + tone rules, used by both the initial draft prompt and the
// single-channel regenerate prompt — keep these in sync, don't let the two prompts drift.
function fiveStepRulesBlock(referrer: Referrer): string {
  const referrerFirstName = referrer.name.split(" ")[0];
  const posterAsk = isJobPoster(referrer);

  return `Build EVERY message from these five parts, in this order:
1. HOOK (1 line): Name the exact job title as a real, current opening — never a vague "exploring opportunities." Include the job link if one is given (see below), stated as the reason for reaching out. Never open with "I hope you're doing well" or "I came across your profile" — the posting itself is the hook.
2. BRIDGE (1-2 lines): Who the candidate is, told through relevance to the recipient — not a full bio. Pick at most 2 concrete achievements, preferring ones with a real quantified number (%, ARR, scale, time saved) over narrative-only ones when both are available. Close the Bridge by naming an ACTUAL overlapping skill, domain, or requirement from the job facts below — never the generic filler "maps closely to what this role is asking for" with nothing specific attached to it; name the specific thing that maps. For the email specifically, give this closing relevance clause its own full sentence (a little more room than the LinkedIn message, which should stay to one tight sentence for the whole Bridge).
3. THE ASK (1 line, always explicit — never implied): ${
    posterAsk
      ? `${referrerFirstName} is the person who posted this role, so the ask is: happy to apply through the standard process, but wanted to introduce myself directly first — or ask a direct question about the role.`
      : `${referrerFirstName} is a product/eng person at the company, not the poster, so the ask is: would they be willing to refer the candidate, or point them to the right person.`
  }
4. HONEST GAP (optional, 1 line): Include ONLY if a real gap is given below. Name it directly, once, without apologizing — this reads as more credible than oversell, and pre-empts the objection instead of letting the reader find it later. Phrase it grammatically — if the gap text already ends in a noun like "experience" or "knowledge", don't append "experience" again (avoid "compliance knowledge experience").
5. LOW-FRICTION CLOSE (1 line): Make it easy to say yes to something small ("a two-line reply is more than enough", "even a redirect to the right person would help") — not a hard ask for a scheduled call as the only option.

Do NOT write generic recruiter-speak ("align with your goals", "translate into impact", "I am confident I would be a great asset") or buzzwords ("visionary", "passionate", "guru", "rockstar", "ninja"). Avoid exclamation points and forced enthusiasm. Prefer commas and short sentences over stacking hyphenated clauses or semicolons — one em dash for the Hook's opening beat is fine (see the worked example), but don't lean on dashes as a crutch throughout. Never ask more than one question. Never fabricate or shorten a job link — if none is given, simply don't include one.

Model the tone and shape EXACTLY on this real worked example (do not copy its content):
"""
Hi [Name],

I'm reaching out about a specific opening — Manager, Digital Product Management on the Enterprise Payments team. Here's the posting I'm referencing: https://in.linkedin.com/jobs/view/manager-digital-product-management-at-american-express-4427200115

Quick context on me: I'm a Senior PM at WorkSpan, where I built two AI products from scratch to a combined ~$2.5M ARR — one of them an agentic assistant embedded in enterprise CRMs (Salesforce, Dynamics 365). The enterprise delivery and stakeholder work map closely to what this role is asking for.

One honest gap: I don't have direct payments/fintech background — flagging it upfront rather than hoping it doesn't surface later.

Would you be open to a referral, or pointing me to whoever's closest to this hire? A short reply is genuinely enough.

Thanks for your time,
Pranajit
"""`;
}

function candidateAndJobBlock(resume: ParsedResume, job: Job, gaps: string[]): string {
  const recentExp = resume.experience[0];
  return `CANDIDATE FACTS (use real specifics from these, not vague summaries):
Name: ${resume.name}
Most recent role: ${recentExp ? `${recentExp.role} at ${recentExp.company} (${recentExp.duration})` : "n/a"}
Concrete highlights from that role: ${recentExp?.highlights.join(" | ") || "n/a"}
Skills: ${resume.skills.join(", ")}
Summary: ${resume.summary}

TARGET JOB
Title: ${job.title} at ${job.company} (found via ${job.portal})
Job posting URL: ${job.url || "not available — do not fabricate a link, omit it entirely"}
Job requirements: ${job.requirements.join(", ")}
Job description excerpt: ${job.description.slice(0, 1500)}

Known gap to acknowledge honestly (the JD asks for this and the candidate's resume doesn't clearly show it): ${gaps[0] || "none identified — omit the HONEST GAP part entirely, the candidate's background covers the stated requirements reasonably well"}`;
}

function buildPrompt(resume: ParsedResume, job: Job, referrer: Referrer, gaps: string[]): string {
  const referrerFirstName = referrer.name.split(" ")[0];

  return `You are ${resume.name}, drafting referral outreach to ${referrerFirstName} (${referrer.title}) at ${job.company} about a specific job opening. The goal is never "get a referral in one message" — the goal is to earn a reply. A message that's too long, generic, or demanding gets ignored regardless of qualifications.

${fiveStepRulesBlock(referrer)}

${candidateAndJobBlock(resume, job, gaps)}

Draft:
1. customMessage: a LinkedIn InMail using the full five-part structure above. Target 80-150 words (excluding greeting/sign-off). No subject line, no "Dear", plain sign-off with just the candidate's first name.
2. customEmail: the full five-part structure adapted to email register, targeting 120-180 words (excluding subject/greeting/signature). First line MUST be "Subject: Referral — ${job.title}" or an equally specific variant naming the exact role — never a generic phrase like "Reaching out". End with a plain signature: name, email, phone if given (omit phone if not provided).
3. referrer: return the referrer contact info exactly as given (name, title, linkedin, email).`;
}

function buildRegeneratePrompt(
  resume: ParsedResume,
  job: Job,
  referrer: Referrer,
  gaps: string[],
  channel: Channel,
  previous: string,
): string {
  const channelInstruction =
    channel === "message"
      ? `Draft a LinkedIn InMail using the full five-part structure. Target 80-150 words (excluding greeting/sign-off). No subject line, no "Dear", plain sign-off with just the candidate's first name.`
      : `Draft the full five-part structure adapted to email register, targeting 120-180 words (excluding subject/greeting/signature). First line MUST be "Subject: Referral — ${job.title}" or an equally specific variant naming the exact role — never a generic phrase like "Reaching out". End with a plain signature: name, email, phone if given (omit phone if not provided).`;

  return `You are ${resume.name}. You already drafted the outreach below, but you weren't satisfied with it and want to regenerate a genuinely different version — not a light reword. Vary the opening line, which concrete achievement leads the Bridge (if more than one is available), and the exact phrasing of the Ask/Close, while keeping every fact accurate and following the same five-part structure and tone rules as before.

${fiveStepRulesBlock(referrer)}

PREVIOUS DRAFT (write something noticeably different from this — do not just paraphrase it):
"""
${previous}
"""

${candidateAndJobBlock(resume, job, gaps)}

${channelInstruction}

Return only the drafted text in the "text" field — nothing else, no explanation of what changed.`;
}

function computeOutreachGaps(resume: ParsedResume, job: Job): string[] {
  // Prefer the real, evidence-traced gaps from a completed Analyze report; only fall back
  // to a quick substring check when outreach is drafted before any scoring has happened.
  if (job.analysis?.report?.skillGaps?.length) {
    return job.analysis.report.skillGaps;
  }
  const gap = extractLikelyGap(resume, job);
  return gap ? [gap] : [];
}

export const outreachRouter = Router();

outreachRouter.post("/", async (req, res) => {
  try {
    const { resume, job } = req.body as { resume: ParsedResume; job: Job };
    if (!resume || !job) {
      res.status(400).json({ error: "resume and job are required" });
      return;
    }

    const referrer = job.referrer ?? synthesizeReferrer(job);
    const gaps = computeOutreachGaps(resume, job);

    if (env.hasGemini) {
      try {
        const drafted = await generateStructured<{ customMessage: string; customEmail: string; referrer: Referrer }>(
          buildPrompt(resume, job, referrer, gaps),
          OUTREACH_SCHEMA,
        );
        res.json(drafted);
        return;
      } catch {
        // fall through to local template
      }
    }

    const { customMessage, customEmail } = draftOutreachFallback(resume, job, referrer, gaps);
    res.json({ customMessage, customEmail, referrer });
  } catch {
    res.status(500).json({ error: "Failed to draft outreach" });
  }
});

outreachRouter.post("/regenerate", async (req, res) => {
  try {
    const { resume, job, channel, previous, variant } = req.body as {
      resume: ParsedResume;
      job: Job;
      channel: Channel;
      previous: string;
      variant?: number;
    };
    if (!resume || !job || (channel !== "message" && channel !== "email") || typeof previous !== "string") {
      res.status(400).json({ error: "resume, job, a valid channel, and the previous draft are required" });
      return;
    }

    const referrer = job.referrer ?? synthesizeReferrer(job);
    const gaps = computeOutreachGaps(resume, job);

    if (env.hasGemini) {
      try {
        const { text } = await generateStructured<{ text: string }>(
          buildRegeneratePrompt(resume, job, referrer, gaps, channel, previous),
          REGENERATE_SCHEMA,
        );
        res.json({ text, usedAi: true });
        return;
      } catch {
        // fall through to local template
      }
    }

    // No Gemini available: the deterministic fallback template still rotates through a
    // few equivalent phrasings by `variant`, so "regenerate" produces something genuinely
    // different rather than silently returning the exact same text.
    const { customMessage, customEmail } = draftOutreachFallback(resume, job, referrer, gaps, variant ?? 1);
    res.json({ text: channel === "message" ? customMessage : customEmail, usedAi: false });
  } catch {
    res.status(500).json({ error: "Failed to regenerate outreach" });
  }
});
