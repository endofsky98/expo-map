import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ZoomIn, ZoomOut, Settings, Map as MapIcon, AlertTriangle, Navigation2, MapPin } from 'lucide-react';
import { Booth, Category, MapImage, Floor, Hall, Facility, Obstacle, RouteResult } from '@/types';
import { fetchBooths, fetchCategories, fetchCurrentImage, fetchFloors, fetchHalls, fetchFacilities, fetchObstacles, fetchRoute } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import SearchBar from '@/components/SearchBar';
import CategoryFilter from '@/components/CategoryFilter';
import LanguageSelector from '@/components/LanguageSelector';
import FloorHallSelector from '@/components/FloorHallSelector';
import FacilityFilter from '@/components/FacilityFilter';
import PathfindingUI from '@/components/PathfindingUI';

const MapViewer = dynamic(() => import('@/components/MapViewer'), { ssr: false });

interface CurrentPosition {
  x: number;
  y: number;
  floorId: number;
  hallId: number;
}

function parseBoothParam(value: string | string[] | undefined): number | null {
  if (!value || Array.isArray(value)) return null;
  const cleaned = value.replace(/^booth_/i, '');
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}

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
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [selectedFloorId, setSelectedFloorId] = useState<number | null>(null);
  const [selectedHallId, setSelectedHallId] = useState<number | null>(null);
  const [selectedBoothId, setSelectedBoothId] = useState<number | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<number>>(new Set());
  const [hiddenFacilityTypes, setHiddenFacilityTypes] = useState<Set<string>>(new Set());
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [currentPosition, setCurrentPosition] = useState<CurrentPosition | null>(null);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Booth popup for pathfinding
  const [boothPopup, setBoothPopup] = useState<Booth | null>(null);
  const [pathFrom, setPathFrom] = useState<number | null>(null);
  const [pathTo, setPathTo] = useState<number | null>(null);

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

      if (floorsData.length > 0) {
        const firstFloor = floorsData[0];
        setSelectedFloorId(firstFloor.id);
        const floorHalls = hallsData.filter((h: Hall) => h.floor_id === firstFloor.id);
        if (floorHalls.length > 0) {
          setSelectedHallId(floorHalls[0].id);
        }
      }

      if (boothsData.length === 0 && categoriesData.length === 0 && floorsData.length === 0) {
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
      const [filteredBooths, img, facs, obs] = await Promise.all([
        fetchBooths(selectedFloorId!, selectedHallId || undefined).catch(() => []),
        fetchCurrentImage(selectedFloorId!, selectedHallId || undefined).catch(() => null),
        fetchFacilities(selectedFloorId!, selectedHallId || undefined).catch(() => []),
        fetchObstacles(selectedFloorId!).catch(() => []),
      ]);
      setBooths(filteredBooths);
      setCurrentImage(img);
      setFacilities(facs);
      setObstacles(obs);
    }
    loadFloorData();
  }, [selectedFloorId, selectedHallId]);

  // URL params for pathfinding
  useEffect(() => {
    const fromId = parseBoothParam(router.query.from as string);
    const toId = parseBoothParam(router.query.to as string);
    if (fromId && toId) {
      setRouteError(null);
      fetchRoute(fromId, toId)
        .then((route) => {
          setRouteResult(route);
          if (typeof window !== 'undefined' && window.onRouteReady) {
            window.onRouteReady(route);
          }
          if (route.path.length > 0) {
            const start = route.path[0];
            if (start.floor_id) setSelectedFloorId(start.floor_id);
            if (start.hall_id) setSelectedHallId(start.hall_id);
          }
        })
        .catch(() => {
          setRouteError(t('route.notFound'));
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.from, router.query.to]);

  // URL params for current position
  useEffect(() => {
    const { currentX, currentY, floor: floorParam, hall: hallParam } = router.query;
    if (currentX && currentY) {
      const x = Number(currentX);
      const y = Number(currentY);
      const floorId = Number(floorParam) || selectedFloorId || 0;
      const hallId = Number(hallParam) || selectedHallId || 0;
      if (!isNaN(x) && !isNaN(y)) {
        setCurrentPosition({ x, y, floorId, hallId });
        if (floorId) setSelectedFloorId(floorId);
        if (hallId) setSelectedHallId(hallId);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.currentX, router.query.currentY]);

  // Register window.setCurrentPosition JS API
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.setCurrentPosition = (x: number, y: number, floorId: number, hallId: number) => {
      setCurrentPosition({ x, y, floorId, hallId });
      if (floorId) setSelectedFloorId(floorId);
      if (hallId) setSelectedHallId(hallId);
    };
    return () => { window.setCurrentPosition = undefined; };
  }, []);

  const handleFloorChange = useCallback((floorId: number) => {
    setSelectedFloorId(floorId);
    const floorHalls = halls.filter((h) => h.floor_id === floorId);
    setSelectedHallId(floorHalls.length > 0 ? floorHalls[0].id : null);
  }, [halls]);

  const handleHallChange = useCallback((hallId: number) => {
    setSelectedHallId(hallId);
    // Auto-focus on hall area
    const hall = halls.find((h) => h.id === hallId);
    if (hall && hall.area_x != null && hall.area_y != null && hall.area_width && hall.area_height) {
      setTimeout(() => {
        const panFn = (window as unknown as Record<string, (x: number, y: number, w: number, h: number) => void>).__mapViewerPanToArea;
        if (panFn) panFn(hall.area_x!, hall.area_y!, hall.area_width!, hall.area_height!);
      }, 100);
    }
  }, [halls]);

  const handleBoothClick = useCallback((booth: Booth) => {
    setSelectedBoothId(booth.id);
    setBoothPopup(booth);
  }, []);

  const handleSearchSelect = useCallback((booth: Booth) => {
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

  // Set as start/destination from booth popup
  function setAsStart(boothId: number) {
    setPathFrom(boothId);
    setBoothPopup(null);
    if (pathTo) doPathfinding(boothId, pathTo);
  }

  function setAsDestination(boothId: number) {
    setPathTo(boothId);
    setBoothPopup(null);
    if (pathFrom) doPathfinding(pathFrom, boothId);
  }

  async function doPathfinding(from: number, to: number) {
    setRouteError(null);
    try {
      const route = await fetchRoute(from, to);
      setRouteResult(route);
      if (typeof window !== 'undefined' && window.onRouteReady) {
        window.onRouteReady(route);
      }
      if (route.path.length > 0) {
        const start = route.path[0];
        if (start.floor_id) setSelectedFloorId(start.floor_id);
        if (start.hall_id) setSelectedHallId(start.hall_id);
      }
    } catch {
      setRouteError(t('route.notFound'));
      setRouteResult(null);
    }
  }

  function handleZoomIn() {
    const fn = (window as unknown as Record<string, () => void>).__mapViewerZoomIn;
    if (fn) fn();
  }

  function handleZoomOut() {
    const fn = (window as unknown as Record<string, () => void>).__mapViewerZoomOut;
    if (fn) fn();
  }

  const showMap = !loading && (booths.length > 0 || currentImage !== null);
  const fromBooth = allBooths.find((b) => b.id === pathFrom);
  const toBooth = allBooths.find((b) => b.id === pathTo);

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
              onRouteFound={(route) => { setRouteResult(route); setRouteError(null); }}
              onFloorSwitch={(floorId, hallId) => { setSelectedFloorId(floorId); setSelectedHallId(hallId); }}
            />
            <LanguageSelector />
            <Link href="/admin" className="shrink-0 p-2 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-indigo-400 dark:hover:bg-[#2a2a2a] transition-colors" title={t('nav.admin')}>
              <Settings className="h-5 w-5" />
            </Link>
          </div>

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

          {/* Pathfinding status bar */}
          {(pathFrom || pathTo) && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <Navigation2 className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-gray-600 dark:text-gray-400">
                {t('route.from')}: <span className="font-medium text-gray-900 dark:text-gray-200">{fromBooth?.booth_number || '—'}</span>
              </span>
              <span className="text-gray-400">→</span>
              <span className="text-gray-600 dark:text-gray-400">
                {t('route.to')}: <span className="font-medium text-gray-900 dark:text-gray-200">{toBooth?.booth_number || '—'}</span>
              </span>
              <button onClick={() => { setPathFrom(null); setPathTo(null); setRouteResult(null); }} className="text-gray-400 hover:text-red-500 ml-1">&times;</button>
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
          ) : error === 'api_down' && booths.length === 0 && !currentImage ? (
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
          ) : !showMap ? (
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
              obstacles={obstacles}
              routePath={routeResult?.path || null}
              currentFloorId={selectedFloorId}
              currentHallId={selectedHallId}
              currentPosition={currentPosition}
              onBoothClick={handleBoothClick}
              onZoomChange={setZoom}
            />
          )}

          {/* Booth popup with start/destination buttons */}
          {boothPopup && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 rounded-xl shadow-lg p-4 w-64">
              <button onClick={() => setBoothPopup(null)} className="absolute top-2 right-3 text-gray-400 hover:text-gray-600 text-sm">&times;</button>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{boothPopup.booth_number}</p>
              {boothPopup.company && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{typeof boothPopup.company.name === 'string' ? boothPopup.company.name : Object.values(boothPopup.company.name)[0]}</p>}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setAsStart(boothPopup.id)}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    pathFrom === boothPopup.id
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-600 hover:bg-green-50 hover:text-green-600 dark:bg-[#2a2a2a] dark:text-gray-300 dark:hover:bg-green-900/20 dark:hover:text-green-400'
                  }`}
                >
                  <MapPin className="h-3 w-3" />
                  {t('route.setStart')}
                </button>
                <button
                  onClick={() => setAsDestination(boothPopup.id)}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    pathTo === boothPopup.id
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600 dark:bg-[#2a2a2a] dark:text-gray-300 dark:hover:bg-red-900/20 dark:hover:text-red-400'
                  }`}
                >
                  <Navigation2 className="h-3 w-3" />
                  {t('route.setDest')}
                </button>
              </div>
            </div>
          )}

          {/* Route error banner */}
          {routeError && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg shadow-sm">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-sm text-red-700 dark:text-red-300">{routeError}</span>
              <button onClick={() => setRouteError(null)} className="text-red-400 hover:text-red-600 text-xs ml-2">&times;</button>
            </div>
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
