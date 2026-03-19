import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Grid3X3,
  ImageIcon,
  Building2,
  Tag,
  Database,
  ArrowRight,
  Layers,
  MapPin,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { fetchBooths, fetchCategories, fetchCompanies, fetchImages, fetchFloors, fetchHalls, fetchFacilities, seedData } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

interface Stats {
  booths: number;
  companies: number;
  categories: number;
  images: number;
  floors: number;
  halls: number;
  facilities: number;
}

export default function AdminDashboard() {
  const { t } = useI18n();
  const [stats, setStats] = useState<Stats>({ booths: 0, companies: 0, categories: 0, images: 0, floors: 0, halls: 0, facilities: 0 });
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadStats(); }, []);

  async function loadStats() {
    setLoading(true);
    try {
      const [booths, companies, categories, images, floors, halls, facilities] = await Promise.all([
        fetchBooths().catch(() => []),
        fetchCompanies().catch(() => []),
        fetchCategories().catch(() => []),
        fetchImages().catch(() => []),
        fetchFloors().catch(() => []),
        fetchHalls().catch(() => []),
        fetchFacilities().catch(() => []),
      ]);
      setStats({
        booths: booths.length,
        companies: companies.length,
        categories: categories.length,
        images: images.length,
        floors: floors.length,
        halls: halls.length,
        facilities: facilities.length,
      });
    } finally { setLoading(false); }
  }

  async function handleSeed() {
    if (!confirm(t('admin.sampleConfirm'))) return;
    setSeeding(true);
    setSeedMessage('');
    try {
      const result = await seedData();
      setSeedMessage(result.message || 'Sample data loaded successfully!');
      await loadStats();
    } catch {
      setSeedMessage(t('admin.sampleFailed'));
    } finally { setSeeding(false); }
  }

  const cards = [
    { titleKey: 'nav.floors', count: `${stats.floors}F / ${stats.halls}H`, icon: Layers, href: '/admin/floors', color: 'text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-900/20' },
    { titleKey: 'nav.booths', count: stats.booths, icon: Grid3X3, href: '/admin/booths', color: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20' },
    { titleKey: 'nav.companies', count: stats.companies, icon: Building2, href: '/admin/companies', color: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/20' },
    { titleKey: 'nav.categories', count: stats.categories, icon: Tag, href: '/admin/categories', color: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20' },
    { titleKey: 'nav.images', count: stats.images, icon: ImageIcon, href: '/admin/images', color: 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-900/20' },
    { titleKey: 'nav.facilities', count: stats.facilities, icon: MapPin, href: '/admin/facilities', color: 'text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-900/20' },
  ];

  return (
    <AdminLayout title={t('nav.dashboard')}>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link key={card.titleKey} href={card.href} className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-500/40 p-5 hover:shadow-md transition-shadow group">
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-lg ${card.color}`}><Icon className="h-5 w-5" /></div>
                  <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-indigo-500 transition-colors" />
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{loading ? '-' : card.count}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t(card.titleKey)}</p>
              </Link>
            );
          })}
        </div>

        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-500/40 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('admin.quickActions')}</h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/admin/booths" className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors">{t('admin.manageBooths')}</Link>
            <Link href="/admin/images" className="px-4 py-2.5 border border-gray-200 bg-white text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-300 dark:hover:bg-[#333] transition-colors">{t('admin.uploadImage')}</Link>
            <Link href="/" className="px-4 py-2.5 border border-gray-200 bg-white text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-300 dark:hover:bg-[#333] transition-colors">{t('admin.viewMap')}</Link>
          </div>
        </div>

        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-500/40 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('admin.sampleData')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('admin.sampleDesc')}</p>
          <button onClick={handleSeed} disabled={seeding} className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors disabled:opacity-50">
            <Database className="h-4 w-4" />{seeding ? t('admin.loading') : t('admin.loadSample')}
          </button>
          {seedMessage && <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">{seedMessage}</p>}
        </div>
      </div>
    </AdminLayout>
  );
}
