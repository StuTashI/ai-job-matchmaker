import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";
import { resumeRouter } from "./routes/resume.js";
import { jobsRouter } from "./routes/jobs.js";
import { matchRouter } from "./routes/match.js";
import { outreachRouter } from "./routes/outreach.js";
import { configRouter } from "./routes/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors({ origin: true }));
// Batch match-scoring requests carry the full job list (title/description/requirements
// for every search result) — with the Google source uncapped, that can be hundreds of
// jobs, so this needs real headroom beyond a typical small-JSON default.
app.use(express.json({ limit: "25mb" }));

app.use("/api/resume", resumeRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/match", matchRouter);
app.use("/api/outreach", outreachRouter);
app.use("/api/config", configRouter);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasGemini: env.hasGemini, hasApify: env.hasApify });
});

const clientDist = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) {
    next();
    return;
  }
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(env.port, () => {
  console.log(`Server listening on http://localhost:${env.port}`);
  console.log(`Gemini configured: ${env.hasGemini}, Apify configured: ${env.hasApify}`);
});
