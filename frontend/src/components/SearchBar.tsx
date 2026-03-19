import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { Booth } from '@/types';
import { useI18n } from '@/lib/i18n';
import { searchBooths } from '@/lib/api';

interface SearchBarProps {
  booths: Booth[];
  onSelect: (booth: Booth) => void;
}

function searchInName(
  name: string | Record<string, string> | null | undefined,
  query: string
): boolean {
  if (!name) return false;
  if (typeof name === 'string') return name.toLowerCase().includes(query);
  return Object.values(name).some((v) => v.toLowerCase().includes(query));
}

export default function SearchBar({ booths, onSelect }: SearchBarProps) {
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

      // Client-side search from loaded booths
      const localResults = booths.filter(
        (b) =>
          b.booth_number.toLowerCase().includes(keyword) ||
          searchInName(b.company?.name, keyword) ||
          searchInName(b.category?.name, keyword)
      );

      if (localResults.length > 0) {
        setResults(localResults.slice(0, 20));
        setIsOpen(true);
        return;
      }

      // Fallback to API search if no local results
      setApiSearching(true);
      searchBooths(q)
        .then((apiResults) => {
          setResults(apiResults.slice(0, 20));
          setIsOpen(true);
        })
        .catch(() => {
          setResults([]);
        })
        .finally(() => setApiSearching(false));
    },
    [booths]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(booth: Booth) {
    setQuery(ln(booth.company?.name) || booth.booth_number);
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
            placeholder:text-gray-400 text-sm
            dark:border-gray-500/40 dark:bg-[#2a2a2a]/90 dark:text-gray-100
            dark:focus:ring-indigo-400/30 dark:focus:border-indigo-400"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 rounded-lg shadow-lg max-h-64 overflow-y-auto z-50">
          {results.map((booth) => (
            <button
              key={booth.id}
              onClick={() => handleSelect(booth)}
              className="w-full px-4 py-2.5 text-left hover:bg-indigo-50 dark:hover:bg-indigo-900/20 flex items-center gap-3 text-sm transition-colors"
            >
              <span className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
                {booth.booth_number}
              </span>
              <span className="truncate text-gray-700 dark:text-gray-200">
                {ln(booth.company?.name) || t('search.unassigned')}
              </span>
              {booth.category && (
                <span
                  className="ml-auto shrink-0 w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: booth.category.color }}
                />
              )}
            </button>
          ))}
        </div>
      )}
      {isOpen && query.trim() && results.length === 0 && !apiSearching && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 rounded-lg shadow-lg p-4 z-50">
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            {t('search.noResults')}
          </p>
        </div>
      )}
    </div>
  );
}
