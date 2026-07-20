import {
  POST_AGE_FILTER_OPTIONS,
  SCORE_FILTER_OPTIONS,
  SORT_OPTIONS,
  type PostAgeFilter,
  type ScoreFilter,
  type SortOption,
} from "../lib/linkedInPostFilters";

interface LinkedInPostFilterBarProps {
  resultCount: number;
  postAgeFilter: PostAgeFilter;
  scoreFilter: ScoreFilter;
  sort: SortOption;
  onPostAgeFilterChange: (value: PostAgeFilter) => void;
  onScoreFilterChange: (value: ScoreFilter) => void;
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

export function LinkedInPostFilterBar({
  resultCount,
  postAgeFilter,
  scoreFilter,
  sort,
  onPostAgeFilterChange,
  onScoreFilterChange,
  onSortChange,
}: LinkedInPostFilterBarProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <span className="text-sm font-medium text-slate-700">{resultCount} posts</span>
      <div className="flex flex-wrap items-center gap-3">
        <Select label="Posted" value={postAgeFilter} options={POST_AGE_FILTER_OPTIONS} onChange={onPostAgeFilterChange} />
        <Select label="Score" value={scoreFilter} options={SCORE_FILTER_OPTIONS} onChange={onScoreFilterChange} />
        <Select label="Sort by" value={sort} options={SORT_OPTIONS} onChange={onSortChange} />
      </div>
    </div>
  );
}
