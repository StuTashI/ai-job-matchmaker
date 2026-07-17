import { useCallback, useState } from "react";
import { storage, STORAGE_KEYS } from "../lib/storage";
import type { Job, TrackedJob, TrackerStage } from "../lib/types";

export function useTracker() {
  const [trackedJobs, setTrackedJobs] = useState<TrackedJob[]>(
    () => storage.read<TrackedJob[]>(STORAGE_KEYS.trackedJobs) ?? [],
  );

  const persist = useCallback((next: TrackedJob[]) => {
    setTrackedJobs(next);
    storage.write(STORAGE_KEYS.trackedJobs, next);
  }, []);

  const track = useCallback(
    (job: Job, stage: TrackerStage = "Interested") => {
      setTrackedJobs((prev) => {
        if (prev.some((t) => t.job.id === job.id)) return prev;
        const next = [...prev, { job, stage, addedAt: new Date().toISOString() }];
        storage.write(STORAGE_KEYS.trackedJobs, next);
        return next;
      });
    },
    [],
  );

  const isTracked = useCallback(
    (jobId: string) => trackedJobs.some((t) => t.job.id === jobId),
    [trackedJobs],
  );

  const moveStage = useCallback((jobId: string, stage: TrackerStage) => {
    setTrackedJobs((prev) => {
      const next = prev.map((t) => (t.job.id === jobId ? { ...t, stage } : t));
      storage.write(STORAGE_KEYS.trackedJobs, next);
      return next;
    });
  }, []);

  const remove = useCallback((jobId: string) => {
    setTrackedJobs((prev) => {
      const next = prev.filter((t) => t.job.id !== jobId);
      storage.write(STORAGE_KEYS.trackedJobs, next);
      return next;
    });
  }, []);

  const addManual = useCallback(
    (job: Job) => {
      track(job, "Interested");
    },
    [track],
  );

  return { trackedJobs, track, isTracked, moveStage, remove, addManual, persist };
}
