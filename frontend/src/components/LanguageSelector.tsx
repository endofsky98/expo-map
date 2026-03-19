import { Globe } from 'lucide-react';
import { useI18n, Locale } from '@/lib/i18n';

const languages: { code: Locale; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'ko', label: '한국어' },
];

export default function LanguageSelector() {
  const { locale, setLocale } = useI18n();

  return (
    <div className="relative flex items-center gap-1">
      <Globe className="h-4 w-4 text-gray-400" />
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="appearance-none bg-transparent text-xs font-medium text-gray-600 dark:text-gray-300 cursor-pointer outline-none pr-4 py-1"
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
}
