import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Grid3X3,
  ImageIcon,
  Building2,
  Tag,
  Database,
  ArrowRight,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { fetchBooths, fetchCategories, fetchCompanies, fetchImages, seedData } from '@/lib/api';

interface Stats {
  booths: number;
  companies: number;
  categories: number;
  images: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ booths: 0, companies: 0, categories: 0, images: 0 });
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);
    try {
      const [booths, companies, categories, images] = await Promise.all([
        fetchBooths().catch(() => []),
        fetchCompanies().catch(() => []),
        fetchCategories().catch(() => []),
        fetchImages().catch(() => []),
      ]);
      setStats({
        booths: booths.length,
        companies: companies.length,
        categories: categories.length,
        images: images.length,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSeed() {
    if (!confirm('This will load sample data. Continue?')) return;
    setSeeding(true);
    setSeedMessage('');
    try {
      const result = await seedData();
      setSeedMessage(result.message || 'Sample data loaded successfully!');
      await loadStats();
    } catch (err) {
      setSeedMessage('Failed to load sample data. Is the backend running?');
      console.error(err);
    } finally {
      setSeeding(false);
    }
  }

  const cards = [
    {
      title: 'Booths',
      count: stats.booths,
      icon: Grid3X3,
      href: '/admin/booths',
      color: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20',
    },
    {
      title: 'Companies',
      count: stats.companies,
      icon: Building2,
      href: '/admin/companies',
      color: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/20',
    },
    {
      title: 'Categories',
      count: stats.categories,
      icon: Tag,
      href: '/admin/categories',
      color: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20',
    },
    {
      title: 'Images',
      count: stats.images,
      icon: ImageIcon,
      href: '/admin/images',
      color: 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-900/20',
    },
  ];

  return (
    <AdminLayout title="Dashboard">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Stats cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.title}
                href={card.href}
                className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-500/40 p-5 hover:shadow-md transition-shadow group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-lg ${card.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-indigo-500 transition-colors" />
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {loading ? '-' : card.count}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{card.title}</p>
              </Link>
            );
          })}
        </div>

        {/* Quick actions */}
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-500/40 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Quick Actions
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/booths"
              className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors"
            >
              Manage Booths
            </Link>
            <Link
              href="/admin/images"
              className="px-4 py-2.5 border border-gray-200 bg-white text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-300 dark:hover:bg-[#333] transition-colors"
            >
              Upload Map Image
            </Link>
            <Link
              href="/"
              className="px-4 py-2.5 border border-gray-200 bg-white text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-300 dark:hover:bg-[#333] transition-colors"
            >
              View Map
            </Link>
          </div>
        </div>

        {/* Seed data */}
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-500/40 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Sample Data
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Load sample booths, companies, and categories for testing.
          </p>
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors disabled:opacity-50"
          >
            <Database className="h-4 w-4" />
            {seeding ? 'Loading...' : 'Load Sample Data'}
          </button>
          {seedMessage && (
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">{seedMessage}</p>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
