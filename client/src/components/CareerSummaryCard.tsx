import { Sparkles } from "lucide-react";
import type { ParsedResume } from "../lib/types";

interface CareerSummaryCardProps {
  resume: ParsedResume;
}

export function CareerSummaryCard({ resume }: CareerSummaryCardProps) {
  if (!resume.careerNarrative) return null;

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-5">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles size={16} className="text-indigo-500" />
        <h2 className="text-sm font-semibold text-indigo-900">Career Snapshot</h2>
      </div>
      <p className="text-sm leading-relaxed text-slate-700">{resume.careerNarrative}</p>
    </div>
  );
}
