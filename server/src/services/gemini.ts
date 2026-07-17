import { GoogleGenAI } from "@google/genai";
import { env, onKeysUpdated } from "../env.js";

let client: GoogleGenAI | null = env.hasGemini ? new GoogleGenAI({ apiKey: env.geminiApiKey }) : null;

onKeysUpdated(() => {
  client = env.hasGemini ? new GoogleGenAI({ apiKey: env.geminiApiKey }) : null;
});

const MODEL = "gemini-3.5-flash";
const TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("gemini timeout")), ms)),
  ]);
}

export async function generateStructured<T>(prompt: string, schema: object, timeoutMs = TIMEOUT_MS): Promise<T> {
  if (!client) throw new Error("gemini not configured");
  const res = await withTimeout(
    client.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema as any,
      },
    }),
    timeoutMs,
  );
  const text = res.text;
  if (!text) throw new Error("gemini returned empty response");
  return JSON.parse(text) as T;
}

export interface GroundingResult {
  text: string;
  sources: { uri?: string; title?: string }[];
}

export async function searchGroundedJobs(query: string): Promise<GroundingResult> {
  if (!client) throw new Error("gemini not configured");
  const res = await withTimeout(
    client.models.generateContent({
      model: MODEL,
      contents: query,
      config: {
        tools: [{ googleSearch: {} }],
      },
    }),
    TIMEOUT_MS,
  );
  const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks
    .map((c) => ({ uri: c.web?.uri, title: c.web?.title }))
    .filter((s) => s.uri);
  return { text: res.text ?? "", sources };
}
