import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ZoomIn, ZoomOut, Settings, Map as MapIcon, AlertTriangle, Navigation2, MapPin, Eye, EyeOff, Box, Square } from 'lucide-react';
import { Booth, Category, MapImage, Floor, Hall, Facility, Obstacle, RouteResult } from '@/types';
import { fetchBooths, fetchCategories, fetchCurrentImage, fetchFloors, fetchHalls, fetchFacilities, fetchObstacles, fetchPathNodes, fetchPathEdges, fetchRoute, fetchSetting } from '@/lib/api';
import { findPath, type PathResult } from '@/components/map/pathfinding';
import { getBoothCenter } from '@/components/map/clusterUtils';
import { useI18n } from '@/lib/i18n';
import SearchBar from '@/components/SearchBar';
import CategoryFilter from '@/components/CategoryFilter';
import LanguageSelector from '@/components/LanguageSelector';
import FloorHallSelector from '@/components/FloorHallSelector';
import FacilityFilter from '@/components/FacilityFilter';
import PathfindingUI from '@/components/PathfindingUI';

const MapViewer = dynamic(() => import('@/components/map/MapViewer'), { ssr: false });

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
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [selectedFloorId, setSelectedFloorId] = useState<number | null>(null);
  const [selectedBoothId, setSelectedBoothId] = useState<number | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<number>>(new Set());
  const [hiddenFacilityTypes, setHiddenFacilityTypes] = useState<Set<string>>(new Set());
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [pathNodes, setPathNodes] = useState<any[]>([]);
  const [pathEdges, setPathEdges] = useState<any[]>([]);
  const [navMode, setNavMode] = useState<'none' | 'waiting_start'>('none');
  const [clientRoute, setClientRoute] = useState<PathResult | null>(null);
  // 새 길찾기: 출발/도착 지점 (world 좌표 또는 부스)
  const [navStart, setNavStart] = useState<{ boothId?: number; x: number; y: number } | null>(null);
  const [navEnd, setNavEnd] = useState<{ boothId?: number; x: number; y: number } | null>(null);
  const [longPressChoice, setLongPressChoice] = useState<{ x: number; y: number; screenX: number; screenY: number } | null>(null);
  const [currentPosition, setCurrentPosition] = useState<CurrentPosition | null>(null);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [boothPopup, setBoothPopup] = useState<Booth | null>(null);
  const [pathFrom, setPathFrom] = useState<number | null>(null);
  const [pathTo, setPathTo] = useState<number | null>(null);

  // v7: Booth visibility toggle (debug/test feature)
  const [showBooths, setShowBooths] = useState(true);
  const [isBirdView, setIsBirdView] = useState(false);
  // v7: Prefetch range from admin settings
  const [prefetchRange, setPrefetchRange] = useState(2);

  // v7: Read showBooths from URL parameter
  useEffect(() => {
    const { showBooths: showBoothsParam } = router.query;
    if (showBoothsParam === 'false') {
      setShowBooths(false);
    }
  }, [router.query.showBooths]);

  // v7: Fetch prefetch range setting (v8: allow 0 for pure lazy load)
  useEffect(() => {
    fetchSetting('prefetch_range')
      .then((setting) => {
        const val = parseInt(setting.value, 10);
        if (!isNaN(val) && val >= 0 && val <= 5) {
          setPrefetchRange(val);
        }
      })
      .catch(() => { /* use default */ });
  }, []);

  const loadInitialData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [boothsData, categoriesData, floorsData] = await Promise.all([
        fetchBooths().catch(() => []),
        fetchCategories().catch(() => []),
        fetchFloors().catch(() => []),
      ]);
      setAllBooths(boothsData);
      setCategories(categoriesData);
      setFloors(floorsData);

      if (floorsData.length > 0) {
        setSelectedFloorId(floorsData[0].id);
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

  // v7: Floor memory management — load only current floor data, clear previous floor data
  useEffect(() => {
    if (!selectedFloorId) return;
    // Clear previous floor data immediately to free memory
    setBooths([]);
    setCurrentImage(null);
    setFacilities([]);
    setObstacles([]);

    async function loadFloorData() {
      const [filteredBooths, img, facs, obs, hs, pn, pe] = await Promise.all([
        fetchBooths(selectedFloorId!).catch(() => []),
        fetchCurrentImage(selectedFloorId!).catch(() => null),
        fetchFacilities(selectedFloorId!).catch(() => []),
        fetchObstacles(selectedFloorId!).catch(() => []),
        fetchHalls(selectedFloorId!).catch(() => []),
        fetchPathNodes(selectedFloorId!).catch(() => []),
        fetchPathEdges(selectedFloorId!).catch(() => []),
      ]);
      setBooths(filteredBooths);
      setCurrentImage(img);
      setFacilities(facs);
      setObstacles(obs);
      setHalls(hs);
      setPathNodes(pn);
      setPathEdges(pe);
    }
    loadFloorData();
  }, [selectedFloorId]);

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
    const { currentX, currentY, floor: floorParam } = router.query;
    if (currentX && currentY) {
      const x = Number(currentX);
      const y = Number(currentY);
      const floorId = Number(floorParam) || selectedFloorId || 0;
      if (!isNaN(x) && !isNaN(y)) {
        setCurrentPosition({ x, y, floorId, hallId: 0 });
        if (floorId) setSelectedFloorId(floorId);
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
    };
    return () => { window.setCurrentPosition = undefined; };
  }, []);

  const handleFloorChange = useCallback((floorId: number) => {
    setSelectedFloorId(floorId);
  }, []);

  const handleBoothClick = useCallback((booth: Booth) => {
    setSelectedBoothId(booth.id);
    setBoothPopup(booth);
  }, []);

  const handleMapClick = useCallback((x: number, y: number, floorId: number) => {
    console.log(`onMapClick: x=${x}, y=${y}, floorId=${floorId}`);
  }, []);

  const handleSearchSelect = useCallback((booth: Booth) => {
    if (booth.floor_id && booth.floor_id !== selectedFloorId) {
      setSelectedFloorId(booth.floor_id);
    }
    setSelectedBoothId(booth.id);
    setTimeout(() => {
      const panFn = (window as unknown as Record<string, (b: Booth) => void>).__mapViewerPanToBooth;
      if (panFn) panFn(booth);
    }, 200);
  }, [selectedFloorId]);

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

  // 가까운 부스/시설 이름 찾기
  function nearestName(wx: number, wy: number): string {
    let bestDist = Infinity;
    let bestName = '선택 지점';
    for (const b of allBooths) {
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      const d = Math.hypot(wx - cx, wy - cy);
      if (d < bestDist) {
        bestDist = d;
        const cn = b.company?.name;
        bestName = cn ? (typeof cn === 'string' ? cn : (cn as any).ko || (cn as any).en || b.booth_number) : b.booth_number;
      }
    }
    for (const f of facilities) {
      const d = Math.hypot(wx - f.x, wy - f.y);
      if (d < bestDist) { bestDist = d; bestName = (typeof f.name === 'string' ? f.name : (f.name as any)?.ko || (f.name as any)?.en) || f.type; }
    }
    return bestName;
  }

  function getNavLabel(nav: { boothId?: number; x: number; y: number }): string {
    if (nav.boothId) {
      const b = allBooths.find(bb => bb.id === nav.boothId);
      if (b) {
        const cn = b.company?.name;
        return cn ? (typeof cn === 'string' ? cn : (cn as any).ko || (cn as any).en || b.booth_number) : b.booth_number;
      }
    }
    return `${nearestName(nav.x, nav.y)} 근처`;
  }

  // 부스 클릭 → 출발/도착 선택
  function setAsStart(boothId: number) {
    const b = allBooths.find(bb => bb.id === boothId);
    const c = b ? getBoothCenter(b) : { cx: 0, cy: 0 };
    setNavStart({ boothId, x: c.cx, y: c.cy });
    setBoothPopup(null);
    setLongPressChoice(null);
  }

  function setAsDestination(boothId: number) {
    const b = allBooths.find(bb => bb.id === boothId);
    const c = b ? getBoothCenter(b) : { cx: 0, cy: 0 };
    setNavEnd({ boothId, x: c.cx, y: c.cy });
    setBoothPopup(null);
    setLongPressChoice(null);
  }

  // 롱프레스 → 출발/도착 선택
  function handleLongPress(worldX: number, worldY: number, screenX?: number, screenY?: number) {
    // 화면 중앙에 팝업
    setLongPressChoice({ x: worldX, y: worldY, screenX: screenX ?? window.innerWidth / 2, screenY: screenY ?? window.innerHeight / 2 });
  }

  function handleLongPressStart() {
    if (!longPressChoice) return;
    setNavStart({ x: longPressChoice.x, y: longPressChoice.y });
    setLongPressChoice(null);
  }

  function handleLongPressEnd() {
    if (!longPressChoice) return;
    setNavEnd({ x: longPressChoice.x, y: longPressChoice.y });
    setLongPressChoice(null);
  }

  // 출발+도착 둘 다 설정되면 자동 경로 계산
  useEffect(() => {
    if (!navStart || !navEnd) { setClientRoute(null); return; }
    // 도착이 부스면 findPath 사용, 아니면 좌표 기반
    const destBooth = navEnd.boothId ? allBooths.find(b => b.id === navEnd.boothId) : null;
    if (destBooth) {
      const result = findPath({ x: navStart.x, y: navStart.y }, destBooth, pathNodes, pathEdges, allBooths, obstacles);
      setClientRoute(result);
    } else {
      // 도착이 좌표 — 가상 부스로 처리
      const fakeBooth = { id: -1, booth_number: '', x: navEnd.x - 1, y: navEnd.y - 1, width: 2, height: 2, is_active: true } as any;
      const result = findPath({ x: navStart.x, y: navStart.y }, fakeBooth, pathNodes, pathEdges, allBooths, obstacles);
      setClientRoute(result);
    }
  }, [navStart, navEnd]);

  function handleFontUp() {
    const fn = (window as unknown as Record<string, () => void>).__mapViewerFontUp;
    if (fn) fn();
  }
  function handleFontDown() {
    const fn = (window as unknown as Record<string, () => void>).__mapViewerFontDown;
    if (fn) fn();
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
      <div className="h-screen w-screen relative bg-gray-100 dark:bg-[#141414] overflow-hidden">
        {/* Top bar — transparent overlay */}
        <div className="absolute top-0 left-0 right-0 z-20 px-4 py-3 pointer-events-none">
          {/* Row 1: Logo + Floor selector + utilities — opaque background */}
          <div className="flex items-center gap-3 pointer-events-auto bg-white dark:bg-[#1a1a1a] rounded-lg px-3 py-2 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 shrink-0">
              <MapIcon className="h-5 w-5" />
              <span className="font-bold text-sm hidden sm:inline">{t('app.title')}</span>
            </div>
            {floors.length > 0 && (
              <FloorHallSelector
                floors={floors}
                selectedFloorId={selectedFloorId}
                onFloorChange={handleFloorChange}
              />
            )}
            <div className="flex-1" />
            <PathfindingUI
              booths={allBooths}
              onRouteFound={(route) => { setRouteResult(route); setRouteError(null); }}
              onFloorSwitch={(floorId) => { setSelectedFloorId(floorId); }}
            />
            <LanguageSelector />
            <Link href="/admin" className="shrink-0 p-2 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-gray-100/80 dark:text-gray-400 dark:hover:text-indigo-400 dark:hover:bg-[#2a2a2a]/80 transition-colors" title={t('nav.admin')}>
              <Settings className="h-5 w-5" />
            </Link>
          </div>

          {/* Row 2: Search bar — 80% width */}
          <div className="mt-2 pointer-events-auto" style={{ width: '80%' }}>
            <SearchBar booths={allBooths} onSelect={handleSearchSelect} />
          </div>

          {/* 길찾기 출발/도착 상태 바 */}
          {(navStart || navEnd) && (
            <div className="mt-2 flex items-center gap-2 text-xs pointer-events-auto bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-sm rounded-lg px-3 py-1.5 w-fit">
              <Navigation2 className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-gray-600 dark:text-gray-400">
                출발: <span className="font-medium text-green-600 dark:text-green-400">{navStart ? getNavLabel(navStart) : '—'}</span>
              </span>
              <span className="text-gray-400">→</span>
              <span className="text-gray-600 dark:text-gray-400">
                도착: <span className="font-medium text-red-600 dark:text-red-400">{navEnd ? getNavLabel(navEnd) : '—'}</span>
              </span>
              <button onClick={() => { setNavStart(null); setNavEnd(null); setClientRoute(null); }} className="text-gray-400 hover:text-red-500 ml-1">&times;</button>
            </div>
          )}
        </div>

        {/* Map area — full screen behind transparent top bar */}
        <div className="absolute inset-0">
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
              key={selectedFloorId}
              booths={booths}
              categories={categories}
              currentImage={currentImage}
              selectedBoothId={selectedBoothId}
              activeCategories={activeCategories}
              facilities={facilities}
              hiddenFacilityTypes={hiddenFacilityTypes}
              obstacles={obstacles}
              halls={halls}
              routePath={routeResult?.path || null}
              routeResult={routeResult}
              currentFloorId={selectedFloorId}
              currentPosition={currentPosition}
              showBooths={showBooths}
              prefetchRange={prefetchRange}
              onBoothClick={handleBoothClick}
              onMapClick={handleMapClick}
              onZoomChange={setZoom}
              clientRoute={clientRoute}
              navMode={navMode}
              onLongPress={handleLongPress}
              navStartPoint={navStart}
              navEndPoint={navEnd}
            />
          )}

          {/* 롱프레스 출발/도착 선택 팝업 */}
          {longPressChoice && (
            <div className="fixed z-50 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 rounded-xl shadow-lg p-3 w-48"
              style={{ left: Math.min(longPressChoice.screenX - 96, window.innerWidth - 200), top: Math.max(8, longPressChoice.screenY - 80) }}>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 text-center">{nearestName(longPressChoice.x, longPressChoice.y)} 근처</p>
              <div className="flex gap-2">
                <button onClick={handleLongPressStart} className="flex-1 px-2 py-1.5 text-xs font-medium rounded-lg bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 transition-colors">
                  🟢 출발
                </button>
                <button onClick={handleLongPressEnd} className="flex-1 px-2 py-1.5 text-xs font-medium rounded-lg bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 transition-colors">
                  🔴 도착
                </button>
              </div>
              <button onClick={() => setLongPressChoice(null)} className="w-full mt-1.5 text-xs text-gray-400 hover:text-gray-600 text-center">취소</button>
            </div>
          )}

          {/* 경로 지우기 버튼 */}
          {clientRoute && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
              <button
                onClick={() => { setNavStart(null); setNavEnd(null); setClientRoute(null); }}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 rounded-full shadow-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
              >
                ✕ 경로 지우기
              </button>
            </div>
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

          {/* Multi-floor route indicator */}
          {routeResult && routeResult.floors_visited.length > 1 && (
            <div className="absolute top-4 left-4 z-20 bg-white/95 dark:bg-[#1e1e1e]/95 backdrop-blur-sm border border-gray-200 dark:border-gray-500/40 rounded-lg shadow-sm p-3 max-w-52">
              <p className="text-[10px] font-semibold text-gray-600 dark:text-gray-300 uppercase mb-1.5">{t('route.floorsUsed')}</p>
              <div className="flex flex-wrap gap-1">
                {routeResult.floors_visited.map((fid) => {
                  const fl = floors.find((f) => f.id === fid);
                  const isCurrent = fid === selectedFloorId;
                  return (
                    <button
                      key={fid}
                      onClick={() => setSelectedFloorId(fid)}
                      className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                        isCurrent
                          ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                          : 'bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 dark:bg-[#2a2a2a] dark:text-gray-300 dark:hover:text-indigo-400'
                      }`}
                    >
                      {fl ? (typeof fl.name === 'string' ? fl.name : Object.values(fl.name)[0]) : `F${fid}`}
                    </button>
                  );
                })}
              </div>
              {routeResult.facilities_used.length > 0 && (
                <div className="mt-2 pt-1.5 border-t border-gray-100 dark:border-gray-700 space-y-0.5">
                  {routeResult.facilities_used.map((fac, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                      {fac.type === 'stairs' ? 'Stairs' : fac.type === 'elevator' ? 'Elevator' : 'Escalator'}
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-1.5 text-[10px] text-gray-400 dark:text-gray-500">{t('route.distance')}: {Math.round(routeResult.total_distance)}px</p>
            </div>
          )}

          {/* Zoom controls + View toggle + Booth toggle */}
          <div className="absolute bottom-6 right-6 flex flex-col items-center gap-2 z-10">
            {/* Bird's-eye / 2D view toggle */}
            <button
              onClick={() => {
                const next = !isBirdView;
                setIsBirdView(next);
                const setTilt = (window as unknown as Record<string, (deg: number) => void>).__mapViewerSetTilt;
                if (setTilt) setTilt(next ? 45 : 0);
              }}
              className={`w-10 h-10 flex items-center justify-center rounded-lg border shadow-sm transition-colors ${
                isBirdView
                  ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-600/40 hover:bg-indigo-100'
                  : 'bg-white dark:bg-[#1e1e1e] border-gray-200 dark:border-gray-500/40 hover:bg-gray-50 dark:hover:bg-[#2a2a2a]'
              }`}
              title={isBirdView ? '2D View' : "Bird's-eye View"}
            >
              {isBirdView
                ? <Square className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                : <Box className="h-4 w-4 text-gray-700 dark:text-gray-300" />
              }
            </button>
            <button onClick={handleFontUp} className="w-10 h-10 flex items-center justify-center rounded-lg bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 shadow-sm hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors text-sm font-bold text-gray-700 dark:text-gray-300" title="글자 크게">
              A+
            </button>
            <button onClick={handleFontDown} className="w-10 h-10 flex items-center justify-center rounded-lg bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 shadow-sm hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors text-xs font-bold text-gray-700 dark:text-gray-300" title="글자 작게">
              A−
            </button>
            <button onClick={handleZoomIn} className="w-10 h-10 flex items-center justify-center rounded-lg bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 shadow-sm hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors" title="Zoom in">
              <ZoomIn className="h-4 w-4 text-gray-700 dark:text-gray-300" />
            </button>
            <button onClick={handleZoomOut} className="w-10 h-10 flex items-center justify-center rounded-lg bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 shadow-sm hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors" title="Zoom out">
              <ZoomOut className="h-4 w-4 text-gray-700 dark:text-gray-300" />
            </button>
            {/* v7: Booth visibility toggle (debug/test) */}
            <button
              onClick={() => setShowBooths((prev) => !prev)}
              className={`w-10 h-10 flex items-center justify-center rounded-lg border shadow-sm transition-colors ${
                showBooths
                  ? 'bg-white dark:bg-[#1e1e1e] border-gray-200 dark:border-gray-500/40 hover:bg-gray-50 dark:hover:bg-[#2a2a2a]'
                  : 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-600/40 hover:bg-amber-100 dark:hover:bg-amber-900/30'
              }`}
              title={showBooths ? 'Hide booths' : 'Show booths'}
            >
              {showBooths
                ? <Eye className="h-4 w-4 text-gray-700 dark:text-gray-300" />
                : <EyeOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              }
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
