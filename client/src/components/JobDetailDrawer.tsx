import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, ExternalLink, Loader2, RefreshCw, X } from "lucide-react";
import type { GapType, GuidancePath, Job, JobAnalysis, Referrer } from "../lib/types";
import { GAP_TYPE_LABELS, PATH_LABELS } from "../lib/types";
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

type Tab = "overview" | "analysis" | "outreach";

interface JobDetailDrawerProps {
  job: Job | null;
  onClose: () => void;
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

export function JobDetailDrawer({ job, onClose }: JobDetailDrawerProps) {
  const { resume } = useAppState();
  const { show } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);
  const [outreach, setOutreach] = useState<{ customMessage: string; customEmail: string; referrer: Referrer } | null>(null);
  const [detailFetched, setDetailFetched] = useState(false);
  const [regeneratingMessage, setRegeneratingMessage] = useState(false);
  const [regeneratingEmail, setRegeneratingEmail] = useState(false);
  const [messageVariant, setMessageVariant] = useState(0);
  const [emailVariant, setEmailVariant] = useState(0);

  useEffect(() => {
    setTab("overview");
    setAnalysis(job?.analysis ?? null);
    setOutreach(null);
    setDetailFetched(false);
    setMessageVariant(0);
    setEmailVariant(0);
  }, [job?.id]);

  async function loadAnalysisAndOutreach() {
    if (!job || !resume) return;
    setLoading(true);
    try {
      const [scored, drafted] = await Promise.all([matchJob(resume, job), getOutreach(resume, job)]);
      setAnalysis(scored);
      setOutreach(drafted);
      setDetailFetched(true);
    } catch (err) {
      show(err instanceof Error ? err.message : "Failed to analyze job", "error");
    } finally {
      setLoading(false);
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
    if ((next === "analysis" || next === "outreach") && !detailFetched && !loading) {
      loadAnalysisAndOutreach();
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
                  {loading && !analysis && (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="animate-spin" size={16} /> Analyzing fit...
                    </div>
                  )}
                  {loading && analysis && (
                    <div className="flex items-center gap-2 text-xs text-indigo-500">
                      <Loader2 className="animate-spin" size={12} /> Refining this score with AI...
                    </div>
                  )}
                  {analysis && (
                    <>
                      <div className="rounded-lg bg-slate-50 p-4 text-center">
                        <p className="text-2xl font-bold text-indigo-600">{analysis.matchScore}%</p>
                        <p className="text-xs text-slate-500">Match Score</p>
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
                      </div>

                      <div>
                        <h3 className="mb-1 text-sm font-semibold text-slate-700">Skill Gaps</h3>
                        <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
                          {analysis.gaps.map((gap) => (
                            <li key={gap}>{gap}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h3 className="mb-1 text-sm font-semibold text-slate-700">Suggested Improvements</h3>
                        <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
                          {analysis.improvements.map((imp) => (
                            <li key={imp}>{imp}</li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <h3 className="mb-1 text-sm font-semibold text-slate-700">Do This</h3>
                        <ol className="list-inside list-decimal space-y-1.5 text-sm text-slate-600">
                          {analysis.guidance.doThis.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      </div>

                      <p className="text-xs italic text-slate-400">{analysis.guidance.confidenceNote}</p>
                    </>
                  )}
                </>
              )}

              {tab === "outreach" && resume && (
                <>
                  {loading && !outreach && (
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
