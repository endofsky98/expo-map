import { Category } from '@/types';
import { useI18n } from '@/lib/i18n';

interface CategoryFilterProps {
  categories: Category[];
  activeCategories: Set<number>;
  onToggle: (categoryId: number) => void;
  onReset: () => void;
}

export default function CategoryFilter({
  categories,
  activeCategories,
  onToggle,
  onReset,
}: CategoryFilterProps) {
  const { t, ln } = useI18n();
  const allActive = activeCategories.size === 0;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
      <button
        onClick={onReset}
        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all
          ${
            allActive
              ? 'bg-indigo-600 text-white dark:bg-indigo-500'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-[#2a2a2a] dark:text-gray-300 dark:hover:bg-[#333]'
          }`}
      >
        {t('filter.all')}
      </button>
      {categories.map((cat) => {
        const isActive = activeCategories.has(cat.id);
        return (
          <button
            key={cat.id}
            onClick={() => onToggle(cat.id)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all
              ${
                isActive
                  ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-[#2a2a2a] dark:text-gray-300 dark:hover:bg-[#333]'
              }`}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: cat.color }}
            />
            {ln(cat.name)}
          </button>
        );
      })}
    </div>
  );
}
