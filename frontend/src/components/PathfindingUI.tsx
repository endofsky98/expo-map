import { useState } from 'react';
import { Navigation } from 'lucide-react';
import { Booth } from '@/types';
import { useI18n } from '@/lib/i18n';

interface PathfindingUIProps {
  booths: Booth[];
  onRouteFound: (route: { _fromBoothId: number; _toBoothId: number } | null) => void;
  onFloorSwitch?: (floorId: number) => void;
}

export default function PathfindingUI({ booths, onRouteFound, onFloorSwitch }: PathfindingUIProps) {
  const { t, ln } = useI18n();
  const [fromId, setFromId] = useState<string>('');
  const [toId, setToId] = useState<string>('');
  const [error, setError] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [found, setFound] = useState(false);

  function handleFind() {
    if (!fromId || !toId) return;
    setError('');
    const fromBooth = booths.find(b => b.id === Number(fromId));
    const toBooth = booths.find(b => b.id === Number(toId));
    if (!fromBooth || !toBooth) {
      setError(t('route.notFound'));
      return;
    }
    setFound(true);
    onRouteFound({ _fromBoothId: fromBooth.id, _toBoothId: toBooth.id });
    // Switch to the floor of the starting booth
    if (fromBooth.floor_id && onFloorSwitch) {
      onFloorSwitch(fromBooth.floor_id);
    }
  }

  function handleClear() {
    setFromId('');
    setToId('');
    setError('');
    setFound(false);
    onRouteFound(null);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
          ${isOpen || found
            ? 'bg-indigo-600 text-white dark:bg-indigo-500'
            : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 dark:bg-[#1e1e1e] dark:text-gray-300 dark:border-gray-500/40 dark:hover:bg-[#2a2a2a]'
          }`}
      >
        <Navigation className="h-3.5 w-3.5" />
        {t('route.title')}
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 rounded-lg shadow-lg p-3 z-50">
          <div className="space-y-2">
            <div>
              <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase">{t('route.from')}</label>
              <select
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                className="w-full mt-0.5 px-2 py-1.5 rounded border border-gray-200 bg-white text-xs dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none"
              >
                <option value="">{t('route.selectBooth')}</option>
                {booths.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.booth_number} - {ln(b.company?.name) || t('search.unassigned')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase">{t('route.to')}</label>
              <select
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className="w-full mt-0.5 px-2 py-1.5 rounded border border-gray-200 bg-white text-xs dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none"
              >
                <option value="">{t('route.selectBooth')}</option>
                {booths.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.booth_number} - {ln(b.company?.name) || t('search.unassigned')}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleFind}
                disabled={!fromId || !toId}
                className="flex-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 disabled:opacity-50 transition-colors"
              >
                {t('route.find')}
              </button>
              <button
                onClick={handleClear}
                className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                {t('route.clear')}
              </button>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
