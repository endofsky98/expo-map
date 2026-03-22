import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Eye, MapPin } from 'lucide-react';
import { Booth } from '@/types';
import { useI18n } from '@/lib/i18n';
import { searchBooths } from '@/lib/api';

interface SearchBarProps {
  booths: Booth[];
  onSelect: (booth: Booth) => void;
  onView?: (booth: Booth) => void;
  onSetStart?: (booth: Booth) => void;
  onSetEnd?: (booth: Booth) => void;
}

function searchInName(
  name: string | Record<string, string> | null | undefined,
  query: string
): boolean {
  if (!name) return false;
  if (typeof name === 'string') return name.toLowerCase().includes(query);
  return Object.values(name).some((v) => v.toLowerCase().includes(query));
}

export default function SearchBar({ booths, onSelect, onView, onSetStart, onSetEnd }: SearchBarProps) {
  const { t, ln } = useI18n();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<Booth[]>([]);
  const [apiSearching, setApiSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(
    (q: string) => {
      if (q.trim().length === 0) {
        setResults([]);
        setIsOpen(false);
        return;
      }
      const keyword = q.toLowerCase();
      const localResults = booths.filter(
        (b) =>
          b.booth_number.toLowerCase().includes(keyword) ||
          searchInName(b.display_name, keyword) ||
          searchInName(b.company?.name, keyword) ||
          searchInName(b.category?.name, keyword)
      );
      if (localResults.length > 0) {
        setResults(localResults.slice(0, 20));
        setIsOpen(true);
        return;
      }
      setApiSearching(true);
      searchBooths(q)
        .then((apiResults) => {
          setResults(apiResults.slice(0, 20));
          setIsOpen(true);
        })
        .catch(() => setResults([]))
        .finally(() => setApiSearching(false));
    },
    [booths]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(booth: Booth) {
    setQuery(ln(booth.display_name) || ln(booth.company?.name) || booth.booth_number);
    setIsOpen(false);
    onSelect(booth);
  }

  function handleClear() {
    setQuery('');
    setResults([]);
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim() && results.length > 0 && setIsOpen(true)}
          className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-gray-200 bg-white/90 backdrop-blur-sm
            outline-none transition focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600
            placeholder:text-gray-400 text-sm select-text
            dark:border-gray-500/40 dark:bg-[#2a2a2a]/90 dark:text-gray-100
            dark:focus:ring-indigo-400/30 dark:focus:border-indigo-400"
        />
        {query && (
          <button onClick={handleClear} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 rounded-lg shadow-lg max-h-64 overflow-y-auto z-50">
          {results.map((booth) => (
            <div
              key={booth.id}
              className="flex items-center gap-2 px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
            >
              <button
                onClick={() => handleSelect(booth)}
                className="flex-1 min-w-0 flex items-center gap-2.5 text-left"
              >
                <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold">
                  {booth.booth_number}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="truncate block text-xs text-gray-700 dark:text-gray-200">
                    {ln(booth.display_name) || ln(booth.company?.name) || t('search.unassigned')}
                  </span>
                  {(booth.floor || booth.hall) && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {booth.floor ? ln(booth.floor.name) : ''}{booth.hall ? ` / ${ln(booth.hall.name)}` : ''}
                    </span>
                  )}
                </div>
              </button>
              {booth.category && (
                <span className="shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: booth.category.color }} />
              )}
              {onView && (
                <button
                  onClick={(e) => { e.stopPropagation(); onView(booth); setIsOpen(false); }}
                  className="shrink-0 p-1.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
                  title="보기"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              )}
              {onSetStart && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSetStart(booth); setIsOpen(false); }}
                  className="shrink-0 p-1.5 rounded bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40 transition-colors"
                  title="출발"
                >
                  <MapPin className="h-3.5 w-3.5" />
                </button>
              )}
              {onSetEnd && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSetEnd(booth); setIsOpen(false); }}
                  className="shrink-0 p-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 transition-colors"
                  title="도착"
                >
                  <MapPin className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {isOpen && query.trim() && results.length === 0 && !apiSearching && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 rounded-lg shadow-lg p-4 z-50">
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">{t('search.noResults')}</p>
        </div>
      )}
    </div>
  );
}
