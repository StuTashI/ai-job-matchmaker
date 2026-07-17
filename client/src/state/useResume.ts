import { useCallback, useState } from "react";
import { storage, STORAGE_KEYS } from "../lib/storage";
import type { ParsedResume, ResumeFile } from "../lib/types";

export function useResume() {
  const [resume, setResumeState] = useState<ParsedResume | null>(() => storage.read<ParsedResume>(STORAGE_KEYS.resume));
  const [resumeFile, setResumeFileState] = useState<ResumeFile | null>(() =>
    storage.read<ResumeFile>(STORAGE_KEYS.resumeFile),
  );

  const setResume = useCallback((next: ParsedResume, file?: ResumeFile) => {
    setResumeState(next);
    storage.write(STORAGE_KEYS.resume, next);
    if (file) {
      setResumeFileState(file);
      storage.write(STORAGE_KEYS.resumeFile, file);
    }
  }, []);

  const clearResume = useCallback(() => {
    setResumeState(null);
    setResumeFileState(null);
    storage.remove(STORAGE_KEYS.resume);
    storage.remove(STORAGE_KEYS.resumeFile);
  }, []);

  return { resume, resumeFile, setResume, clearResume };
}
