import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";

interface ComboboxChipInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}

const MAX_SUGGESTIONS = 8;

export function ComboboxChipInput({ values, onChange, suggestions = [], placeholder }: ComboboxChipInputProps) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmedDraft = draft.trim();

  const filteredSuggestions = useMemo(() => {
    const query = trimmedDraft.toLowerCase();
    const selected = new Set(values.map((v) => v.toLowerCase()));
    const pool = suggestions.filter((s) => !selected.has(s.toLowerCase()));
    const matches = query ? pool.filter((s) => s.toLowerCase().includes(query)) : pool;
    return matches.slice(0, MAX_SUGGESTIONS);
  }, [trimmedDraft, suggestions, values]);

  // Offer to add whatever was typed as a custom value whenever it isn't already an
  // exact match among the suggestions or the selected chips — this is what makes it
  // clear you're not limited to the suggestion list.
  const showCustomOption =
    trimmedDraft.length > 0 &&
    !filteredSuggestions.some((s) => s.toLowerCase() === trimmedDraft.toLowerCase()) &&
    !values.some((v) => v.toLowerCase() === trimmedDraft.toLowerCase());

  const totalItems = filteredSuggestions.length + (showCustomOption ? 1 : 0);

  function addValue(value: string) {
    const trimmed = value.trim();
    if (trimmed && !values.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      onChange([...values, trimmed]);
    }
    setDraft("");
    setHighlighted(0);
    setOpen(false);
  }

  function removeChip(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlighted((prev) => Math.min(prev + 1, totalItems - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (open && highlighted < filteredSuggestions.length && filteredSuggestions[highlighted]) {
        addValue(filteredSuggestions[highlighted]);
      } else {
        addValue(draft);
      }
      setOpen(false);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 px-2 py-1.5 focus-within:border-indigo-400">
        {values.map((value, index) => (
          <span
            key={`${value}-${index}`}
            className="flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700"
          >
            {value}
            <button
              type="button"
              onClick={() => removeChip(index)}
              className="rounded-full hover:bg-indigo-200"
              aria-label={`Remove ${value}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          className="min-w-[8rem] flex-1 border-none px-1 py-1 text-sm outline-none"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
            setHighlighted(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so a click on a suggestion registers before the dropdown closes.
            blurTimeout.current = setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={handleKeyDown}
          placeholder={values.length === 0 ? placeholder : ""}
        />
      </div>
      <p className="mt-1 text-[11px] text-slate-400">Pick a suggestion or type your own and press Enter</p>

      {open && (filteredSuggestions.length > 0 || showCustomOption) && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {filteredSuggestions.map((suggestion, index) => (
            <li key={suggestion}>
              <button
                type="button"
                onMouseDown={(e) => {
                  // Prevent the input's onBlur from firing before the click registers.
                  e.preventDefault();
                  if (blurTimeout.current) clearTimeout(blurTimeout.current);
                  addValue(suggestion);
                }}
                onMouseEnter={() => setHighlighted(index)}
                className={`block w-full px-3 py-1.5 text-left text-sm ${
                  index === highlighted ? "bg-indigo-50 text-indigo-700" : "text-slate-700"
                }`}
              >
                {suggestion}
              </button>
            </li>
          ))}
          {showCustomOption && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (blurTimeout.current) clearTimeout(blurTimeout.current);
                  addValue(trimmedDraft);
                }}
                onMouseEnter={() => setHighlighted(filteredSuggestions.length)}
                className={`flex w-full items-center gap-1.5 border-t border-slate-100 px-3 py-1.5 text-left text-sm font-medium ${
                  highlighted === filteredSuggestions.length ? "bg-indigo-50 text-indigo-700" : "text-indigo-600"
                }`}
              >
                <Plus size={13} /> Add "{trimmedDraft}"
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
