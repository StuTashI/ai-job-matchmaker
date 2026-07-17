import { useState } from "react";
import { Plus } from "lucide-react";
import type { Job, TrackedJob } from "../lib/types";
import { KanbanBoard } from "../components/KanbanBoard";
import { ManualJobModal } from "../components/ManualJobModal";
import { JobDetailDrawer } from "../components/JobDetailDrawer";
import { useAppState } from "../state/AppContext";

export function TrackerPage() {
  const { trackedJobs, moveStage, remove, addManual } = useAppState();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  function handleView(tracked: TrackedJob) {
    setSelectedJob(tracked.job);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Application Tracker</h1>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus size={16} /> Add Manually
        </button>
      </div>

      {trackedJobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          No tracked jobs yet — track a job from the search results, or add one manually.
        </div>
      ) : (
        <KanbanBoard trackedJobs={trackedJobs} onMoveStage={moveStage} onView={handleView} onRemove={remove} />
      )}

      <ManualJobModal open={modalOpen} onClose={() => setModalOpen(false)} onAdd={addManual} />
      <JobDetailDrawer job={selectedJob} onClose={() => setSelectedJob(null)} />
    </div>
  );
}
