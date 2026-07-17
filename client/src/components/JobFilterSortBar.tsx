import {
  DATE_FILTER_OPTIONS,
  SOURCE_FILTER_OPTIONS,
  SORT_OPTIONS,
  type DateFilter,
  type SourceFilter,
  type SortOption,
} from "../lib/jobFilters";

interface JobFilterSortBarProps {
  resultCount: number;
  dateFilter: DateFilter;
  sourceFilter: SourceFilter;
  sort: SortOption;
  onDateFilterChange: (value: DateFilter) => void;
  onSourceFilterChange: (value: SourceFilter) => void;
  onSortChange: (value: SortOption) => void;
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-600">
      <span className="font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-indigo-400 focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function JobFilterSortBar({
  resultCount,
  dateFilter,
  sourceFilter,
  sort,
  onDateFilterChange,
  onSourceFilterChange,
  onSortChange,
}: JobFilterSortBarProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <span className="text-sm font-medium text-slate-700">{resultCount} jobs</span>
      <div className="flex flex-wrap items-center gap-3">
        <Select label="Posted" value={dateFilter} options={DATE_FILTER_OPTIONS} onChange={onDateFilterChange} />
        <Select label="Source" value={sourceFilter} options={SOURCE_FILTER_OPTIONS} onChange={onSourceFilterChange} />
        <Select label="Sort by" value={sort} options={SORT_OPTIONS} onChange={onSortChange} />
      </div>
    </div>
  );
}
