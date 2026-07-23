import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Check, Copy, ExternalLink, Loader2, RefreshCw, X } from "lucide-react";
import type { DimensionKey, GapType, GuidancePath, Job, JobAnalysis, Referrer } from "../lib/types";
import { BAND_LABELS, BAND_STYLES, DIMENSION_LABELS, DIMENSION_WEIGHTS, GAP_TYPE_LABELS, PATH_LABELS } from "../lib/types";
import { getOutreach, matchJob, regenerateOutreach } from "../lib/api";
import { useAppState } from "../state/AppContext";
import { useToast } from "./Toast";

const GAP_TYPE_STYLES: Record<GapType, string> = {
  hard_filter: "bg-amber-100 text-amber-700",
  positioning: "bg-sky-100 text-sky-700",
  volume_competition: "bg-violet-100 text-violet-700",
  structural_mismatch: "bg-rose-100 text-rose-700",
};

const PATH_STYLES: Record<GuidancePath, string> = {
  apply_standard: "bg-emerald-100 text-emerald-700",
  apply_referral: "bg-sky-100 text-sky-700",
  referral_first: "bg-amber-100 text-amber-700",
  reframe_then_apply: "bg-indigo-100 text-indigo-700",
  skip: "bg-rose-100 text-rose-700",
};

const DIMENSION_ORDER: DimensionKey[] = [
  "skillExperienceOverlap",
  "domainIndustryMatch",
  "roleSeniorityMatch",
  "quantifiedImpactStrength",
  "atsKeywordCoverage",
  "ownershipScopeMatch",
];

type Tab = "overview" | "analysis" | "outreach";

interface JobDetailDrawerProps {
  job: Job | null;
  onClose: () => void;
  onAnalysisUpdated?: (jobId: string, analysis: JobAnalysis) => void;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function RegenerateButton({ regenerating, onClick }: { regenerating: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={regenerating}
      aria-label="Regenerate with AI"
      title="Not happy with this? Regenerate with AI"
      className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
    >
      <RefreshCw size={14} className={regenerating ? "animate-spin" : ""} />
      {regenerating ? "Regenerating..." : "Regenerate"}
    </button>
  );
}

function DimensionTable({ analysis }: { analysis: JobAnalysis }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-slate-500">
            <th className="py-1 pr-2 font-medium">Dimension</th>
            <th className="py-1 pr-2 font-medium">Weight</th>
            <th className="py-1 font-medium">Score</th>
          </tr>
        </thead>
        <tbody>
          {DIMENSION_ORDER.map((key) => (
            <tr key={key} className="border-t border-slate-100">
              <td className="py-1 pr-2 text-slate-700">{DIMENSION_LABELS[key]}</td>
              <td className="py-1 pr-2 text-slate-500">{Math.round(DIMENSION_WEIGHTS[key] * 100)}%</td>
              <td className="py-1 font-medium text-slate-900">{analysis.dimensions[key]}/5</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function JobDetailDrawer({ job, onClose, onAnalysisUpdated }: JobDetailDrawerProps) {
  const { resume } = useAppState();
  const { show } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [outreach, setOutreach] = useState<{ customMessage: string; customEmail: string; referrer: Referrer } | null>(null);
  const [detailFetched, setDetailFetched] = useState(false);
  const [regeneratingMessage, setRegeneratingMessage] = useState(false);
  const [regeneratingEmail, setRegeneratingEmail] = useState(false);
  const [messageVariant, setMessageVariant] = useState(0);
  const [emailVariant, setEmailVariant] = useState(0);

  useEffect(() => {
    setTab("overview");
    setAnalysis(job?.analysis ?? null);
    setAnalysisError(null);
    setOutreach(null);
    setDetailFetched(false);
    setMessageVariant(0);
    setEmailVariant(0);
  }, [job?.id]);

  // Analysis and outreach are independent calls with independent error handling — analysis
  // can now genuinely fail (Gemini unconfigured/down, no fallback exists) while outreach
  // still succeeds via its own untouched fallback, so a shared catch would incorrectly
  // suppress outreach too.
  async function loadAnalysis() {
    if (!job || !resume) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const scored = await matchJob(resume, job);
      setAnalysis(scored);
      onAnalysisUpdated?.(job.id, scored);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Deep analysis is unavailable right now");
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function loadOutreach() {
    if (!job || !resume) return;
    setOutreachLoading(true);
    try {
      const drafted = await getOutreach(resume, job);
      setOutreach(drafted);
    } catch (err) {
      show(err instanceof Error ? err.message : "Failed to draft outreach", "error");
    } finally {
      setOutreachLoading(false);
    }
  }

  async function handleRegenerate(channel: "message" | "email") {
    if (!resume || !job || !outreach) return;
    const setRegenerating = channel === "message" ? setRegeneratingMessage : setRegeneratingEmail;
    const nextVariant = (channel === "message" ? messageVariant : emailVariant) + 1;
    setRegenerating(true);
    try {
      const previous = channel === "message" ? outreach.customMessage : outreach.customEmail;
      const { text } = await regenerateOutreach(resume, job, channel, previous, nextVariant);
      setOutreach((prev) =>
        prev ? { ...prev, ...(channel === "message" ? { customMessage: text } : { customEmail: text }) } : prev,
      );
      if (channel === "message") setMessageVariant(nextVariant);
      else setEmailVariant(nextVariant);
    } catch (err) {
      show(err instanceof Error ? err.message : "Failed to regenerate", "error");
    } finally {
      setRegenerating(false);
    }
  }

  function handleTabChange(next: Tab) {
    setTab(next);
    if ((next === "analysis" || next === "outreach") && !detailFetched) {
      setDetailFetched(true);
      // Skip re-fetching the deep report if this job already has one (persisted back via
      // onAnalysisUpdated from a previous open this session) — no reason to re-burn a
      // Gemini call on a job already fully analyzed.
      if (!analysis?.report) loadAnalysis();
      loadOutreach();
    }
  }

  return (
    <AnimatePresence>
      {job && (
        <motion.div
          className="fixed inset-0 z-40 flex justify-end bg-black/30"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.25 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-200 p-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{job.title}</h2>
                <p className="text-sm text-slate-500">{job.company} · {job.location}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close job details"
                className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex border-b border-slate-200 px-5">
              {(["overview", "analysis", "outreach"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTabChange(t)}
                  className={`border-b-2 px-3 py-2.5 text-sm font-medium capitalize transition-colors ${
                    tab === t ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="flex-1 space-y-4 p-5">
              {!resume && (tab === "analysis" || tab === "outreach") && (
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                  Upload your resume on the home page first to unlock match analysis and outreach drafts.
                </p>
              )}

              {tab === "overview" && (
                <>
                  {job.url && (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline"
                    >
                      View original posting <ExternalLink size={14} />
                    </a>
                  )}
                  <div>
                    <h3 className="mb-1 text-sm font-semibold text-slate-700">Description</h3>
                    <p className="whitespace-pre-line text-sm text-slate-600">{job.description || "No description available."}</p>
                  </div>
                  {job.requirements.length > 0 && (
                    <div>
                      <h3 className="mb-1 text-sm font-semibold text-slate-700">Requirements</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {job.requirements.map((req) => (
                          <span key={req} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                            {req}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {tab === "analysis" && resume && (
                <>
                  {analysisLoading && !analysis && (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="animate-spin" size={16} /> Analyzing fit...
                    </div>
                  )}
                  {analysisLoading && analysis && (
                    <div className="flex items-center gap-2 text-xs text-indigo-500">
                      <Loader2 className="animate-spin" size={12} /> Running the full evidence-based report...
                    </div>
                  )}

                  {analysis && (
                    <>
                      <div className="rounded-lg bg-slate-50 p-4">
                        <h3 className="mb-2 text-sm font-semibold text-slate-700">Score Summary</h3>
                        {analysis.estimated && (
                          <p
                            className="mb-2 rounded-md bg-amber-50 px-2 py-1 text-center text-[11px] text-amber-700"
                            title="Gemini was unavailable or out of quota, so this is a coarse local estimate, not the full AI analysis"
                          >
                            Estimated score — open Analyze for the full AI report
                          </p>
                        )}
                        <div className="text-center">
                          <p className="text-2xl font-bold text-indigo-600">{analysis.matchScore}%</p>
                          <p className="text-xs font-medium text-slate-500">{BAND_LABELS[analysis.band]}</p>
                        </div>
                        <p className="mt-3 text-center text-sm text-slate-700">{analysis.report?.verdict}</p>
                        <div className="mt-3">
                          <DimensionTable analysis={analysis} />
                        </div>
                      </div>

                      <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-4">
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${GAP_TYPE_STYLES[analysis.guidance.gapType]}`}>
                            {GAP_TYPE_LABELS[analysis.guidance.gapType]}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PATH_STYLES[analysis.guidance.path]}`}>
                            {PATH_LABELS[analysis.guidance.path]}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900">{analysis.guidance.verdict}</p>
                        {analysis.guidance.why.length > 0 && (
                          <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-slate-600">
                            {analysis.guidance.why.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        )}
                        <p className="mt-2 text-xs italic text-slate-400">{analysis.guidance.confidenceNote}</p>
                      </div>
                    </>
                  )}

                  {analysisError && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-rose-700">
                        <AlertTriangle size={16} /> Deep analysis unavailable
                      </div>
                      <p className="mt-1 text-xs text-rose-600">{analysisError}</p>
                      <button
                        type="button"
                        onClick={loadAnalysis}
                        className="mt-2 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {analysis?.report && (
                    <>
                      <div>
                        <h3 className="mb-1 text-sm font-semibold text-slate-700">What's Good</h3>
                        <ul className="space-y-1.5 text-sm text-slate-600">
                          {analysis.report.whatsGood.map((item) => (
                            <li key={`${item.jdRequirement}-${item.resumeEvidence}`} className="rounded-lg bg-emerald-50 p-2">
                              <span className="font-medium text-slate-800">{item.jdRequirement}</span>
                              <p className="text-xs text-slate-600">"{item.resumeEvidence}"</p>
                            </li>
                          ))}
                          {analysis.report.whatsGood.length === 0 && <li className="text-xs text-slate-400">Nothing flagged.</li>}
                        </ul>
                      </div>

                      <div>
                        <h3 className="mb-1 text-sm font-semibold text-slate-700">What's Bad</h3>
                        <ul className="space-y-1.5 text-sm text-slate-600">
                          {analysis.report.whatsBad.map((item) => (
                            <li key={`${item.jdRequirement}-${item.detail}`} className="rounded-lg bg-rose-50 p-2">
                              <span className="font-medium text-slate-800">{item.jdRequirement}</span>
                              <p className="text-xs text-slate-600">{item.detail}</p>
                            </li>
                          ))}
                          {analysis.report.whatsBad.length === 0 && <li className="text-xs text-slate-400">Nothing flagged.</li>}
                        </ul>
                      </div>

                      <div>
                        <h3 className="mb-1 text-sm font-semibold text-slate-700">Needs Improvement</h3>
                        <ul className="space-y-1.5 text-sm text-slate-600">
                          {analysis.report.needsImprovement.map((item) => (
                            <li key={`${item.area}-${item.issue}`} className="rounded-lg bg-amber-50 p-2">
                              <span className="font-medium text-slate-800">{item.area}</span>
                              <p className="text-xs text-slate-600">{item.issue}</p>
                              <p className="text-xs italic text-slate-500">"{item.resumeEvidence}"</p>
                            </li>
                          ))}
                          {analysis.report.needsImprovement.length === 0 && (
                            <li className="text-xs text-slate-400">Nothing flagged.</li>
                          )}
                        </ul>
                      </div>

                      <div>
                        <h3 className="mb-1 text-sm font-semibold text-slate-700">Skill Gaps</h3>
                        <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
                          {analysis.report.skillGaps.map((gap) => (
                            <li key={gap}>{gap}</li>
                          ))}
                          {analysis.report.skillGaps.length === 0 && <li className="list-none text-xs text-slate-400">None found.</li>}
                        </ul>
                      </div>

                      <div>
                        <h3 className="mb-1 text-sm font-semibold text-slate-700">Suggested Improvements</h3>
                        <ul className="space-y-2 text-sm text-slate-600">
                          {analysis.report.suggestedImprovements.map((item) => (
                            <li key={`${item.targetArea}-${item.issue}`} className="rounded-lg bg-slate-50 p-2">
                              <span className="font-medium text-slate-800">{item.targetArea}</span>
                              <p className="text-xs text-slate-600">{item.issue}</p>
                              {item.before && (
                                <p className="mt-1 text-xs text-rose-600">
                                  <span className="font-medium">Before:</span> {item.before}
                                </p>
                              )}
                              {item.after ? (
                                <p className="text-xs text-emerald-700">
                                  <span className="font-medium">After:</span> {item.after}
                                </p>
                              ) : (
                                <p className="text-xs italic text-slate-400">{item.fixDescription}</p>
                              )}
                              {item.after && <p className="mt-1 text-xs text-slate-500">{item.fixDescription}</p>}
                            </li>
                          ))}
                          {analysis.report.suggestedImprovements.length === 0 && (
                            <li className="text-xs text-slate-400">Nothing suggested.</li>
                          )}
                        </ul>
                      </div>

                      <div>
                        <h3 className="mb-1 text-sm font-semibold text-slate-700">Do This</h3>
                        <ol className="list-inside list-decimal space-y-1.5 text-sm text-slate-600">
                          {analysis.report.doThis.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      </div>

                      <div>
                        <h3 className="mb-1 text-sm font-semibold text-slate-700">Don't Do This</h3>
                        <ol className="list-inside list-decimal space-y-1.5 text-sm text-slate-600">
                          {analysis.report.dontDoThis.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      </div>
                    </>
                  )}
                </>
              )}

              {tab === "outreach" && resume && (
                <>
                  {outreachLoading && !outreach && (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="animate-spin" size={16} /> Drafting outreach...
                    </div>
                  )}
                  {outreach && (
                    <>
                      <div>
                        <h3 className="mb-1 text-sm font-semibold text-slate-700">Referrer Contact</h3>
                        <p className="text-sm text-slate-600">
                          {outreach.referrer.name} · {outreach.referrer.title}
                        </p>
                        <p className="text-xs text-slate-400">{outreach.referrer.linkedin} · {outreach.referrer.email}</p>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-700">LinkedIn Message</h3>
                          <div className="flex items-center gap-2">
                            <RegenerateButton
                              regenerating={regeneratingMessage}
                              onClick={() => handleRegenerate("message")}
                            />
                            <CopyButton text={outreach.customMessage} />
                          </div>
                        </div>
                        <p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{outreach.customMessage}</p>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-700">Cold Email</h3>
                          <div className="flex items-center gap-2">
                            <RegenerateButton
                              regenerating={regeneratingEmail}
                              onClick={() => handleRegenerate("email")}
                            />
                            <CopyButton text={outreach.customEmail} />
                          </div>
                        </div>
                        <p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{outreach.customEmail}</p>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
