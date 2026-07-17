import { useRef, useState, type DragEvent } from "react";
import { Download, FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import { parseResume } from "../lib/api";
import { useAppState } from "../state/AppContext";
import { useToast } from "./Toast";

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ResumeUploader() {
  const { resume, resumeFile, setResume, clearResume } = useAppState();
  const { show } = useToast();
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setLoading(true);
    try {
      const [parsed, dataUrl] = await Promise.all([parseResume(file), readAsDataUrl(file)]);
      setResume(parsed, { name: file.name, type: file.type, dataUrl });
      show("Resume uploaded successfully", "success");
    } catch (err) {
      show(err instanceof Error ? err.message : "Failed to parse resume", "error");
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  if (resumeFile || resume) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <FileText className="shrink-0 text-indigo-500" size={22} />
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
            {resumeFile?.name ?? "Previously uploaded resume"}
          </p>
          {resumeFile ? (
            <a
              href={resumeFile.dataUrl}
              download={resumeFile.name}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download size={16} /> Download
            </a>
          ) : (
            <p className="text-xs text-slate-400">Uploaded before file storage was added — re-upload to enable download</p>
          )}
          <button
            type="button"
            onClick={() => {
              clearResume();
              show("Resume removed", "success");
            }}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300"
          >
            <Trash2 size={16} /> Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-300"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        {loading ? (
          <Loader2 className="mb-2 animate-spin text-indigo-500" size={28} />
        ) : (
          <UploadCloud className="mb-2 text-indigo-500" size={28} />
        )}
        <p className="text-sm font-medium text-slate-700">
          {loading ? "Parsing your resume..." : "Drop your resume here, or click to upload"}
        </p>
        <p className="mt-1 text-xs text-slate-400">PDF, DOCX, or TXT</p>
      </div>
    </div>
  );
}
