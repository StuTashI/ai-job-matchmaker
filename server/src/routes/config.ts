import { Router } from "express";
import { getConfigStatus, updateKeys } from "../env.js";

export const configRouter = Router();

configRouter.get("/", (_req, res) => {
  res.json(getConfigStatus());
});

configRouter.post("/", (req, res) => {
  try {
    const { geminiApiKey, apifyToken } = req.body as { geminiApiKey?: string; apifyToken?: string };
    if (geminiApiKey === undefined && apifyToken === undefined) {
      res.status(400).json({ error: "Provide at least one of geminiApiKey or apifyToken" });
      return;
    }
    updateKeys({ geminiApiKey, apifyToken });
    res.json(getConfigStatus());
  } catch {
    res.status(500).json({ error: "Failed to save configuration" });
  }
});
