import React from 'react';
import { RotateCcw, Search, X } from 'lucide-react';

export default function SearchFilterBar({
  query,
  onQueryChange,
  placeholder = 'Search',
  children,
  resultCount,
  onReset,
  className = '',
}) {
  const hasQuery = Boolean(query?.trim());
  return <section aria-label="Search and filters" className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm ${className}`}>
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-[220px] flex-1">
        <span className="sr-only">{placeholder}</span>
        <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={placeholder} className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-9 text-sm outline-none placeholder:text-slate-400 focus:border-[#C59A2A]" />
        {hasQuery && <button type="button" onClick={() => onQueryChange('')} aria-label="Clear search" className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={15} /></button>}
      </label>
      {children}
      {onReset && <button type="button" onClick={onReset} className="flex h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"><RotateCcw size={14} />Reset</button>}
    </div>
    {resultCount !== undefined && <p aria-live="polite" className="mt-2 text-xs text-slate-500">{resultCount} result{resultCount === 1 ? '' : 's'}</p>}
  </section>;
}

export function FilterSelect({ label, value, onChange, options }) {
  return <label className="flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-500"><span className="whitespace-nowrap">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="min-w-[110px] bg-transparent text-sm font-semibold text-slate-800 outline-none">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}
