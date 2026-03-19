import { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  LayoutDashboard,
  Grid3X3,
  ImageIcon,
  Building2,
  Tag,
  Map,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import LanguageSelector from '@/components/LanguageSelector';

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
}

export default function AdminLayout({ children, title }: AdminLayoutProps) {
  const router = useRouter();
  const { t } = useI18n();

  const navItems = [
    { href: '/admin', label: t('nav.dashboard'), icon: LayoutDashboard },
    { href: '/admin/booths', label: t('nav.booths'), icon: Grid3X3 },
    { href: '/admin/images', label: t('nav.images'), icon: ImageIcon },
    { href: '/admin/companies', label: t('nav.companies'), icon: Building2 },
    { href: '/admin/categories', label: t('nav.categories'), icon: Tag },
  ];

  function isActive(href: string) {
    if (href === '/admin') return router.pathname === '/admin';
    return router.pathname.startsWith(href);
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#141414] flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-[#1a1a1a] border-r border-gray-200 dark:border-gray-500/40">
        <div className="p-6">
          <Link href="/" className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
            <Map className="h-6 w-6" />
            <span className="font-bold text-lg">{t('app.title')}</span>
          </Link>
          <p className="text-xs text-gray-400 mt-1">{t('admin.panel')}</p>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${
                    active
                      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-[#222] dark:hover:text-gray-200'
                  }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-200 dark:border-gray-500/40 space-y-3">
          <LanguageSelector />
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors"
          >
            <Map className="h-4 w-4" />
            {t('nav.viewMap')}
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen pb-16 md:pb-0">
        <header className="sticky top-0 z-10 bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-500/40 px-6 py-4">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>

      {/* Mobile bottom tabs */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-500/40 z-50">
        <div className="flex">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors
                  ${
                    active
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
