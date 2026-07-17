# CLAUDE.md

Instructions for Claude when working on the **AI-Powered Job Matchmaker & Application Tracker**.

## Project Overview

Full-stack app that helps job seekers aggregate roles from multiple portals, score fit against their resume, generate outreach messages, and track applications end-to-end. Acts as an AI career copilot. Originally scoped from a PRD provided directly during initial build — that source PRD was never checked into the repo, so don't look for a `PRD.md` file; treat this document and the current codebase as the source of truth instead. No database — all persistence is client-side `localStorage`.

## Deployment Model: Self-Hosted, No Multi-User Auth

This is a clone-and-run-yourself project — each user runs their own copy locally (or deploys their own instance) and configures their own API keys. This was a deliberate decision, not an oversight: a full auth layer (signup/login, Gmail SSO, per-user credential storage) was considered and explicitly declined in favor of the simpler model, since the project is meant to be published as a public GitHub repo for anyone to clone. Don't build authentication, multi-tenancy, or per-user credential storage without being asked — the Configuration page (see below) exists precisely so a single self-hosted user can supply their own keys without needing an account system.

## Tech Stack & Layout

npm workspaces monorepo:

```
client/   React 19 + Vite + Tailwind 4 + Lucide React + Motion
server/   Express 5 + tsx (dev) / esbuild (build)
```

- **AI**: `@google/genai` (Gemini + Google Search Grounding), model `gemini-3.5-flash` (`gemini-2.5-flash` was deprecated for new API keys mid-project — if Gemini calls start failing outright rather than timing out, check whether the configured model has been deprecated again before assuming a logic bug)
- **Scraping**: `apify-client` (primary) with Gemini Search Grounding fallback
- **Storage**: Client-side `localStorage` for resume + tracked jobs (Firestore planned for Phase 2, not built). API keys (`GEMINI_API_KEY`/`APIFY_TOKEN`) are also runtime-configurable from the app itself — see Configuration below — and persist server-side to `.env`, not localStorage.

## Running & Verifying

- `npm run dev` — runs both via `concurrently`. Server on :4000, client (Vite) on :5173, `/api/*` proxied to the server in dev.
- `npm run build && npm start` — production build; Express serves the built client statically, no proxy/CORS needed in prod.
- `npm run typecheck -w server` / `npm run typecheck -w client` — run after any change; both must stay clean before considering work done.
- **No test suite exists** — there's no `npm test`. Verification has been done by calling routes directly with `curl` and by driving the real browser with a throwaway Playwright script (installed ad hoc into the scratchpad — not part of the repo, not something to assume is still set up). When changing behavior, verify it actually works end-to-end, not just that it typechecks.

## Environment

`.env` at repo root (gitignored; `.env.example` documents the shape, keep them in sync):
- `GEMINI_API_KEY` — required for all AI features; every AI-backed route degrades to a local heuristic when absent or on any failure/timeout.
- `APIFY_TOKEN` — required for real job scraping; falls back to Gemini Google Search Grounding per-portal when absent or when an actor returns nothing.
- `PORT` — server port, default 4000.

**Gemini free-tier quota is tight in practice** (as low as 20 requests/day observed on the dev key). Expect the fallback path to activate during heavy manual testing — that's the graceful-degradation design working, not a bug. `server/src/env.ts` exposes `hasGemini`/`hasApify` booleans; `/api/health` reports both live.

**Keys are also runtime-mutable, not just `.env`-at-boot.** This project is meant to be cloned and self-hosted (see Deployment Model below), so `client/src/pages/ConfigPage.tsx` (reached via the sidebar's "Configuration" section, route `server/src/routes/config.ts`) lets a user paste their own Gemini/Apify keys directly in the running app. `env.ts` exposes `updateKeys()` (updates in-memory state + rewrites `.env` on disk) and an `onKeysUpdated()` listener so `gemini.ts`/`apify.ts` can rebuild their cached SDK clients without a server restart. If you add a new external API key to the project, wire it through this same runtime-update path, not just a boot-time `process.env` read.

## Architecture: Modules

Keep concerns separated along these lines — this is also roughly the file layout under `server/src/`:

- **A. Resume Parser** (`routes/resume.ts`, `services/resumeExtract.ts`, `services/resumeFallback.ts`) — Extracts text from PDF (`pdf-parse`, note its v2 API is a `PDFParse` class, not the old function-call API)/DOCX (`mammoth`)/plain text, sends to Gemini (heuristic fallback), returns `ParsedResume` JSON plus a generated `careerNarrative` (a readable career-summary paragraph shown in the UI as a "Career Snapshot" card).
- **B. Job Scraping Engine** (`routes/jobs.ts`, `services/apify.ts`, `services/jobNormalize.ts`) — Apify scrapers per portal (LinkedIn, Indeed, Wellfound, Naukri, Flexjobs, Google). If empty/failed, falls back to Gemini Google Search Grounding **per portal**. Always normalizes to the `Job` shape before it leaves the server. Results can be filtered client-side by Posted date, Source (portal), and sorted by match score or date.
- **C. Matchmaker & Scorer** (`routes/match.ts`, `services/scoringSignals.ts`, `services/matchFallback.ts`) — Six weighted relevancy dimensions (function 25%, domain 25%, skills 20%, experience 15%, scope 10%, company-context 5%) plus four override rules (function-mismatch hard gate, mandatory-unmet-requirement hard cap, transferable-skill credit, asymmetric over/under-qualification degradation). Score range ~2–98%. Emits `matchScore`, `gaps`, `improvements`, and a mandatory `guidance` object (see below) — there is no separate "interview call probability" score; that was deliberately removed in favor of the guidance layer.
- **D. Outreach Generator** (`routes/outreach.ts`, `services/outreachFallback.ts`) — Produces a LinkedIn InMail-style message (~80-150 words) and a cold email (~120-180 words, subject required and must name the exact role), both built from a fixed five-part structure — Hook (exact job title + real link, never fabricated) → Bridge (≤2 concrete achievements) → The Ask (varies: "happy to apply, introducing myself first" if the referrer is a job-poster-type title, otherwise a referral/pointer ask) → Honest Gap (only if a real gap exists) → Low-friction close. Tone stays direct/honest/low-pressure, never corporate-speak. Auto-generates a plausible referrer contact per job (`synthesizeReferrer` / `isJobPoster` in `outreachFallback.ts` classify the referrer's title to pick the Ask framing).
- **E. Application Tracker** (`client/src/pages/TrackerPage.tsx`, `client/src/components/Kanban*`) — Stages: `Interested` → `Applied` → `Interviewing` → `Offer Received` → `Archived`. Supports manual entries, native HTML5 drag-and-drop between columns.
- **F. Guidance Layer** (built into `services/scoringSignals.ts` → `computeScores()`) — Every scored job gets a `guidance` object: a Gap Type classification (`hard_filter` | `positioning` | `volume_competition` | `structural_mismatch`), a recommended Path (`apply_standard` | `apply_referral` | `referral_first` | `reframe_then_apply` | `skip`), and deterministic Verdict/Why/Do-This/Confidence-note text. `why`/`doThis` prose can be overridden with richer Gemini-authored text (via `computeScores(signals, overrides)`), but `gapType`/`path` are always deterministic from `signals` regardless of source — never let Gemini override the classification, only the prose explaining it. A batch-level "Today's Priority" ranking (`client/src/lib/priority.ts`) surfaces the 1-2 jobs worth prioritizing today, shown as a banner above search results once batch scoring completes.
- **G. Configuration** (`client/src/pages/ConfigPage.tsx`, `server/src/routes/config.ts`) — Lets a self-hosted user paste their own `GEMINI_API_KEY`/`APIFY_TOKEN` into the running app rather than editing `.env` by hand. See the runtime-mutable keys note under Environment above.

## Data Models (source of truth)

Defined in both `server/src/types.ts` and `client/src/lib/types.ts` — **keep them in sync manually**, there's no shared package. Current shape (has grown since the original scoping conversation — treat the code as the source of truth):

```ts
ParsedResume { name, email, phone?, summary, skills[], experience[{role, company, duration, highlights[]}], education[], noticePeriodMonths?, careerNarrative? }
Job { id, title, company, location, type: "Remote"|"Hybrid"|"In Office", portal: "LinkedIn"|"Indeed"|"Wellfound"|"Naukri"|"Flexjobs"|"Google", url, description, requirements[], postedAt, referrer?, analysis?, applicantCount?, companySize? }
JobGuidance { verdict, why[], gapType: GapType, path: GuidancePath, doThis[], confidenceNote }
JobAnalysis { matchScore, gaps[], improvements[], guidance: JobGuidance, customMessage, customEmail }
```

`GapType` and `GuidancePath` (and the `JobGuidance`/`JobAnalysis` interfaces) live in `server/src/types.ts`, not in `scoringSignals.ts` — this was deliberate, to avoid a circular import between the scoring service and the shared types file. Client-only label maps for rendering (`GAP_TYPE_LABELS`, `PATH_LABELS`) live in `client/src/lib/types.ts` alongside the mirrored types, since the server has no use for display labels.

## Core Pattern: Gemini + Deterministic Fallback, Everywhere

Every AI-backed capability has two implementations behind the same interface, with the Gemini path wrapped in try/catch that falls through silently on any error/timeout — this is a hard requirement, not optional polish:

| Capability | Gemini path | Fallback path |
|---|---|---|
| Resume parsing | `routes/resume.ts` → `services/gemini.ts` | `services/resumeFallback.ts` |
| Match scoring | `routes/match.ts` | `services/matchFallback.ts` |
| Outreach drafting | `routes/outreach.ts` | `services/outreachFallback.ts` |
| Job search (per portal, if Apify empty/fails) | `services/gemini.ts` (`searchGroundedJobs`) | — (returns empty for that portal, not a crash) |

**Scoring specifically** is architected as one deterministic formula (`services/scoringSignals.ts` → `computeScores()`) fed by two different signal-extraction paths: a fast heuristic (`extractSignalsHeuristic`, used for bulk list-view scoring on every search result, no network call) and a Gemini-powered classifier (used only in the on-demand Analyze drawer, prompt in `routes/match.ts`). The arithmetic never diverges between the two paths — only classification quality does. This is deliberate: scoring every search result (40-80+ jobs) through Gemini per search would be slow and burns quota fast, so the list gets an instant free score and the deep-dive drawer gets the richer AI read. The two numbers for the same job can legitimately differ — that's expected, not a bug. The same split applies to the `guidance` object's `why`/`doThis` prose: the Gemini path can supply richer authored text via `computeScores(signals, { why, doThis })`, but `gapType`/`path` are computed the same deterministic way regardless of which signal source fed them — never let an override change the classification, only the explanatory prose.

`generateStructured()` in `services/gemini.ts` takes an optional `timeoutMs` (default 15s). Pass a longer one explicitly for calls generating a lot of output — e.g. resume parsing + career narrative in one call needs 30s (see `routes/resume.ts`), and match scoring's signals+guidance-prose generation needs 25s (see `routes/match.ts`). **A silent, unexplained fallback is often actually a timeout, not a real failure** — if fallback output looks wrong, don't assume it's a logic bug before checking whether the Gemini call is simply timing out (call the SDK directly with a small debug script to confirm).

## Job Scraping Details

`services/apify.ts` maps each portal to one specific Apify actor. Each actor has a genuinely different input schema and output shape — when adding/changing a portal integration, verify the actor's real schema via the Apify API (`GET /v2/acts/{id}` for `exampleRunInput`, `GET /v2/acts/{id}/builds/{buildId}` for the full `actorDefinition.input` schema and README) rather than guessing field names. `services/jobNormalize.ts` has one hand-written mapper per portal into the shared `Job` type; wrap each mapper's per-item processing in try/catch so one malformed record doesn't drop the whole batch.

`routes/jobs.ts` fans a search out across every (title × portal) combination (multi-role search is supported via chip input), applies a title-based relevance filter (checking JD text alone is too noisy — e.g. almost any tech job description mentions "product managers" as a stakeholder), dedupes by job ID, and falls back to Gemini grounding per-portal when Apify returns nothing for that portal.

## Client State — Two Patterns, Don't Mix Them Up

- **Persisted across browser sessions** (survives refresh, via `localStorage`): resume + parsed data (`state/useResume.ts`), tracked jobs (`state/useTracker.ts`).
- **Persisted across in-app page navigation only** (in-memory, NOT localStorage): job search results + search form criteria (`state/useJobSearch.ts`). This exists because `App.tsx` conditionally renders `<HomePage />` vs `<TrackerPage />` and unmounts the inactive one — any state that needs to survive a Search↔Tracker switch must live in `AppContext`, not in a page/component's local `useState`. **This has already caused a real bug once** (search results and form inputs silently reset on every tab switch) — if you add new page-level state that should survive navigation, put it in a context hook, not local state.

All state hooks merge into one `AppContext` (`state/AppContext.tsx`), consumed via `useAppState()`.

## Conventions & Constraints

- **API keys stay server-side.** All Gemini/Apify calls route through `/api/*`. Never expose keys to the client bundle.
- **Graceful degradation is required.** Every AI path needs a local heuristic/rules-based fallback for API outages, timeouts, or missing credentials — see the pattern above.
- **No restrictive browser APIs.** Do not use `window.open`, `window.alert`, or similar for app-generated UI. Use in-app drawers, custom modals, toasts, and dynamic target transitions instead (iframe-safe). Plain `<a href target="_blank">` for viewing an external job posting is fine — that's normal navigation, not a popup.
- **Normalize before returning.** Never leak per-portal raw Apify schemas to the frontend — always go through `jobNormalize.ts`.
- **Job aggregation target**: ≥5 portals in under 10s where possible (real scraping often takes longer in practice; the 90s outer timeout in `routes/jobs.ts` reflects reality, not the original target).
- **Sidebar is a fixed, always-visible left rail** (`client/src/components/Sidebar.tsx`), not a toggleable hamburger drawer — there's no open/close state or backdrop anymore. Page content is offset via `paddingLeft: SIDEBAR_WIDTH_PX` in `App.tsx`. If you resize the sidebar, update `SIDEBAR_WIDTH_PX` (exported from `Sidebar.tsx`) rather than hardcoding the width in two places.

## Known Rough Edges (don't be surprised, don't silently "fix" without noticing the tradeoff)

- `parseYearsFromRange` (in `resumeFallback.ts`) computes experience duration from year-difference only, not months — a role spanning e.g. "Apr 2023 – Dec 2023" counts as 0 years. Minor undercount in aggregate experience totals; known, not yet fixed.
- `contextTier` (company-type matching in `scoringSignals.ts`) defaults to `"neutral"` most of the time — there's no reliable data source for a candidate's past company sizes/types beyond name-matching a small list of well-known large companies. This is the weakest signal in the scoring model.
- The resume fallback parser is tuned against real-world PDF extraction quirks (multi-line wrapped bullets, "Current" vs "Present" as an end-date, pipe-separated "Role | Company | Location" headers, PDF page-break artifacts like "-- 1 of 2 --", hyphens embedded in titles like "Product Manager - 2"). **If you touch `resumeFallback.ts`, test against an actual multi-page PDF resume via `pdf-parse`, not just clean synthetic text** — several real bugs here were only caught that way, not by unit-testing against tidy sample data.

## When Editing

- Match existing file/module boundaries — resume, scraping, scoring, outreach, tracker are separate concerns in separate files.
- If adding a new job portal: extend the `Portal` union in both `types.ts` files, add an Apify actor mapping + input builder in `services/apify.ts`, and add a normalization adapter in `services/jobNormalize.ts`.
- If changing scoring: preserve the `computeScores()` single-source-of-truth pattern — don't let the heuristic and Gemini paths diverge in arithmetic, only in signal quality. `gapType`/`path` inside `guidance` must stay deterministic from `signals` too — only `why`/`doThis` prose is allowed to differ between the heuristic and Gemini paths.
- If touching outreach: keep the five-part structure (Hook → Bridge → Ask → Honest Gap → Low-friction close, see `outreachFallback.ts` and the reference example embedded in the `routes/outreach.ts` prompt) and the direct/honest/low-pressure tone — avoid corporate-speak ("align with your goals", "translate into impact"). Update both `outreachFallback.ts` (deterministic) and the `routes/outreach.ts` prompt together — don't change one without the other.
- Run `npm run typecheck -w server` and `-w client` after every change, and actually exercise the affected flow (curl the route, or drive it in a browser) before calling something fixed — this codebase has repeatedly had bugs that typechecked cleanly but were wrong at runtime (regex edge cases, timeout-vs-logic-failure confusion, state lifted to the wrong layer).

## Roadmap Awareness (don't build ahead of phase without being asked)

- Phase 2: Firestore sync across a user's own devices — **not** a multi-user account system. The original PRD phrased this as "Firestore sync + multi-device auth," but that predates the Deployment Model decision above; any future auth here would be single-user device linking (e.g. a device pairing code), not signup/login/SSO.
- Phase 3: ATS-optimized PDF resume export
- Phase 4: AI Interview Copilot (voice/text mock interviews)
