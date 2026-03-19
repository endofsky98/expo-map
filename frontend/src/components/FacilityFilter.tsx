import { useI18n } from '@/lib/i18n';

const FACILITY_TYPES = [
  { type: 'restroom', icon: 'WC', color: '#3b82f6' },
  { type: 'emergency_exit', icon: 'EXIT', color: '#ef4444' },
  { type: 'stairs', icon: 'S', color: '#22c55e' },
  { type: 'elevator', icon: 'EV', color: '#f59e0b' },
  { type: 'escalator', icon: 'ES', color: '#f97316' },
];

interface FacilityFilterProps {
  hiddenTypes: Set<string>;
  onToggle: (type: string) => void;
  onShowAll: () => void;
}

export default function FacilityFilter({ hiddenTypes, onToggle, onShowAll }: FacilityFilterProps) {
  const { t } = useI18n();

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      <button
        onClick={onShowAll}
        className={`shrink-0 px-2 py-1 rounded text-[10px] font-medium transition-all
          ${hiddenTypes.size === 0
            ? 'bg-indigo-600 text-white dark:bg-indigo-500'
            : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-[#2a2a2a] dark:text-gray-400'
          }`}
      >
        {t('facility.showAll')}
      </button>
      {FACILITY_TYPES.map(({ type, icon, color }) => {
        const hidden = hiddenTypes.has(type);
        return (
          <button
            key={type}
            onClick={() => onToggle(type)}
            className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all
              ${hidden
                ? 'bg-gray-100 text-gray-400 dark:bg-[#2a2a2a] dark:text-gray-500'
                : 'bg-white text-gray-700 shadow-sm border border-gray-200 dark:bg-[#1e1e1e] dark:text-gray-300 dark:border-gray-500/40'
              }`}
          >
            <span
              className="inline-flex items-center justify-center w-4 h-4 rounded-sm text-white text-[8px] font-bold"
              style={{ backgroundColor: hidden ? '#9ca3af' : color }}
            >
              {icon}
            </span>
            {t(`facility.${type}`)}
          </button>
        );
      })}
    </div>
  );
}
