import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ZoomIn, ZoomOut, Settings, Map as MapIcon, Navigation2, MapPin, Eye, EyeOff, Box, Square } from 'lucide-react';
import { Booth, Category, MapImage, Floor, Hall, Facility, Obstacle } from '@/types';
import { fetchBooths, fetchCategories, fetchCurrentImage, fetchFloors, fetchHalls, fetchFacilities, fetchAmenities, fetchObstacles, fetchPathNodes, fetchPathEdges, fetchSetting } from '@/lib/api';
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

// ErrorBoundary to catch render crashes and show error on screen
import React from 'react';
class MapErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[MapErrorBoundary]', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ position: 'absolute', inset: 0, background: '#111', color: '#ff4444', padding: 16, fontSize: 12, fontFamily: 'monospace', overflow: 'auto', zIndex: 99999, whiteSpace: 'pre-wrap' }}>
          <strong>MapViewer Error:</strong>{'\n'}
          {this.state.error.message}{'\n\n'}
          {this.state.error.stack}
        </div>
      );
    }
    return this.props.children;
  }
}



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
  const [allFacilitiesAndAmenities, setAllFacilitiesAndAmenities] = useState<Facility[]>([]);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [selectedFloorId, setSelectedFloorId] = useState<number | null>(null);
  const [selectedBoothId, setSelectedBoothId] = useState<number | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<number>>(new Set());
  const [hiddenFacilityTypes, setHiddenFacilityTypes] = useState<Set<string>>(new Set());

  const [pathNodes, setPathNodes] = useState<any[]>([]);
  const [pathEdges, setPathEdges] = useState<any[]>([]);
  const [navMode, setNavMode] = useState<'none' | 'waiting_start'>('none');
  const [clientRoute, setClientRoute] = useState<PathResult | null>(null);
  // 새 길찾기: 출발/도착 지점 (world 좌표 또는 부스)
  const [navStart, setNavStart] = useState<{ boothId?: number; x: number; y: number; floorId?: number } | null>(null);
  const [navEnd, setNavEnd] = useState<{ boothId?: number; x: number; y: number; floorId?: number } | null>(null);
  const [longPressChoice, setLongPressChoice] = useState<{ x: number; y: number; screenX: number; screenY: number } | null>(null);
  // 네비게이션 모드
  const [navActive, setNavActive] = useState(false);
  const [navCurDist, setNavCurDist] = useState(0); // 현재 위치 (경로상 거리 px)
  const navCurDistRef = useRef(0);
  const [navConfirm, setNavConfirm] = useState<'cancel' | 'arrived' | null>(null);
  const [navFloorTransition, setNavFloorTransition] = useState<{ targetFloorId: number; label: string; direction: 'forward' | 'backward' } | null>(null);
  const [navCurrentFloorId, setNavCurrentFloorId] = useState<number | null>(null); // 네비 중 현재 위치가 있는 층
  const [currentPosition, setCurrentPosition] = useState<CurrentPosition | null>(null);
  const [zoom, setZoom] = useState(1);
  const savedTransformRef = useRef<{ x: number; y: number; scale: number; rotation: number; tilt: number } | null>(null);
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
      const [filteredBooths, img, facs, amenities, obs, hs, pn, pe] = await Promise.all([
        fetchBooths(selectedFloorId!).catch(() => []),
        fetchCurrentImage(selectedFloorId!).catch(() => null),
        fetchFacilities(selectedFloorId!).catch(() => []),
        fetchAmenities().catch(() => []),
        fetchObstacles(selectedFloorId!).catch(() => []),
        fetchHalls(selectedFloorId!).catch(() => []),
        fetchPathNodes(selectedFloorId!).catch(() => []),
        fetchPathEdges(selectedFloorId!).catch(() => []),
      ]);
      setBooths(filteredBooths);
      setCurrentImage(img);
      // facilities + amenities 합침 (현재 층)
      const currentFloorAmenities = amenities.filter((a: Facility) => a.floor_id === selectedFloorId);
      const mergedFacilities = [...facs, ...currentFloorAmenities];
      setFacilities(mergedFacilities);
      // 전체 층 amenities + facilities (PathfindingUI용)
      setAllFacilitiesAndAmenities([...facs, ...amenities]);
      setObstacles(obs);
      setHalls(hs);
      setPathNodes(pn);
      setPathEdges(pe);
    }
    loadFloorData();
  }, [selectedFloorId]);

  // URL params for pathfinding — 클라이언트 A* 기반
  useEffect(() => {
    const fromId = parseBoothParam(router.query.from as string);
    const toId = parseBoothParam(router.query.to as string);
    if (fromId && toId && allBooths.length > 0) {
      const fromBooth = allBooths.find(b => b.id === fromId);
      const toBooth = allBooths.find(b => b.id === toId);
      if (fromBooth && toBooth) {
        const fc = { x: fromBooth.x + fromBooth.width / 2, y: fromBooth.y + fromBooth.height / 2 };
        const tc = { x: toBooth.x + toBooth.width / 2, y: toBooth.y + toBooth.height / 2 };
        setNavStart({ x: fc.x, y: fc.y, floorId: fromBooth.floor_id, boothId: fromBooth.id });
        setNavEnd({ x: tc.x, y: tc.y, floorId: toBooth.floor_id, boothId: toBooth.id });
        if (fromBooth.floor_id) setSelectedFloorId(fromBooth.floor_id);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.from, router.query.to, allBooths]);

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
    setNavStart({ boothId, x: c.cx, y: c.cy, floorId: selectedFloorId ?? undefined });
    setBoothPopup(null);
    setLongPressChoice(null);
  }

  function setAsDestination(boothId: number) {
    const b = allBooths.find(bb => bb.id === boothId);
    const c = b ? getBoothCenter(b) : { cx: 0, cy: 0 };
    setNavEnd({ boothId, x: c.cx, y: c.cy, floorId: selectedFloorId ?? undefined });
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
    setNavStart({ x: longPressChoice.x, y: longPressChoice.y, floorId: selectedFloorId ?? undefined });
    setLongPressChoice(null);
  }

  function handleLongPressEnd() {
    if (!longPressChoice) return;
    setNavEnd({ x: longPressChoice.x, y: longPressChoice.y, floorId: selectedFloorId ?? undefined });
    setLongPressChoice(null);
  }

  // 출발+도착 둘 다 설정되면 자동 경로 계산
  useEffect(() => {
    if (!navStart || !navEnd) { setClientRoute(null); return; }
    let cancelled = false;

    const _navStart = navStart;
    const _navEnd = navEnd;
    async function computeRoute() {
      if (!_navStart || !_navEnd) return;
      // 항상 전체 노드/엣지/부스/장애물을 페치 (findPath가 내부에서 층별 분리)
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8008';
      const [useNodes, useEdges, useBooths, useObstacles] = await Promise.all([
        fetch(`${API_BASE}/api/path-nodes`).then(r => r.json()).catch(() => pathNodes),
        fetch(`${API_BASE}/api/path-edges`).then(r => r.json()).catch(() => pathEdges),
        fetch(`${API_BASE}/api/booths`).then(r => r.json()).catch(() => allBooths),
        fetch(`${API_BASE}/api/obstacles`).then(r => r.json()).catch(() => obstacles),
      ]);
      if (cancelled) return;

      const destBooth = _navEnd.boothId ? useBooths.find((b: any) => b.id === _navEnd.boothId) : null;
      
      let result: ReturnType<typeof findPath>;
      if (destBooth) {
        result = findPath({ x: _navStart.x, y: _navStart.y }, destBooth, useNodes, useEdges, useBooths, useObstacles, _navStart.floorId, _navEnd.floorId);
      } else {
        const fakeBooth = { id: -1, booth_number: '', x: _navEnd.x - 1, y: _navEnd.y - 1, width: 2, height: 2, is_active: true } as any;
        result = findPath({ x: _navStart.x, y: _navStart.y }, fakeBooth, useNodes, useEdges, useBooths, useObstacles, _navStart.floorId, _navEnd.floorId);
      }
      
      // 경로 끝/시작에서 실제 마커 위치까지 연장 (점선 구간) — floorSegments도 함께 업데이트
      if (result && result.floorSegments && result.floorSegments.length > 0) {
        const lastSeg = result.floorSegments[result.floorSegments.length - 1];
        if (lastSeg.path.length > 0) {
          const last = lastSeg.path[lastSeg.path.length - 1];
          const dx = _navEnd.x - last.x, dy = _navEnd.y - last.y;
          const extra = Math.sqrt(dx * dx + dy * dy);
          if (extra > 2) {
            result.endExtIdx = lastSeg.path.length - 1;
            lastSeg.path.push({ x: _navEnd.x, y: _navEnd.y });
            lastSeg.distance += extra;
            result.distance += extra;
          }
        }
        const firstSeg = result.floorSegments[0];
        if (firstSeg.path.length > 0) {
          const first = firstSeg.path[0];
          const dx = _navStart.x - first.x, dy = _navStart.y - first.y;
          const extra = Math.sqrt(dx * dx + dy * dy);
          if (extra > 2) {
            firstSeg.path.unshift({ x: _navStart.x, y: _navStart.y });
            firstSeg.distance += extra;
            result.distance += extra;
            result.startExtIdx = 1;
            if (result.endExtIdx != null && result.floorSegments.length === 1) result.endExtIdx += 1;
          }
        }
        // path = 모든 세그먼트 합침
        result.path = result.floorSegments.flatMap(s => s.path);
      }

      if (cancelled) return;
      setClientRoute(result);

    }

    computeRoute();
    return () => { cancelled = true; };
  }, [navStart, navEnd]);

  // 현재 층 경로만 추출 (floorSegments 기반)
  const currentFloorRoute = useMemo(() => {
    if (!clientRoute?.floorSegments) return null;
    const seg = clientRoute.floorSegments.find(s => s.floorId === selectedFloorId);
    if (!seg || seg.path.length < 2) return null;
    const isStartFloor = clientRoute.floorSegments[0]?.floorId === selectedFloorId;
    const isEndFloor = clientRoute.floorSegments[clientRoute.floorSegments.length - 1]?.floorId === selectedFloorId;
    return {
      path: seg.path,
      distance: seg.distance,
      startExtIdx: isStartFloor ? clientRoute.startExtIdx : undefined,
      endExtIdx: isEndFloor ? clientRoute.endExtIdx : undefined,
      floorSegments: clientRoute.floorSegments,
      floors: clientRoute.floors,
    } as typeof clientRoute;
  }, [clientRoute, selectedFloorId]);

  // 경로 위 거리 d에서의 좌표 (현재 층 기준)
  function posAtDist(d: number): { x: number; y: number } | null {
    const route = currentFloorRoute ?? clientRoute;
    if (!route) return null;
    const path = route.path;
    let traveled = 0;
    for (let i = 1; i < path.length; i++) {
      const dx = path[i].x - path[i-1].x, dy = path[i].y - path[i-1].y;
      const segLen = Math.hypot(dx, dy);
      if (traveled + segLen >= d) {
        const t = segLen > 0 ? (d - traveled) / segLen : 0;
        return { x: path[i-1].x + dx * t, y: path[i-1].y + dy * t };
      }
      traveled += segLen;
    }
    return path[path.length - 1];
  }

  // 현재 위치 좌표 — 네비 중 현재 층에서만 표시
  const navCurrentPos = (navActive && navCurrentFloorId === selectedFloorId) ? posAtDist(navCurDist) : null;

  // 경로 위 특정 거리의 진행 방향 각도 (다음 방향)
  function dirAtDist(d: number): number {
    const route = currentFloorRoute ?? clientRoute;
    if (!route) return 0;
    const p0 = posAtDist(d);
    const p1 = posAtDist(Math.min(d + 20, route.distance));
    if (!p0 || !p1 || (p0.x === p1.x && p0.y === p1.y)) return 0;
    return -Math.atan2(p1.x - p0.x, -(p1.y - p0.y));
  }

  // 실선(네비 유효) 구간의 시작/끝 거리 계산
  function getNavRange(): { navMinDist: number; navMaxDist: number } {
    const route = currentFloorRoute ?? clientRoute;
    if (!route) return { navMinDist: 0, navMaxDist: 0 };
    const path = route.path;
    let navMinDist = 0;
    let navMaxDist = route.distance;

    if (route.startExtIdx != null && route.startExtIdx > 0) {
      let d = 0;
      for (let i = 1; i <= route.startExtIdx; i++) {
        d += Math.hypot(path[i].x - path[i-1].x, path[i].y - path[i-1].y);
      }
      navMinDist = d;
    }
    if (route.endExtIdx != null && route.endExtIdx < path.length - 1) {
      let d = 0;
      for (let i = route.endExtIdx + 1; i < path.length; i++) {
        d += Math.hypot(path[i].x - path[i-1].x, path[i].y - path[i-1].y);
      }
      navMaxDist = route.distance - d;
    }
    return { navMinDist, navMaxDist };
  }

  // 멀티층 경로 여부
  const isMultiFloorRoute = clientRoute?.floors && clientRoute.floors.length > 1;

  // 네비게이션 시작 — 경로의 첫 번째 층으로 이동 후 시작
  function startNavigation() {
    if (!clientRoute?.floorSegments || clientRoute.floorSegments.length === 0) return;
    const firstSeg = clientRoute.floorSegments[0];
    // 첫 번째 세그먼트 층으로 이동
    if (selectedFloorId !== firstSeg.floorId) {
      setSelectedFloorId(firstSeg.floorId);
    }
    setNavActive(true);
    setNavCurrentFloorId(firstSeg.floorId);
    // 시작은 setTimeout으로 리마운트 대기 후
    setTimeout(() => {
      const route = clientRoute.floorSegments![0];
      if (!route || route.path.length < 2) return;
      navCurDistRef.current = 0;
      setNavCurDist(0);
      const pos = route.path[0];
      const panTo = (window as any).__mapViewerPanToWorld;
      const setTilt = (window as any).__mapViewerSetTilt;
      if (setTilt) setTilt(60);
      if (pos && panTo) panTo(pos.x, pos.y, 0.3);
    }, 300);
  }

  // 현재 층 세그먼트 인덱스
  const currentSegIdx = clientRoute?.floorSegments?.findIndex(s => s.floorId === selectedFloorId) ?? -1;
  const isLastSeg = currentSegIdx >= 0 && clientRoute?.floorSegments
    ? currentSegIdx === clientRoute.floorSegments.length - 1 : true;
  const isFirstSeg = currentSegIdx <= 0;

  // 다음 (100px 전진) — 실선 구간 내에서만, 끝에 도달하면 다음 층으로
  function navNext() {
    // 다른 층을 보고 있으면 네비 현재 층으로 먼저 이동
    if (navCurrentFloorId != null && selectedFloorId !== navCurrentFloorId) {
      setSelectedFloorId(navCurrentFloorId);
      return;
    }
    if (!currentFloorRoute) return;
    const { navMaxDist } = getNavRange();
    const newDist = Math.min(navCurDistRef.current + 100, navMaxDist);
    navCurDistRef.current = newDist;
    setNavCurDist(newDist);
    const pos = posAtDist(newDist);
    const rot = dirAtDist(newDist);
    if (pos) {
      const animNav = (window as any).__mapViewerAnimateNav;
      if (animNav) animNav(pos.x, pos.y, rot, 500);
    }
    if (newDist >= navMaxDist) {
      if (!isLastSeg && clientRoute?.floorSegments) {
        // 다음 층 세그먼트가 있음 — "N층으로 이동하세요" 알림
        const nextSeg = clientRoute.floorSegments[currentSegIdx + 1];
        if (nextSeg) {
          // floor_id → 표시 층 이름 (floor_id=1→1층, floor_id=2→3층)
          const fn = floors?.find(f => f.id === nextSeg.floorId)?.name;
          const floorLabel = typeof fn === 'string' ? fn : (fn ? Object.values(fn)[0] : `${nextSeg.floorId}층`);
          setNavFloorTransition({ targetFloorId: nextSeg.floorId, label: floorLabel, direction: 'forward' });
        }
      } else {
        setNavConfirm('arrived');
      }
    }
  }

  // 층 전환 확인 — 알림에서 "확인" 누르면 실행
  function navFloorTransitionConfirm() {
    if (!navFloorTransition || !clientRoute?.floorSegments) return;
    const targetFloorId = navFloorTransition.targetFloorId;
    const direction = navFloorTransition.direction;
    setNavFloorTransition(null);
    setSelectedFloorId(targetFloorId);
    setNavCurrentFloorId(targetFloorId);
    setTimeout(() => {
      const seg = clientRoute!.floorSegments!.find(s => s.floorId === targetFloorId);
      if (!seg || seg.path.length < 2) return;
      if (direction === 'backward') {
        // 이전 → 해당 층의 끝에서 시작
        navCurDistRef.current = seg.distance;
        setNavCurDist(seg.distance);
        const p = seg.path[seg.path.length - 1];
        const animNav = (window as any).__mapViewerAnimateNav;
        if (animNav) animNav(p.x, p.y, 0, 300);
      } else {
        // 다음 → 해당 층의 처음에서 시작
        navCurDistRef.current = 0;
        setNavCurDist(0);
        const p = seg.path[0];
        const animNav = (window as any).__mapViewerAnimateNav;
        if (animNav) animNav(p.x, p.y, 0, 300);
      }
    }, 500);
  }

  // 이전 (100px 후퇴) — 실선 구간 내에서만, 시작에 도달하면 이전 층으로
  function navPrev() {
    if (navCurrentFloorId != null && selectedFloorId !== navCurrentFloorId) {
      setSelectedFloorId(navCurrentFloorId);
      return;
    }
    if (!currentFloorRoute) return;
    const { navMinDist } = getNavRange();
    const newDist = Math.max(navCurDistRef.current - 100, navMinDist);
    navCurDistRef.current = newDist;
    setNavCurDist(newDist);
    const pos = posAtDist(newDist);
    const rot = dirAtDist(newDist);
    if (pos) {
      const animNav = (window as any).__mapViewerAnimateNav;
      if (animNav) animNav(pos.x, pos.y, rot, 500);
    }
    if (newDist <= navMinDist && !isFirstSeg && clientRoute?.floorSegments) {
      const prevSeg = clientRoute.floorSegments[currentSegIdx - 1];
      if (prevSeg) {
        // 이전 방향은 알림 없이 바로 전환
        setSelectedFloorId(prevSeg.floorId);
        setNavCurrentFloorId(prevSeg.floorId);
        setTimeout(() => {
          navCurDistRef.current = prevSeg.distance;
          setNavCurDist(prevSeg.distance);
          const p = prevSeg.path[prevSeg.path.length - 1];
          if (p) {
            const animNav = (window as any).__mapViewerAnimateNav;
            if (animNav) animNav(p.x, p.y, 0, 300);
          }
        }, 500);
      }
    }
  }

  // 취소
  function navCancel() {
    setNavConfirm('cancel');
  }

  // 취소 확인
  function navCancelConfirm() {
    setNavActive(false);
    setNavCurDist(0);
    setNavConfirm(null);
    setNavCurrentFloorId(null);
    const pos = posAtDist(navCurDistRef.current) || { x: 0, y: 0 };
    const animNav = (window as any).__mapViewerAnimateNav;
    if (animNav) animNav(pos.x, pos.y, 0, 400);
    const setTilt = (window as any).__mapViewerSetTilt;
    if (setTilt) setTilt(0);
  }

  function navArrivedDeleteRoute() {
    const pos = posAtDist(navCurDistRef.current) || { x: 0, y: 0 };
    const animNav = (window as any).__mapViewerAnimateNav;
    if (animNav) animNav(pos.x, pos.y, 0, 400);
    const setTilt = (window as any).__mapViewerSetTilt;
    if (setTilt) setTilt(0);
    setNavActive(false);
    setNavCurDist(0);
    setNavConfirm(null);
    setNavCurrentFloorId(null);
    setNavStart(null);
    setNavEnd(null);
    setClientRoute(null);
  }

  function navArrivedKeepRoute() {
    const pos = posAtDist(navCurDistRef.current) || { x: 0, y: 0 };
    const animNav = (window as any).__mapViewerAnimateNav;
    if (animNav) animNav(pos.x, pos.y, 0, 400);
    const setTilt = (window as any).__mapViewerSetTilt;
    if (setTilt) setTilt(0);
    setNavActive(false);
    setNavCurDist(0);
    setNavConfirm(null);
    setNavCurrentFloorId(null);
  }

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
      {/* DEBUG overlay — 에러 표시 */}

      <div className="h-screen w-screen relative bg-gray-100 dark:bg-[#141414] overflow-hidden select-none" style={{ WebkitUserSelect: 'none' }}>
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
              facilities={allFacilitiesAndAmenities}
              navStart={navStart}
              navEnd={navEnd}
              onSetStart={(p) => { setNavStart(p); if (!p) setClientRoute(null); }}
              onSetEnd={(p) => { setNavEnd(p); if (!p) setClientRoute(null); }}
              onFloorSwitch={(floorId) => { setSelectedFloorId(floorId); }}
            />
            <LanguageSelector />
            <Link href="/admin" className="shrink-0 p-2 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-gray-100/80 dark:text-gray-400 dark:hover:text-indigo-400 dark:hover:bg-[#2a2a2a]/80 transition-colors" title={t('nav.admin')}>
              <Settings className="h-5 w-5" />
            </Link>
          </div>

          {/* Row 2: Search bar — 80% width */}
          <div className="mt-2 pointer-events-auto" style={{ width: '80%' }}>
            <SearchBar
              booths={allBooths}
              onSelect={handleSearchSelect}
              onView={(booth) => {
                setSelectedBoothId(booth.id);
                if (booth.floor_id && booth.floor_id !== selectedFloorId) setSelectedFloorId(booth.floor_id);
                setTimeout(() => {
                  const panTo = (window as any).__mapViewerPanToWorld;
                  if (panTo) panTo(booth.x + booth.width / 2, booth.y + booth.height / 2, 0.5);
                }, 200);
              }}
              onSetStart={(booth) => {
                const c = { x: booth.x + booth.width / 2, y: booth.y + booth.height / 2 };
                setSelectedBoothId(null);
                setNavStart({ boothId: booth.id, x: c.x, y: c.y, floorId: booth.floor_id });
                if (!navEnd) {
                  // 보기와 동일
                  setSelectedBoothId(booth.id);
                  if (booth.floor_id && booth.floor_id !== selectedFloorId) setSelectedFloorId(booth.floor_id);
                  setTimeout(() => {
                    const panTo = (window as any).__mapViewerPanToWorld;
                    if (panTo) panTo(c.x, c.y, 0.5);
                  }, 200);
                }
              }}
              onSetEnd={(booth) => {
                const c = { x: booth.x + booth.width / 2, y: booth.y + booth.height / 2 };
                setSelectedBoothId(null);
                setNavEnd({ boothId: booth.id, x: c.x, y: c.y, floorId: booth.floor_id });
                if (!navStart) {
                  // 보기와 동일
                  setSelectedBoothId(booth.id);
                  if (booth.floor_id && booth.floor_id !== selectedFloorId) setSelectedFloorId(booth.floor_id);
                  setTimeout(() => {
                    const panTo = (window as any).__mapViewerPanToWorld;
                    if (panTo) panTo(c.x, c.y, 0.5);
                  }, 200);
                }
              }}
            />
          </div>

          {/* 길찾기 출발/도착 상태 바 */}
          {(navStart || navEnd) && (
            <div
              className="mt-2 flex items-center gap-2 text-xs pointer-events-auto bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-sm rounded-lg px-3 py-1.5 w-fit cursor-pointer hover:bg-white dark:hover:bg-[#1a1a1a] transition-colors"
              onClick={() => { (window as any).__openPathfindingUI?.(); }}
            >
              <Navigation2 className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-gray-600 dark:text-gray-400">
                출발: <span className="font-medium text-green-600 dark:text-green-400">{navStart ? getNavLabel(navStart) : '—'}</span>
              </span>
              <span className="text-gray-400">→</span>
              <span className="text-gray-600 dark:text-gray-400">
                도착: <span className="font-medium text-red-600 dark:text-red-400">{navEnd ? getNavLabel(navEnd) : '—'}</span>
              </span>
              <button onClick={() => { setNavStart(null); setNavEnd(null); setClientRoute(null); setNavActive(false); setNavCurrentFloorId(null); }} className="text-gray-400 hover:text-red-500 ml-1">&times;</button>
              {clientRoute && !navActive && (
                <button onClick={startNavigation} className="ml-2 px-2 py-0.5 text-xs font-medium rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors">
                  🧭 네비게이션
                </button>
              )}
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
            <MapErrorBoundary key={`eb-${selectedFloorId}`}>
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
              routePath={null}
              currentFloorId={selectedFloorId}
              currentPosition={currentPosition}
              showBooths={showBooths}
              prefetchRange={prefetchRange}
              onBoothClick={handleBoothClick}
              onMapClick={handleMapClick}
              onZoomChange={setZoom}
              clientRoute={currentFloorRoute}
              navMode={navMode}
              onLongPress={handleLongPress}
              navStartPoint={navStart?.floorId === selectedFloorId ? navStart : null}
              navEndPoint={navEnd?.floorId === selectedFloorId ? navEnd : null}
              navCurrentPos={navCurrentPos}
              initialTransform={savedTransformRef.current}
              onTransformChange={(t) => { savedTransformRef.current = t; }}
            />
            </MapErrorBoundary>
          )}

          {/* 롱프레스 출발/도착 선택 팝업 */}
          {longPressChoice && (
            <div className="fixed z-50 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 rounded-xl shadow-lg p-3 w-48"
              style={{ left: Math.min(Math.max(8, longPressChoice.screenX - 96), window.innerWidth - 200), top: Math.max(8, longPressChoice.screenY - 110), userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none', pointerEvents: 'auto' }}>
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

          {/* 경로 지우기 버튼 (네비게이션 비활성일 때만) */}
          {clientRoute && !navActive && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
              <button
                onClick={() => { setNavStart(null); setNavEnd(null); setClientRoute(null); }}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 rounded-full shadow-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
              >
                ✕ 경로 지우기
              </button>
            </div>
          )}

          {/* 네비게이션 모드 하단 바 */}
          {navActive && (
            <div className="absolute bottom-0 left-0 right-0 z-40 p-4 pointer-events-none">
              <div className="flex items-center gap-2 max-w-lg mx-auto pointer-events-auto">
                <button onClick={navPrev} className="px-4 py-3 text-sm font-medium rounded-lg bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                  ◀ 이전
                </button>
                <button onClick={navNext} className="flex-1 py-3 text-sm font-bold rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors">
                  다음 ▶
                </button>
                <button onClick={navCancel} className="px-4 py-3 text-sm font-medium rounded-lg bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors">
                  취소
                </button>
              </div>
              {clientRoute && (
                <div className="mt-2 max-w-lg mx-auto pointer-events-auto">
                  <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${Math.min(100, (() => {
                      let acc = 0;
                      if (clientRoute.floorSegments && currentSegIdx > 0) {
                        for (let i = 0; i < currentSegIdx; i++) acc += clientRoute.floorSegments[i].distance;
                      }
                      return ((acc + navCurDist) / clientRoute.distance) * 100;
                    })())}%` }} />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1">
                    {Math.round((() => {
                      // 이전 세그먼트 거리 합산 + 현재 세그먼트 거리
                      let accumulated = 0;
                      if (clientRoute.floorSegments && currentSegIdx > 0) {
                        for (let i = 0; i < currentSegIdx; i++) accumulated += clientRoute.floorSegments[i].distance;
                      }
                      return accumulated + navCurDist;
                    })())}px / {Math.round(clientRoute.distance)}px
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 네비게이션 확인 다이얼로그 */}
          {navConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-xl p-6 w-72">
                {navConfirm === 'cancel' ? (
                  <>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 text-center">네비게이션을 취소하시겠습니까?</p>
                    <div className="flex gap-2 mt-4">
                      <button onClick={() => setNavConfirm(null)} className="flex-1 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">아니오</button>
                      <button onClick={navCancelConfirm} className="flex-1 py-2 text-sm rounded-lg bg-red-500 text-white">예, 취소</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-bold text-center text-blue-600 dark:text-blue-400 mb-2">🎉 도착하였습니다!</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 text-center">경로를 삭제하시겠습니까?</p>
                    <div className="flex gap-2 mt-4">
                      <button onClick={navArrivedKeepRoute} className="flex-1 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">경로 유지</button>
                      <button onClick={navArrivedDeleteRoute} className="flex-1 py-2 text-sm rounded-lg bg-red-500 text-white">삭제</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 층 전환 알림 */}
          {navFloorTransition && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-xl p-6 w-72">
                <p className="text-lg font-bold text-center text-blue-600 dark:text-blue-400 mb-2">🚶 층 이동</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 text-center">
                  <span className="font-semibold">{navFloorTransition.label}</span>으로 이동하세요
                </p>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => setNavFloorTransition(null)}
                    className="flex-1 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  >취소</button>
                  <button
                    onClick={navFloorTransitionConfirm}
                    className="flex-1 py-2 text-sm rounded-lg bg-blue-500 text-white font-semibold"
                  >확인</button>
                </div>
              </div>
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
