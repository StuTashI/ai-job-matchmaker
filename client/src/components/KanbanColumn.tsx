import { useState, type DragEvent } from "react";
import type { TrackedJob, TrackerStage } from "../lib/types";
import { KanbanCard } from "./KanbanCard";

interface KanbanColumnProps {
  stage: TrackerStage;
  jobs: TrackedJob[];
  onDropJob: (jobId: string, stage: TrackerStage) => void;
  onView: (tracked: TrackedJob) => void;
  onRemove: (jobId: string) => void;
}

export function KanbanColumn({ stage, jobs, onDropJob, onView, onRemove }: KanbanColumnProps) {
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const jobId = e.dataTransfer.getData("text/plain");
    if (jobId) onDropJob(jobId, stage);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`flex min-h-[16rem] w-64 shrink-0 flex-col rounded-xl border p-3 transition-colors ${
        dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{stage}</h3>
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">{jobs.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {jobs.map((tracked) => (
          <KanbanCard
            key={tracked.job.id}
            tracked={tracked}
            onView={() => onView(tracked)}
            onRemove={() => onRemove(tracked.job.id)}
          />
        ))}
      </div>
    </div>
  );
}
