# AI Job Matchmaker & Application Tracker

An AI career copilot that helps you find relevant job openings across multiple portals, score how well they match your resume, draft outreach messages to real contacts, and track your applications end-to-end — all in one place.

Everything runs **entirely on your own machine** (or your own hosting). There's no shared backend, no account system, and no third party holding your resume or API keys — you bring your own Gemini and Apify keys, and they never leave your local server.

## Features

- **Resume Parser** — Upload a PDF, DOCX, or plain-text resume. It's parsed into structured data (skills, experience, education) plus a readable "Career Snapshot" summary.
- **Find Jobs** — Searches LinkedIn, Indeed, Wellfound, Naukri, Flexjobs, and Google Jobs in parallel for the roles and locations you specify.
- **LinkedIn Job Posts** — A second search mode that finds LinkedIn *posts* announcing hiring (not the structured job board — people/companies posting "we're hiring X"), showing only organic posts (LinkedIn's own structured job-card posts are filtered out, since those are already covered by Find Jobs). Filters out non-job posts automatically, and never invents a company/title it isn't confident about. No match score is shown for this mode — see Match Scoring below.
- **Match Scoring** — On the Find Jobs tab, every job gets scored against your resume using a six-dimension rubric (skill/experience overlap, domain/industry match, role/seniority, quantified impact, ATS keyword coverage, ownership/scope), banded Excellent/Strong/Moderate/Weak, plus a plain-English verdict on whether it's worth applying to and how (apply directly, seek a referral first, etc.). Opening a job's **Analyze** tab runs a deeper, evidence-based report — what's good, what's bad, skill gaps, and specific before/after rewrite suggestions, each one traced back to an actual line in your resume. A "Today's Priority" banner summarizes each batch as an insight (e.g. "3 jobs look like a strong match — 2 ready to apply directly"). LinkedIn Job Posts intentionally skips scoring/priority — see above.
- **Outreach Drafting** — Generates a LinkedIn message and a cold email for a plausible referrer contact at each company, with a regenerate option that produces a genuinely different draft, not just a reword.
- **Application Tracker** — A Kanban board (Interested → Applied → Interviewing → Offer Received → Archived) with drag-and-drop, backed by your browser's local storage. Manually-added jobs can use any source name, not just the built-in portals.

## How it stays useful without paid API access

Most AI-backed features (resume parsing, outreach drafting, list-view match scoring) have a **built-in fallback** that runs locally with no API calls at all, using deterministic heuristics instead of an LLM. If you don't have a Gemini key, or you hit a quota limit, the app keeps working — it just uses simpler local logic instead of AI (list-view scores get a clearly-labeled "estimated" badge in that case). Job search works the same way per-portal: if the scraping step comes back empty, it falls back to an AI-assisted search instead of failing outright (this fallback does need a Gemini key). The one exception is the deep, evidence-based fit report in a job's Analyze tab — tracing every claim back to a specific resume line isn't something a local heuristic can meaningfully approximate, so that specific report requires a working Gemini key and shows a clear "unavailable" message (with a retry) if the key is missing or its quota is exhausted, rather than a fabricated report.

**Gemini's free tier is genuinely tight** — as low as 20 requests/day, shared across every AI feature in the app. It's easy to exhaust with normal use (e.g. a couple of large job searches). The app is built to degrade gracefully when that happens rather than break, but if you want reliable access to the deep Analyze report, plan for a paid key or keep usage light.

## Prerequisites

- **Node.js 20 or newer** (tested on Node 24) and npm
- A **Gemini API key** — optional, but unlocks the AI-backed features. Get one free at [Google AI Studio](https://aistudio.google.com/apikey).
- An **Apify API token** — optional, unlocks real job scraping instead of the AI-search fallback. Get one at [apify.com](https://apify.com) (free tier available). Note: the LinkedIn Job Posts search is pay-per-post on Apify's side (fractions of a cent each), and there's no usage cap built into the app — keep an eye on how many role titles you search at once (free-tier Apify accounts cap at 4 keywords per search anyway).

You can run the whole app with neither key — it'll just use the local fallbacks throughout.

## Getting Started

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd <repo-folder>

# 2. Install dependencies (installs both client and server)
npm install

# 3. Set up your environment
cp .env.example .env
# then open .env and paste in your GEMINI_API_KEY / APIFY_TOKEN (both optional — see above)

# 4. Start the app
npm run dev
```

Then open **http://localhost:5173** in your browser. The client runs on port 5173 and proxies API calls to the server on port 4000.

**Don't want to edit `.env` by hand?** You can also leave the keys blank and paste them in later from inside the running app itself — open **Configuration** → **API Keys** in the sidebar. That page writes back to `.env` for you and picks up the change without a restart.

## Available Scripts

Run these from the repo root:

| Command | What it does |
|---|---|
| `npm run dev` | Starts both the client (Vite, port 5173) and server (Express, port 4000) in development mode, with hot reload. |
| `npm run build` | Builds the client and server for production. |
| `npm start` | Runs the production build (`npm run build` first) — serves everything from a single port, no proxy needed. |
| `npm run typecheck -w server` | Type-checks the server only. |
| `npm run typecheck -w client` | Type-checks the client only. |

## Tech Stack

- **Client**: React 19, Vite, Tailwind CSS 4, Lucide React icons, Motion (animations)
- **Server**: Express 5, TypeScript, `tsx` for dev / `esbuild` for production builds
- **AI**: Google Gemini (`@google/genai`), including Google Search Grounding as a job-search fallback
- **Scraping**: Apify (`apify-client`)
- **Storage**: Browser `localStorage` — there is no database

## Project Structure

```
client/   React app (pages, components, client-side state)
server/   Express API (resume parsing, job search, scoring, outreach)
```

See [`CLAUDE.md`](CLAUDE.md) for a detailed breakdown of the architecture, module boundaries, and known rough edges — useful if you're extending the project rather than just running it.

## License

MIT — see [`LICENSE`](LICENSE).
