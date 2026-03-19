import { Floor } from '@/types';
import { useI18n } from '@/lib/i18n';

interface FloorHallSelectorProps {
  floors: Floor[];
  selectedFloorId: number | null;
  onFloorChange: (floorId: number) => void;
}

export default function FloorHallSelector({
  floors,
  selectedFloorId,
  onFloorChange,
}: FloorHallSelectorProps) {
  const { ln } = useI18n();

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {floors.map((floor) => (
        <button
          key={floor.id}
          onClick={() => onFloorChange(floor.id)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0
            ${
              selectedFloorId === floor.id
                ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-[#2a2a2a] dark:text-gray-300 dark:hover:bg-[#333]'
            }`}
        >
          {ln(floor.name)}
        </button>
      ))}
    </div>
  );
}
