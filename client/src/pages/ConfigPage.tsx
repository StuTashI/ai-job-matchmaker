import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Eye, EyeOff, Loader2, XCircle } from "lucide-react";
import { getConfigStatus, saveConfig, type ConfigStatus } from "../lib/api";
import { useToast } from "../components/Toast";

interface KeyFieldProps {
  label: string;
  helpText: string;
  helpUrl: string;
  helpLinkText: string;
  configured: boolean;
  preview: string | null;
  onSave: (value: string) => Promise<void>;
}

function KeyField({ label, helpText, helpUrl, helpLinkText, configured, preview, onSave }: KeyFieldProps) {
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await onSave(value.trim());
      setValue("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{label}</h3>
        {configured ? (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
            <CheckCircle2 size={14} /> Configured{preview ? ` (${preview})` : ""}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs font-medium text-slate-400">
            <XCircle size={14} /> Not configured
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-slate-500">
        {helpText}{" "}
        <a
          href={helpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 font-medium text-indigo-600 hover:underline"
        >
          {helpLinkText} <ExternalLink size={11} />
        </a>
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={visible ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={configured ? "Enter a new value to replace it" : "Paste your key here"}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-9 text-sm focus:border-indigo-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label={visible ? "Hide value" : "Show value"}
          >
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !value.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Save
        </button>
      </div>
    </div>
  );
}

export function ConfigPage() {
  const { show } = useToast();
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const data = await getConfigStatus();
      setStatus(data);
    } catch (err) {
      show(err instanceof Error ? err.message : "Failed to load configuration", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSaveGemini(value: string) {
    try {
      const data = await saveConfig({ geminiApiKey: value });
      setStatus(data);
      show("Gemini API key saved", "success");
    } catch (err) {
      show(err instanceof Error ? err.message : "Failed to save key", "error");
    }
  }

  async function handleSaveApify(value: string) {
    try {
      const data = await saveConfig({ apifyToken: value });
      setStatus(data);
      show("Apify token saved", "success");
    } catch (err) {
      show(err instanceof Error ? err.message : "Failed to save token", "error");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Configuration</h1>
        <p className="mt-1 text-sm text-slate-500">
          Add your own API keys to enable AI-powered parsing, scoring, and outreach, plus real multi-portal job
          scraping. Keys are stored only on this server's local <code className="rounded bg-slate-100 px-1 py-0.5">.env</code> file
          and are never sent to the browser in full — the app works without them too, using local rule-based
          fallbacks for everything.
        </p>
      </div>

      {loading || !status ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading current configuration...
        </div>
      ) : (
        <div className="space-y-4">
          <KeyField
            label="Gemini API Key"
            helpText="Powers resume parsing, match scoring, and outreach drafting."
            helpUrl="https://aistudio.google.com/apikey"
            helpLinkText="Get a free key from Google AI Studio"
            configured={status.hasGemini}
            preview={status.geminiKeyPreview}
            onSave={handleSaveGemini}
          />
          <KeyField
            label="Apify API Token"
            helpText="Powers real job scraping across LinkedIn, Indeed, Naukri, Wellfound, Flexjobs, and Google Jobs."
            helpUrl="https://console.apify.com/settings/integrations"
            helpLinkText="Get your token from the Apify Console"
            configured={status.hasApify}
            preview={status.apifyTokenPreview}
            onSave={handleSaveApify}
          />
        </div>
      )}
    </div>
  );
}
