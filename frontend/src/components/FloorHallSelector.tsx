import { Floor, Hall } from '@/types';
import { useI18n } from '@/lib/i18n';

interface FloorHallSelectorProps {
  floors: Floor[];
  halls: Hall[];
  selectedFloorId: number | null;
  selectedHallId: number | null;
  onFloorChange: (floorId: number) => void;
  onHallChange: (hallId: number) => void;
}

export default function FloorHallSelector({
  floors,
  halls,
  selectedFloorId,
  selectedHallId,
  onFloorChange,
  onHallChange,
}: FloorHallSelectorProps) {
  const { ln } = useI18n();

  const filteredHalls = halls.filter((h) => h.floor_id === selectedFloorId);

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {/* Floor tabs */}
      <div className="flex items-center gap-1 shrink-0">
        {floors.map((floor) => (
          <button
            key={floor.id}
            onClick={() => onFloorChange(floor.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
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

      {filteredHalls.length > 0 && (
        <>
          <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 shrink-0" />
          <div className="flex items-center gap-1 shrink-0">
            {filteredHalls.map((hall) => (
              <button
                key={hall.id}
                onClick={() => onHallChange(hall.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                  ${
                    selectedHallId === hall.id
                      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                      : 'bg-gray-50 text-gray-500 hover:bg-gray-100 dark:bg-[#222] dark:text-gray-400 dark:hover:bg-[#2a2a2a]'
                  }`}
              >
                {ln(hall.name)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
