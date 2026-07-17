import { useState } from "react";
import type { Job, JobType, Portal } from "../lib/types";
import { Modal } from "./Modal";

const PORTALS: Portal[] = ["LinkedIn", "Indeed", "Wellfound", "Naukri", "Flexjobs", "Google"];
const JOB_TYPES: JobType[] = ["Remote", "Hybrid", "In Office"];

interface ManualJobModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (job: Job) => void;
}

export function ManualJobModal({ open, onClose, onAdd }: ManualJobModalProps) {
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<JobType>("Remote");
  const [portal, setPortal] = useState<Portal>("LinkedIn");

  function reset() {
    setTitle("");
    setCompany("");
    setLocation("");
    setUrl("");
    setType("Remote");
    setPortal("LinkedIn");
  }

  function handleSubmit() {
    if (!title.trim() || !company.trim()) return;
    onAdd({
      id: `manual:${Date.now()}`,
      title,
      company,
      location,
      type,
      portal,
      url,
      description: "",
      requirements: [],
      postedAt: new Date().toISOString(),
    });
    reset();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a Job Manually">
      <div className="space-y-3">
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Job title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Job posting URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <div className="flex gap-3">
          <select
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value as JobType)}
          >
            {JOB_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={portal}
            onChange={(e) => setPortal(e.target.value as Portal)}
          >
            {PORTALS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Add Job
        </button>
      </div>
    </Modal>
  );
}
