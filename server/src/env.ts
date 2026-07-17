import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, "../../.env");
config({ path: ENV_PATH });

const geminiKey = process.env.GEMINI_API_KEY?.trim() || undefined;
const apifyToken = process.env.APIFY_TOKEN?.trim() || undefined;

export const env = {
  geminiApiKey: geminiKey,
  apifyToken: apifyToken,
  port: Number(process.env.PORT) || 4000,
  hasGemini: Boolean(geminiKey),
  hasApify: Boolean(apifyToken),
};

type Listener = () => void;
const listeners: Listener[] = [];

/** Register a callback to run whenever API keys are updated at runtime — used by
 * services that cache an SDK client instance keyed off the value at import time. */
export function onKeysUpdated(listener: Listener): void {
  listeners.push(listener);
}

function persistToEnvFile(updates: Record<string, string>): void {
  let lines: string[] = [];
  try {
    lines = fs.readFileSync(ENV_PATH, "utf-8").split(/\r?\n/);
  } catch {
    lines = [];
  }

  const seen = new Set<string>();
  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (match && Object.prototype.hasOwnProperty.call(updates, match[1])) {
      seen.add(match[1]);
      return `${match[1]}=${updates[match[1]]}`;
    }
    return line;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) nextLines.push(`${key}=${value}`);
  }

  const content = nextLines.join("\n").replace(/\n+$/, "") + "\n";
  fs.writeFileSync(ENV_PATH, content);
}

export interface KeyUpdates {
  geminiApiKey?: string;
  apifyToken?: string;
}

/** Updates keys in memory, persists them to the .env file, and notifies any
 * registered listeners (e.g. to rebuild a cached SDK client) — no server restart needed. */
export function updateKeys(updates: KeyUpdates): void {
  const fileUpdates: Record<string, string> = {};

  if (updates.geminiApiKey !== undefined) {
    const trimmed = updates.geminiApiKey.trim();
    env.geminiApiKey = trimmed || undefined;
    env.hasGemini = Boolean(env.geminiApiKey);
    fileUpdates.GEMINI_API_KEY = trimmed;
  }
  if (updates.apifyToken !== undefined) {
    const trimmed = updates.apifyToken.trim();
    env.apifyToken = trimmed || undefined;
    env.hasApify = Boolean(env.apifyToken);
    fileUpdates.APIFY_TOKEN = trimmed;
  }

  if (Object.keys(fileUpdates).length > 0) {
    persistToEnvFile(fileUpdates);
  }
  for (const listener of listeners) listener();
}

function maskKey(value: string | undefined): string | null {
  if (!value) return null;
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export function getConfigStatus() {
  return {
    hasGemini: env.hasGemini,
    hasApify: env.hasApify,
    geminiKeyPreview: maskKey(env.geminiApiKey),
    apifyTokenPreview: maskKey(env.apifyToken),
  };
}
