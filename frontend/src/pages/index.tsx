import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ZoomIn, ZoomOut, Settings, Map as MapIcon } from 'lucide-react';
import { Booth, Category, MapImage, Floor, Hall, Facility, RouteResult } from '@/types';
import { fetchBooths, fetchCategories, fetchCurrentImage, fetchFloors, fetchHalls, fetchFacilities, fetchRoute } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import SearchBar from '@/components/SearchBar';
import CategoryFilter from '@/components/CategoryFilter';
import LanguageSelector from '@/components/LanguageSelector';
import FloorHallSelector from '@/components/FloorHallSelector';
import FacilityFilter from '@/components/FacilityFilter';
import PathfindingUI from '@/components/PathfindingUI';

const MapViewer = dynamic(() => import('@/components/MapViewer'), { ssr: false });

export default function HomePage() {
  const { t } = useI18n();
  const router = useRouter();
  const [allBooths, setAllBooths] = useState<Booth[]>([]);
  const [booths, setBooths] = useState<Booth[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currentImage, setCurrentImage] = useState<MapImage | null>(null);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [selectedFloorId, setSelectedFloorId] = useState<number | null>(null);
  const [selectedHallId, setSelectedHallId] = useState<number | null>(null);
  const [selectedBoothId, setSelectedBoothId] = useState<number | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<number>>(new Set());
  const [hiddenFacilityTypes, setHiddenFacilityTypes] = useState<Set<string>>(new Set());
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInitialData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [boothsData, categoriesData, floorsData, hallsData] = await Promise.all([
        fetchBooths().catch(() => []),
        fetchCategories().catch(() => []),
        fetchFloors().catch(() => []),
        fetchHalls().catch(() => []),
      ]);
      setAllBooths(boothsData);
      setCategories(categoriesData);
      setFloors(floorsData);
      setHalls(hallsData);

      // Select first floor/hall by default
      if (floorsData.length > 0) {
        const firstFloor = floorsData[0];
        setSelectedFloorId(firstFloor.id);
        const floorHalls = hallsData.filter((h: Hall) => h.floor_id === firstFloor.id);
        if (floorHalls.length > 0) {
          setSelectedHallId(floorHalls[0].id);
        }
      }

      if (boothsData.length === 0 && categoriesData.length === 0) {
        setError('api_down');
      }
    } catch {
      setError('api_down');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadInitialData(); }, [loadInitialData]);

  // Load floor/hall specific data when selection changes
  useEffect(() => {
    if (!selectedFloorId) return;
    async function loadFloorData() {
      const [filteredBooths, img, facs] = await Promise.all([
        fetchBooths(selectedFloorId!, selectedHallId || undefined).catch(() => []),
        fetchCurrentImage(selectedFloorId!, selectedHallId || undefined).catch(() => null),
        fetchFacilities(selectedFloorId!, selectedHallId || undefined).catch(() => []),
      ]);
      setBooths(filteredBooths);
      setCurrentImage(img);
      setFacilities(facs);
    }
    loadFloorData();
  }, [selectedFloorId, selectedHallId]);

  // Handle URL params for pathfinding
  useEffect(() => {
    const { from, to } = router.query;
    if (from && to) {
      fetchRoute(Number(from), Number(to))
        .then((route) => setRouteResult(route))
        .catch(() => {});
    }
  }, [router.query]);

  const handleFloorChange = useCallback((floorId: number) => {
    setSelectedFloorId(floorId);
    const floorHalls = halls.filter((h) => h.floor_id === floorId);
    setSelectedHallId(floorHalls.length > 0 ? floorHalls[0].id : null);
  }, [halls]);

  const handleHallChange = useCallback((hallId: number) => {
    setSelectedHallId(hallId);
  }, []);

  const handleBoothClick = useCallback((booth: Booth) => {
    setSelectedBoothId(booth.id);
  }, []);

  const handleSearchSelect = useCallback((booth: Booth) => {
    // Switch to the booth's floor/hall
    if (booth.floor_id && booth.floor_id !== selectedFloorId) {
      setSelectedFloorId(booth.floor_id);
    }
    if (booth.hall_id && booth.hall_id !== selectedHallId) {
      setSelectedHallId(booth.hall_id);
    }
    setSelectedBoothId(booth.id);
    setTimeout(() => {
      const panFn = (window as unknown as Record<string, (b: Booth) => void>).__mapViewerPanToBooth;
      if (panFn) panFn(booth);
    }, 200);
  }, [selectedFloorId, selectedHallId]);

  const handleCategoryToggle = useCallback((categoryId: number) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }, []);

  const handleFacilityToggle = useCallback((type: string) => {
    setHiddenFacilityTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  function handleZoomIn() {
    const fn = (window as unknown as Record<string, () => void>).__mapViewerZoomIn;
    if (fn) fn();
  }

  function handleZoomOut() {
    const fn = (window as unknown as Record<string, () => void>).__mapViewerZoomOut;
    if (fn) fn();
  }

  const showMap = !loading && booths.length > 0;

  return (
    <>
      <Head><title>{t('app.title')}</title></Head>
      <div className="h-screen w-screen flex flex-col bg-gray-100 dark:bg-[#141414] overflow-hidden">
        {/* Top bar */}
        <div className="shrink-0 bg-white/90 dark:bg-[#1a1a1a]/90 backdrop-blur-sm border-b border-gray-200 dark:border-gray-500/40 px-4 py-3 z-20">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 shrink-0">
              <MapIcon className="h-5 w-5" />
              <span className="font-bold text-sm hidden sm:inline">{t('app.title')}</span>
            </div>
            <SearchBar booths={allBooths} onSelect={handleSearchSelect} />
            <PathfindingUI
              booths={allBooths}
              onRouteFound={setRouteResult}
              onFloorSwitch={(floorId, hallId) => { setSelectedFloorId(floorId); setSelectedHallId(hallId); }}
            />
            <LanguageSelector />
            <Link href="/admin" className="shrink-0 p-2 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-indigo-400 dark:hover:bg-[#2a2a2a] transition-colors" title={t('nav.admin')}>
              <Settings className="h-5 w-5" />
            </Link>
          </div>

          {/* Floor/Hall selector */}
          {floors.length > 0 && (
            <div className="mt-2">
              <FloorHallSelector
                floors={floors}
                halls={halls}
                selectedFloorId={selectedFloorId}
                selectedHallId={selectedHallId}
                onFloorChange={handleFloorChange}
                onHallChange={handleHallChange}
              />
            </div>
          )}

          {/* Category + Facility filters */}
          <div className="mt-2 flex items-center gap-3 overflow-x-auto">
            {categories.length > 0 && (
              <CategoryFilter
                categories={categories}
                activeCategories={activeCategories}
                onToggle={handleCategoryToggle}
                onReset={() => setActiveCategories(new Set())}
              />
            )}
            <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 shrink-0" />
            <FacilityFilter
              hiddenTypes={hiddenFacilityTypes}
              onToggle={handleFacilityToggle}
              onShowAll={() => setHiddenFacilityTypes(new Set())}
            />
          </div>
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
                <button onClick={loadInitialData} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors">
                  {t('map.retry')}
                </button>
                <Link href="/admin" className="text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors">
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
                <Link href="/admin" className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors">
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
              facilities={facilities}
              hiddenFacilityTypes={hiddenFacilityTypes}
              routePath={routeResult?.path || null}
              currentFloorId={selectedFloorId}
              currentHallId={selectedHallId}
              onBoothClick={handleBoothClick}
              onZoomChange={setZoom}
            />
          )}

          {/* Zoom controls */}
          <div className="absolute bottom-6 right-6 flex flex-col items-center gap-2 z-10">
            <button onClick={handleZoomIn} className="w-10 h-10 flex items-center justify-center rounded-lg bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 shadow-sm hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors" title="Zoom in">
              <ZoomIn className="h-4 w-4 text-gray-700 dark:text-gray-300" />
            </button>
            <div className="px-2 py-1 rounded-md bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 shadow-sm text-xs text-gray-600 dark:text-gray-400 font-mono">
              {Math.round(zoom * 100)}%
            </div>
            <button onClick={handleZoomOut} className="w-10 h-10 flex items-center justify-center rounded-lg bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 shadow-sm hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors" title="Zoom out">
              <ZoomOut className="h-4 w-4 text-gray-700 dark:text-gray-300" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
