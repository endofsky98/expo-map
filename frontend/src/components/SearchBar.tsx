import { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Booth } from '@/types';

interface SearchBarProps {
  booths: Booth[];
  onSelect: (booth: Booth) => void;
}

export default function SearchBar({ booths, onSelect }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<Booth[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length === 0) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    const q = query.toLowerCase();
    const filtered = booths.filter(
      (b) =>
        b.booth_number.toLowerCase().includes(q) ||
        b.company?.name?.toLowerCase().includes(q)
    );
    setResults(filtered.slice(0, 20));
    setIsOpen(true);
  }, [query, booths]);

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
    setQuery(booth.company?.name || booth.booth_number);
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
          placeholder="Search booths or companies..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim() && setIsOpen(true)}
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
                {booth.company?.name || 'Unassigned'}
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
      {isOpen && query.trim() && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 rounded-lg shadow-lg p-4 z-50">
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">No booths found</p>
        </div>
      )}
    </div>
  );
}
