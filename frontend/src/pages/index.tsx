import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import Link from 'next/link';
import { ZoomIn, ZoomOut, Settings, Map as MapIcon } from 'lucide-react';
import { Booth, Category, MapImage } from '@/types';
import { fetchBooths, fetchCategories, fetchCurrentImage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import SearchBar from '@/components/SearchBar';
import CategoryFilter from '@/components/CategoryFilter';
import LanguageSelector from '@/components/LanguageSelector';

const MapViewer = dynamic(() => import('@/components/MapViewer'), { ssr: false });

export default function HomePage() {
  const { t } = useI18n();
  const [booths, setBooths] = useState<Booth[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currentImage, setCurrentImage] = useState<MapImage | null>(null);
  const [selectedBoothId, setSelectedBoothId] = useState<number | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<number>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [boothsData, categoriesData, imageData] = await Promise.all([
        fetchBooths().catch(() => []),
        fetchCategories().catch(() => []),
        fetchCurrentImage().catch(() => null),
      ]);
      setBooths(boothsData);
      setCategories(categoriesData);
      setCurrentImage(imageData);

      if (boothsData.length === 0 && categoriesData.length === 0 && !imageData) {
        setError('api_down');
      }
    } catch {
      setError('api_down');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleBoothClick = useCallback((booth: Booth) => {
    setSelectedBoothId(booth.id);
  }, []);

  const handleSearchSelect = useCallback((booth: Booth) => {
    setSelectedBoothId(booth.id);
    if (typeof window !== 'undefined') {
      const panFn = (window as unknown as Record<string, (b: Booth) => void>).__mapViewerPanToBooth;
      if (panFn) panFn(booth);
    }
  }, []);

  const handleCategoryToggle = useCallback((categoryId: number) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }, []);

  const handleCategoryReset = useCallback(() => {
    setActiveCategories(new Set());
  }, []);

  function handleZoomIn() {
    if (typeof window !== 'undefined') {
      const fn = (window as unknown as Record<string, () => void>).__mapViewerZoomIn;
      if (fn) fn();
    }
  }

  function handleZoomOut() {
    if (typeof window !== 'undefined') {
      const fn = (window as unknown as Record<string, () => void>).__mapViewerZoomOut;
      if (fn) fn();
    }
  }

  const showMap = !loading && booths.length > 0;

  return (
    <>
      <Head>
        <title>{t('app.title')}</title>
      </Head>
      <div className="h-screen w-screen flex flex-col bg-gray-100 dark:bg-[#141414] overflow-hidden">
        {/* Top bar */}
        <div className="shrink-0 bg-white/90 dark:bg-[#1a1a1a]/90 backdrop-blur-sm border-b border-gray-200 dark:border-gray-500/40 px-4 py-3 z-20">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 shrink-0">
              <MapIcon className="h-5 w-5" />
              <span className="font-bold text-sm hidden sm:inline">{t('app.title')}</span>
            </div>
            <SearchBar booths={booths} onSelect={handleSearchSelect} />
            <LanguageSelector />
            <Link
              href="/admin"
              className="shrink-0 p-2 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-indigo-400 dark:hover:bg-[#2a2a2a] transition-colors"
              title={t('nav.admin')}
            >
              <Settings className="h-5 w-5" />
            </Link>
          </div>
          {categories.length > 0 && (
            <div className="mt-2">
              <CategoryFilter
                categories={categories}
                activeCategories={activeCategories}
                onToggle={handleCategoryToggle}
                onReset={handleCategoryReset}
              />
            </div>
          )}
        </div>

        {/* Map area */}
        <div className="flex-1 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('map.loading')}</p>
              </div>
            </div>
          ) : error === 'api_down' && booths.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-center px-4">
                <MapIcon className="h-12 w-12 text-gray-300 dark:text-gray-600" />
                <p className="text-gray-500 dark:text-gray-400">{t('map.error')}</p>
                <button
                  onClick={loadData}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors"
                >
                  {t('map.retry')}
                </button>
                <Link
                  href="/admin"
                  className="text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
                >
                  {t('map.goAdmin')}
                </Link>
              </div>
            </div>
          ) : !showMap && !currentImage ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-center px-4">
                <MapIcon className="h-12 w-12 text-gray-300 dark:text-gray-600" />
                <p className="text-gray-600 dark:text-gray-300 font-medium">{t('map.noData')}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('map.noDataDesc')}</p>
                <Link
                  href="/admin"
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors"
                >
                  {t('map.goAdmin')}
                </Link>
              </div>
            </div>
          ) : (
            <MapViewer
              booths={booths}
              categories={categories}
              currentImage={currentImage}
              selectedBoothId={selectedBoothId}
              activeCategories={activeCategories}
              onBoothClick={handleBoothClick}
              onZoomChange={setZoom}
            />
          )}

          {/* Zoom controls */}
          <div className="absolute bottom-6 right-6 flex flex-col items-center gap-2 z-10">
            <button
              onClick={handleZoomIn}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 shadow-sm hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="h-4 w-4 text-gray-700 dark:text-gray-300" />
            </button>
            <div className="px-2 py-1 rounded-md bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 shadow-sm text-xs text-gray-600 dark:text-gray-400 font-mono">
              {Math.round(zoom * 100)}%
            </div>
            <button
              onClick={handleZoomOut}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 shadow-sm hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors"
              title="Zoom out"
            >
              <ZoomOut className="h-4 w-4 text-gray-700 dark:text-gray-300" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
