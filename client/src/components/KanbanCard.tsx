import { Trash2 } from "lucide-react";
import type { TrackedJob } from "../lib/types";

interface KanbanCardProps {
  tracked: TrackedJob;
  onView: () => void;
  onRemove: () => void;
}

export function KanbanCard({ tracked, onView, onRemove }: KanbanCardProps) {
  const { job } = tracked;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", job.id);
      }}
      className="cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onView} className="text-left text-sm font-semibold text-slate-900 hover:text-indigo-600">
          {job.title}
        </button>
        <button type="button" onClick={onRemove} className="shrink-0 text-slate-400 hover:text-rose-600" aria-label="Remove">
          <Trash2 size={14} />
        </button>
      </div>
      <p className="text-xs text-slate-500">{job.company}</p>
      <p className="mt-1 text-xs text-slate-400">{job.portal}</p>
    </div>
  );
}
