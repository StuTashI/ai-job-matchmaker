import { TRACKER_STAGES } from "../lib/types";
import type { TrackedJob, TrackerStage } from "../lib/types";
import { KanbanColumn } from "./KanbanColumn";

interface KanbanBoardProps {
  trackedJobs: TrackedJob[];
  onMoveStage: (jobId: string, stage: TrackerStage) => void;
  onView: (tracked: TrackedJob) => void;
  onRemove: (jobId: string) => void;
}

export function KanbanBoard({ trackedJobs, onMoveStage, onView, onRemove }: KanbanBoardProps) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {TRACKER_STAGES.map((stage) => (
        <KanbanColumn
          key={stage}
          stage={stage}
          jobs={trackedJobs.filter((t) => t.stage === stage)}
          onDropJob={onMoveStage}
          onView={onView}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
