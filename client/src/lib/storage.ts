function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable or quota exceeded — silently ignore, state stays in-memory
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const storage = { read, write, remove };

export const STORAGE_KEYS = {
  resume: "jm:v1:resume",
  resumeFile: "jm:v1:resumeFile",
  trackedJobs: "jm:v1:trackedJobs",
} as const;
