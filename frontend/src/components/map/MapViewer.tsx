import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as PIXI from 'pixi.js';
import { Booth, Hall, Category, MapImage, Facility, RoutePoint, Obstacle, ZoomLevel } from '@/types';
import { useI18n } from '@/lib/i18n';
import {
  MapViewerProps, TileInfo, CurrentPosition, FACILITY_STYLES,
  MIN_ZOOM, MAX_ZOOM, MIN_TILT, MAX_TILT, MIN_BOOTH_SCREEN_SIZE,
  CLICK_THRESHOLD, CLICK_TIME_THRESHOLD, ROTATION_THRESHOLD, ZOOM_THRESHOLD, MIN_MARKER_DIST,
  parseZoomLevels, hexStringToNumber, selectTileLevel,
} from './mapTypes';
import { attachPointerEvents } from './useMapPointerEvents';
import { TileStateManager } from './TileState';
import { clusterBooths, selectRepresentative, getBoothDisplayName, getBoothCenter, CLUSTER_MAX_ZOOM, CLUSTER_ANIM_MS, setMapDimensions, invalidateClusterIndex } from './clusterUtils';
// import dynamic from 'next/dynamic';
// Three.js 3D 벽 오버레이 — 필요 시 주석 해제. 상세 사용법: WallOverlay.tsx 참고.
// const WallOverlay = dynamic(() => import('./WallOverlay'), { ssr: false });

export default function MapViewer({
  booths,
  halls = [],
  categories,
  currentImage,
  selectedBoothId,
  activeCategories,
  facilities,
  hiddenFacilityTypes,
  obstacles,
  routePath,
  currentFloorId,
  currentPosition,
  showBooths,
  prefetchRange,
  onBoothClick,
  onMapClick,
  onZoomChange,
  clientRoute,
  navMode,
  onLongPress,
  navStartPoint,
  navEndPoint,
  navCurrentPos,
  initialTransform,
  onTransformChange,
}: MapViewerProps) {
  const { ln } = useI18n();
  const [facilityTooltip, setFacilityTooltip] = useState<{ facility: Facility; screenX: number; screenY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiApp = useRef<PIXI.Application | null>(null);
  const mainContainerRef = useRef<PIXI.Container | null>(null);
  const transformRef = useRef({ x: 0, y: 0, scale: 1, rotation: 0, tilt: 0 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasDimsRef = useRef({ width: 800, height: 600 });
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // 글자 크기 상태 (기본 24px, 클러스터 반경 = fontSize * 3)
  const [markerFontSize, setMarkerFontSize] = useState(16);
  const markerFontSizeRef = useRef(16);
  markerFontSizeRef.current = markerFontSize;


  // Layer refs
  const tileLayerRef = useRef<PIXI.Container>(new PIXI.Container());
  const obstacleLayerRef = useRef<PIXI.Container>(new PIXI.Container());
  const routeLayerRef = useRef<PIXI.Container>(new PIXI.Container());
  const facilityLayerRef = useRef<PIXI.Container>(new PIXI.Container());
  const overlayLayerRef = useRef<PIXI.Container>(new PIXI.Container());

  // State tracking refs
  const tileCacheRef = useRef<Map<string, PIXI.Texture>>(new Map());
  const currentImageIdRef = useRef<number | null>(null);
  const currentTileLevelRef = useRef<number>(0);

  // Function refs for pointer event handlers
  const renderTilesFnRef = useRef<() => void>(() => {});
  // Track tile load failures to avoid infinite retry loops (max 3 retries per tile)
  const tileFailCountRef = useRef<Map<string, number>>(new Map());
  const tileStateRef = useRef<TileStateManager | null>(null);

  // Callbacks as refs to avoid stale closures
  const onBoothClickRef = useRef(onBoothClick);
  const onMapClickRef = useRef(onMapClick);
  const onZoomChangeRef = useRef(onZoomChange);
  const onLongPressRef = useRef(onLongPress);
  onBoothClickRef.current = onBoothClick;
  onMapClickRef.current = onMapClick;
  onZoomChangeRef.current = onZoomChange;
  onLongPressRef.current = onLongPress;

  const markerOverlayRef = useRef<HTMLDivElement | null>(null);
  const markerElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const facilityMarkerElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const rafIdRef = useRef<number>(0);
  const prevVisibleIdsRef = useRef<Set<number>>(new Set());
  const prevScaleRef = useRef<number>(1);
  const stableIdsRef = useRef<Set<number>>(new Set()); // confirmed markers (only recalc on settle)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadingIdsRef = useRef<Set<number>>(new Set()); // markers mid-fade, don't touch opacity
  const inertiaRafRef = useRef<number>(0);
  const velocityRef = useRef({ vx: 0, vy: 0 });
  const canvasPadRef = useRef({ left: 0, top: 0 }); // canvas overscan offset for tilt headroom

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8008';

  function resolveImageUrl(path: string): string {
    if (!path) return '';
    return path.startsWith('http') ? path : `${apiBase}${path}`;
  }

  const tileInfo = useMemo((): TileInfo | null => {
    if (!currentImage?.tile_info) return null;
    try {
      return typeof currentImage.tile_info === 'string'
        ? JSON.parse(currentImage.tile_info)
        : currentImage.tile_info;
    } catch { return null; }
  }, [currentImage]);

  const useTileMode = !!tileInfo;

  const categoryColorMap = useMemo(() => {
    const map: Record<number, string> = {};
    categories.forEach((cat) => { map[cat.id] = cat.color; });
    return map;
  }, [categories]);

  const selectedBoothIdRef = useRef(selectedBoothId);
  selectedBoothIdRef.current = selectedBoothId;
  const showBoothsRef = useRef(showBooths);
  showBoothsRef.current = showBooths;
  const activeCategoriesRef = useRef(activeCategories);
  activeCategoriesRef.current = activeCategories;
  const categoryColorMapRef = useRef(categoryColorMap);
  categoryColorMapRef.current = categoryColorMap;
  const lnRef = useRef(ln);
  lnRef.current = ln;

  const visibleFacilities = useMemo(() => {
    return facilities.filter((f) => {
      if (!f.is_active) return false;
      if (hiddenFacilityTypes.has(f.type)) return false;
      return true;
    });
  }, [facilities, hiddenFacilityTypes]);

  const currentRoutePoints = useMemo(() => {
    if (!routePath || !currentFloorId) return null;
    const points: { x: number; y: number }[] = [];
    for (const p of routePath) {
      if (p.floor_id === currentFloorId) {
        points.push({ x: p.x, y: p.y });
      }
    }
    return points.length >= 2 ? points : null;
  }, [routePath, currentFloorId]);

  const routeTransitionMarkers = useMemo(() => {
    if (!routePath || !currentFloorId || routePath.length < 2) return [];
    const markers: { x: number; y: number; type: 'start' | 'end' | 'transition'; label: string }[] = [];
    for (let i = 0; i < routePath.length; i++) {
      const p = routePath[i];
      if (p.floor_id !== currentFloorId) continue;
      const prev = i > 0 ? routePath[i - 1] : null;
      const next = i < routePath.length - 1 ? routePath[i + 1] : null;
      if (i === 0) {
        markers.push({ x: p.x, y: p.y, type: 'start', label: 'S' });
      } else if (i === routePath.length - 1) {
        markers.push({ x: p.x, y: p.y, type: 'end', label: 'D' });
      } else if (prev && prev.floor_id !== currentFloorId) {
        markers.push({ x: p.x, y: p.y, type: 'transition', label: '▼' });
      } else if (next && next.floor_id !== currentFloorId) {
        markers.push({ x: p.x, y: p.y, type: 'transition', label: '▲' });
      }
    }
    return markers;
  }, [routePath, currentFloorId]);

  const routeFacilityMarkers: Facility[] = [];

  const imgWidth = currentImage?.width || 800;
  const imgHeight = currentImage?.height || 600;
  setMapDimensions(imgWidth, imgHeight);

  // Refs for data accessed in click handler closure
  const boothsRef = useRef(booths);
  boothsRef.current = booths;
  const hallsRef = useRef<Hall[]>(halls);
  hallsRef.current = halls;
  const routePathRef = useRef(routePath);
  routePathRef.current = routePath;
  const clientRouteRef = useRef(clientRoute);
  clientRouteRef.current = clientRoute;
  const boothMapRef = useRef<Map<number, Booth>>(new Map());
  const visibleFacilitiesRef = useRef(visibleFacilities);
  useEffect(() => {
    const m = new Map<number, Booth>();
    for (const b of booths) m.set(b.id, b);
    boothMapRef.current = m;
    invalidateClusterIndex(); // 층 전환 시 supercluster 재생성
  }, [booths]);
  visibleFacilitiesRef.current = visibleFacilities;
  const currentFloorIdRef = useRef(currentFloorId);
  currentFloorIdRef.current = currentFloorId;

  // PIXI cluster shading layer ref
  const clusterContainerRef = useRef<PIXI.Container | null>(null);
  const clusterGfxRef = useRef<PIXI.Graphics | null>(null);
  const routeGfxRef = useRef<PIXI.Graphics | null>(null);
  const navStartMarkerRef = useRef<HTMLDivElement | null>(null);
  const navEndMarkerRef = useRef<HTMLDivElement | null>(null);
  const navStartPointRef = useRef(navStartPoint);
  const navEndPointRef = useRef(navEndPoint);
  navStartPointRef.current = navStartPoint;
  const navCurrentPosRef = useRef(navCurrentPos);
  navCurrentPosRef.current = navCurrentPos;
  const navCurrentMarkerRef = useRef<HTMLDivElement | null>(null);
  navEndPointRef.current = navEndPoint;
  const clusterBadgesRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const clusterBadgeWorldRef = useRef<Map<string, { wx: number; wy: number }>>(new Map());

  // 대표 부스 → 클러스터 중앙 world 좌표 (boothId → {wx, wy})
  const clusterRepCenterRef = useRef<Map<number, { wx: number; wy: number }>>(new Map());
  const clusterNameMapRef = useRef<Map<number, string>>(new Map());

  // World coordinate → screen pixel (accounts for tilt via CSS perspective)
  function worldToScreen(wx: number, wy: number): { sx: number; sy: number } {
    const t = transformRef.current;
    const cos = Math.cos(t.rotation);
    const sin = Math.sin(t.rotation);
    // Base screen position (before tilt)
    let sx = t.x + t.scale * (wx * cos - wy * sin);
    let sy = t.y + t.scale * (wx * sin + wy * cos);

    // If tilted, simulate CSS perspective + rotateX transform
    // so markers align with the tilted canvas
    if (t.tilt > 0) {
      const { height: ch } = canvasDimsRef.current;
      const rad = (t.tilt * Math.PI) / 180;
      const cosT = Math.cos(rad);
      const sinT = Math.sin(rad);
      const scaleXFactor = 1 / cosT; // same as CSS scaleX compensation
      const perspective = 800;
      const originY = ch * 0.3; // matches CSS transformOrigin 'center 30%'

      // Transform point through perspective + rotateX
      const dy = sy - originY;
      const z = -dy * sinT;         // Z depth from rotation
      const yRotated = dy * cosT;   // Y after rotation
      const pScale = perspective / (perspective + z); // perspective projection

      sx = (sx - canvasDimsRef.current.width / 2) * scaleXFactor * pScale + canvasDimsRef.current.width / 2;
      sy = yRotated * pScale + originY;
    }

    return { sx, sy };
  }

  // Schedule marker position update via rAF (debounced)
  function scheduleMarkerUpdate() {
    updateMarkerPositions();
  }

  // Clamp: image must overlap screen center — image cannot leave the center point
  function clampPosition(t: { x: number; y: number; scale: number; rotation: number }) {
    const { width: cw, height: ch } = canvasDimsRef.current;
    const sc = t.scale;
    const cosR = Math.cos(t.rotation);
    const sinR = Math.sin(t.rotation);
    const absC = Math.abs(cosR);
    const absS = Math.abs(sinR);
    // Rotated image bounding box half-extents
    const halfW = (imgWidth * absC + imgHeight * absS) * sc / 2;
    const halfH = (imgWidth * absS + imgHeight * absC) * sc / 2;
    // Image center in screen coords
    const icx = t.x + sc * (imgWidth / 2 * cosR - imgHeight / 2 * sinR);
    const icy = t.y + sc * (imgWidth / 2 * sinR + imgHeight / 2 * cosR);
    // Screen center
    const scx = cw / 2;
    const scy = ch / 2;
    // Image AABB edges
    const imgLeft = icx - halfW;
    const imgRight = icx + halfW;
    const imgTop = icy - halfH;
    const imgBot = icy + halfH;
    // Push: image must cover screen center
    let dx = 0, dy = 0;
    if (imgRight < scx) dx = scx - imgRight;
    else if (imgLeft > scx) dx = scx - imgLeft;
    if (imgBot < scy) dy = scy - imgBot;
    else if (imgTop > scy) dy = scy - imgTop;
    t.x += dx;
    t.y += dy;
  }

  // Mapbox-style: dirty flag checked every frame by pixi ticker
  const tileDirtyRef = useRef(false);
  function scheduleRenderTiles() {
    tileDirtyRef.current = true;
  }

  // Set mainContainer position with canvas overscan offset
  function syncContainerPosition(mc: PIXI.Container, t: { x: number; y: number }) {
    const pad = canvasPadRef.current;
    mc.position.set(t.x + pad.left, t.y + pad.top);
  }

  function applyTransform(newScale: number, newRotation: number, pivotX: number, pivotY: number) {
    const t = transformRef.current;
    const { width: cw, height: ch } = canvasDimsRef.current;
    // Minimum zoom: image must fill canvas (no smaller than fit)
    const minFitScale = Math.max(cw / imgWidth, ch / imgHeight) * 0.6;
    const clamped = Math.max(minFitScale, Math.min(MAX_ZOOM, newScale));
    // Convert pivot from screen to world using current transform
    const cos0 = Math.cos(t.rotation);
    const sin0 = Math.sin(t.rotation);
    const dx0 = pivotX - t.x;
    const dy0 = pivotY - t.y;
    const wx = (dx0 * cos0 + dy0 * sin0) / t.scale;
    const wy = (-dx0 * sin0 + dy0 * cos0) / t.scale;
    // Recompute position so pivot stays fixed after new scale+rotation
    const cos1 = Math.cos(newRotation);
    const sin1 = Math.sin(newRotation);
    t.x = pivotX - clamped * (wx * cos1 - wy * sin1);
    t.y = pivotY - clamped * (wx * sin1 + wy * cos1);
    t.scale = clamped;
    // Clamp position so image always covers canvas
    clampPosition(t);
    t.rotation = newRotation;
    const mc = mainContainerRef.current;
    if (mc) {
      syncContainerPosition(mc, t);
      mc.scale.set(clamped);
      mc.rotation = newRotation;
    }
    onZoomChangeRef.current?.(clamped);
    scheduleRenderTiles();
    scheduleMarkerUpdate();
    onTransformChange?.({ ...transformRef.current });
  }

  function applyZoom(newScale: number, pivotX: number, pivotY: number) {
    applyTransform(newScale, transformRef.current.rotation, pivotX, pivotY);
  }

  const animZoomRafRef = useRef<number>(0);
  function animateZoom(targetScale: number, pivotX: number, pivotY: number, durationMs = 300) {
    if (animZoomRafRef.current) cancelAnimationFrame(animZoomRafRef.current);
    const startScale = transformRef.current.scale;
    const startTime = performance.now();
    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      // ease-out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const currentScale = startScale + (targetScale - startScale) * ease;
      applyZoom(currentScale, pivotX, pivotY);
      if (progress < 1) {
        animZoomRafRef.current = requestAnimationFrame(step);
      } else {
        animZoomRafRef.current = 0;
        // Force tile re-render at final zoom level
        tileDirtyRef.current = true;
      }
    }
    animZoomRafRef.current = requestAnimationFrame(step);
  }

  function applyTilt(tilt: number) {
    const clamped = Math.max(MIN_TILT, Math.min(MAX_TILT, tilt));
    transformRef.current.tilt = clamped;
    const canvas = canvasRef.current;
    if (clamped === 0) {
      if (canvas) { canvas.style.transform = ''; canvas.style.transformOrigin = ''; }
    } else {
      const rad = (clamped * Math.PI) / 180;
      const scaleX = 1 / Math.cos(rad);
      const tf = `perspective(800px) rotateX(${clamped}deg) scaleX(${scaleX.toFixed(4)})`;
      // Origin at visible area center, 30% from top — in oversized canvas coords
      const pad = canvasPadRef.current;
      const { width: vw, height: vh } = canvasDimsRef.current;
      const totalW = vw + pad.left * 2;
      const totalH = vh + pad.top;
      const originXPct = totalW > 0 ? ((pad.left + vw / 2) / totalW * 100).toFixed(2) : '50';
      const originYPct = totalH > 0 ? ((pad.top + vh * 0.3) / totalH * 100).toFixed(2) : '30';
      const origin = `${originXPct}% ${originYPct}%`;
      if (canvas) { canvas.style.transform = tf; canvas.style.transformOrigin = origin; }
    }
    // 마커 오버레이에는 tilt 적용하지 않음 — 마커는 항상 정면 고정
    scheduleRenderTiles();
    scheduleMarkerUpdate();
    onTransformChange?.({ ...transformRef.current });
  }

  // #6: Inertia scrolling
  function stopInertia() {
    if (inertiaRafRef.current) {
      cancelAnimationFrame(inertiaRafRef.current);
      inertiaRafRef.current = 0;
    }
  }

  function startInertia(vx: number, vy: number) {
    stopInertia();
    velocityRef.current = { vx, vy };
    function step() {
      const v = velocityRef.current;
      if (Math.abs(v.vx) < 0.5 && Math.abs(v.vy) < 0.5) {
        inertiaRafRef.current = 0;
        return;
      }
      const t = transformRef.current;
      t.x += v.vx;
      t.y += v.vy;
      clampPosition(t);
      const mc = mainContainerRef.current;
      if (mc) syncContainerPosition(mc, t);
      scheduleRenderTiles();
      scheduleMarkerUpdate();
      v.vx *= 0.85;
      v.vy *= 0.85;
      inertiaRafRef.current = requestAnimationFrame(step);
    }
    inertiaRafRef.current = requestAnimationFrame(step);
  }

  function getBoothOpacity(booth: Booth): number {
    if (activeCategories.size === 0) return 1;
    if (booth.category_id && activeCategories.has(booth.category_id)) return 1;
    return 0.2;
  }

  function getBoothFill(booth: Booth): string {
    if (booth.color) return booth.color;
    if (booth.category_id && categoryColorMap[booth.category_id]) return categoryColorMap[booth.category_id];
    return '#94a3b8';
  }

  // ===== Initialize PIXI Application =====
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const w = el.offsetWidth || 800;
    const h = el.offsetHeight || 600;
    canvasDimsRef.current = { width: w, height: h };

    // Moderate overscan: 20% padding (area ×1.68 vs previous 3.5x)
    const CANVAS_PAD = 0.2;
    const cw = Math.round(w * (1 + CANVAS_PAD * 2));
    const ch = Math.round(h * (1 + CANVAS_PAD));
    const padLeft = Math.round(w * CANVAS_PAD);
    const padTop = Math.round(h * CANVAS_PAD);

    const app = new PIXI.Application({
      width: cw,
      height: ch,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    el.appendChild(app.view as HTMLCanvasElement);

    const canvas = app.view as HTMLCanvasElement;
    canvasRef.current = canvas;
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    canvas.style.overscrollBehavior = 'none';
    canvas.style.cursor = 'grab';
    canvas.style.position = 'absolute';
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    canvas.style.left = `${-padLeft}px`;
    canvas.style.top = `${-padTop}px`;
    canvasPadRef.current = { left: padLeft, top: padTop };

    // Main container (replaces pixi-viewport)
    const mainContainer = new PIXI.Container();
    app.stage.addChild(mainContainer);
    mainContainer.addChild(tileLayerRef.current);
    mainContainer.addChild(obstacleLayerRef.current);
    mainContainer.addChild(routeLayerRef.current);

    // Cluster shading layer — sits above tiles/obstacles/route, below facilities
    const clusterContainer = new PIXI.Container();
    const clusterGfx = new PIXI.Graphics();
    clusterContainer.addChild(clusterGfx);
    mainContainer.addChild(clusterContainer);
    clusterContainerRef.current = clusterContainer;
    clusterGfxRef.current = clusterGfx;

    // boothLayer removed — booths are now HTML DOM markers
    mainContainer.addChild(facilityLayerRef.current);
    mainContainer.addChild(overlayLayerRef.current);

    // 경로 레이어 — overlay 위에 올려야 보임
    const routeGfx = new PIXI.Graphics();
    mainContainer.addChild(routeGfx);
    routeGfxRef.current = routeGfx;
    mainContainerRef.current = mainContainer;

    // ===== Pointer events — extracted to useMapPointerEvents.ts =====
    const cleanupPointers = attachPointerEvents({
      canvas, el, mainContainer, transformRef, canvasDimsRef, mainContainerRef,
      velocityRef, inertiaRafRef, animZoomRafRef,
      boothsRef, visibleFacilitiesRef, currentFloorIdRef,
      onBoothClickRef, onMapClickRef, onLongPressRef,
      stopInertia, applyTransform, applyZoom, animateZoom, applyTilt,
      clampPosition, syncContainerPosition, scheduleRenderTiles, scheduleMarkerUpdate,
      startInertia, setFacilityTooltip,
    });

    pixiApp.current = app;
    setDimensions({ width: w, height: h });

    // ResizeObserver — resize canvas with overscan
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: rw, height: rh } = entry.contentRect;
        if (rw > 0 && rh > 0) {
          const newCw = Math.round(rw * (1 + CANVAS_PAD * 2));
          const newCh = Math.round(rh * (1 + CANVAS_PAD));
          const newPadLeft = Math.round(rw * CANVAS_PAD);
          const newPadTop = Math.round(rh * CANVAS_PAD);
          app.renderer.resize(newCw, newCh);
          canvasDimsRef.current = { width: rw, height: rh };
          canvasPadRef.current = { left: newPadLeft, top: newPadTop };
          const cv = canvasRef.current;
          if (cv) {
            cv.style.width = `${newCw}px`;
            cv.style.height = `${newCh}px`;
            cv.style.left = `${-newPadLeft}px`;
            cv.style.top = `${-newPadTop}px`;
          }
          const mc = mainContainerRef.current;
          if (mc) syncContainerPosition(mc, transformRef.current);
          setDimensions({ width: rw, height: rh });
        }
      }
    });
    ro.observe(el);

    // Mapbox-style render loop: check dirty flag every frame
    const tickerFn = () => {
      if (tileDirtyRef.current) {
        tileDirtyRef.current = false;
        renderTilesFnRef.current();
      }
    };
    app.ticker.add(tickerFn);

    return () => {
      cleanupPointers();
      app.ticker.remove(tickerFn);
      ro.disconnect();
      stopInertia();
      // 마커/배지 DOM 정리 (React가 overlay를 제거하기 전에)
      for (const [, el] of markerElementsRef.current) el?.remove?.();
      markerElementsRef.current.clear();
      for (const [, el] of facilityMarkerElementsRef.current) el?.remove?.();
      facilityMarkerElementsRef.current.clear();
      for (const [, el] of clusterBadgesRef.current) el?.remove?.();
      clusterBadgesRef.current.clear();
      clusterBadgeWorldRef.current.clear();

      try { app.destroy(true); } catch { /* DOM already removed by React */ }
      pixiApp.current = null;
      mainContainerRef.current = null;
      canvasRef.current = null;
      clusterGfxRef.current = null;
      clusterContainerRef.current = null;
      try { if (routeAnimGfxRef.current) { routeAnimGfxRef.current.destroy(); } } catch {}
      routeAnimGfxRef.current = null;
      routeAnimRef.current = null;
      try { if (boothFloorGfxRef.current) { boothFloorGfxRef.current.destroy(); } } catch {}
      boothFloorGfxRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Tile/Image rendering =====
  useEffect(() => {
    const mc = mainContainerRef.current;
    if (!mc || !currentImage) return;

    const layer = tileLayerRef.current;
    layer.removeChildren();
    const imageChanged = currentImage.id !== currentImageIdRef.current;
    if (imageChanged) {
      tileCacheRef.current.forEach((tex) => tex.destroy(true));
      tileCacheRef.current.clear();
      tileStateRef.current?.clear();
      currentImageIdRef.current = currentImage.id;
    }

    // Initial fit when image changes
    if (imageChanged) {
      if (initialTransform) {
        // 부모에서 전달받은 transform — scale/rotation/tilt만 복원, x/y는 재계산
        const { width: cw, height: ch } = canvasDimsRef.current;
        const minFitScale = Math.max(cw / imgWidth, ch / imgHeight);
        const restoreScale = Math.max(minFitScale, initialTransform.scale);
        transformRef.current = {
          scale: restoreScale,
          x: (cw - imgWidth * restoreScale) / 2,
          y: (ch - imgHeight * restoreScale) / 2,
          rotation: initialTransform.rotation,
          tilt: initialTransform.tilt,
        };
        clampPosition(transformRef.current);
        syncContainerPosition(mc, transformRef.current);
        mc.scale.set(restoreScale);
        mc.rotation = initialTransform.rotation;
        applyTilt(initialTransform.tilt);
      } else {
        const { width: cw, height: ch } = canvasDimsRef.current;
        const minFitScale = Math.max(cw / imgWidth, ch / imgHeight);
        const fitScale = Math.max(minFitScale, Math.min(cw / imgWidth, ch / imgHeight) * 0.9);
        transformRef.current = {
          scale: fitScale,
          x: (cw - imgWidth * fitScale) / 2,
          y: (ch - imgHeight * fitScale) / 2,
          rotation: 0,
          tilt: 0,
        };
        clampPosition(transformRef.current);
        syncContainerPosition(mc, transformRef.current);
        mc.scale.set(fitScale);
        mc.rotation = 0;
        applyTilt(0);
      }
      onZoomChangeRef.current?.(transformRef.current.scale);
    }

    if (useTileMode && tileInfo) {
      // Initialize TileStateManager if needed
      if (!tileStateRef.current) {
        tileStateRef.current = new TileStateManager(
          layer, tileCacheRef.current, apiBase, tileDirtyRef,
        );
      }

      const doRender = () => {
        try { _doRenderTiles(); } catch (e) { console.error('[doRender tiles] error:', e); }
      };
      const _doRenderTiles = () => {
        if (!tileInfo || !currentImage || !tileStateRef.current) return;
        const { x: tx, y: ty, scale: sc, rotation: rot } = transformRef.current;
        const { width: canvasW, height: canvasH } = canvasDimsRef.current;

        const levelIdx = selectTileLevel(sc, tileInfo);
        const level = tileInfo.levels[levelIdx];
        if (!level) return;
        const tileSize = tileInfo.tile_size;
        const sfx = imgWidth / level.width;
        const sfy = imgHeight / level.height;

        // Rotation-aware viewport bounds in world space
        const cosR = Math.cos(rot);
        const sinR = Math.sin(rot);
        const scrCorners = [[0, 0], [canvasW, 0], [canvasW, canvasH], [0, canvasH]];
        const wCorners = scrCorners.map(([sx, sy]) => ({
          x: ((sx - tx) * cosR + (sy - ty) * sinR) / sc,
          y: (-(sx - tx) * sinR + (sy - ty) * cosR) / sc,
        }));
        const boundsX = Math.min(wCorners[0].x, wCorners[1].x, wCorners[2].x, wCorners[3].x);
        const boundsY = Math.min(wCorners[0].y, wCorners[1].y, wCorners[2].y, wCorners[3].y);
        const boundsW = Math.max(wCorners[0].x, wCorners[1].x, wCorners[2].x, wCorners[3].x) - boundsX;
        const boundsH = Math.max(wCorners[0].y, wCorners[1].y, wCorners[2].y, wCorners[3].y) - boundsY;

        const colStart = Math.max(0, Math.floor((boundsX / sfx) / tileSize) - prefetchRange);
        const colEnd = Math.min(level.cols - 1, Math.ceil(((boundsX + boundsW) / sfx) / tileSize) + prefetchRange);
        const rowStart = Math.max(0, Math.floor((boundsY / sfy) / tileSize) - prefetchRange);
        const rowEnd = Math.min(level.rows - 1, Math.ceil(((boundsY + boundsH) / sfy) / tileSize) + prefetchRange);

        const levelChanged = levelIdx !== currentTileLevelRef.current;
        if (levelChanged) {
          currentTileLevelRef.current = levelIdx;
          tileStateRef.current.clearLevel(levelIdx);
        }

        // Delegate all tile management to TileStateManager
        tileStateRef.current.update(
          currentImage.id, levelIdx,
          tileSize, sfx, sfy,
          level.width, level.height,
          colStart, colEnd, rowStart, rowEnd,
          currentTileLevelRef,
        );
      };

      renderTilesFnRef.current = doRender;
      doRender();
    } else {
      renderTilesFnRef.current = () => {};
      // Single image fallback
      const zoomLevels = parseZoomLevels(currentImage);
      let imageUrl: string;
      if (zoomLevels.length > 0) {
        const sc = transformRef.current.scale;
        const scaleRange = MAX_ZOOM - MIN_ZOOM;
        const normalized = Math.max(0, Math.min(1, (sc - MIN_ZOOM) / scaleRange));
        const targetLevel = Math.min(zoomLevels.length - 1, Math.floor(normalized * zoomLevels.length));
        imageUrl = zoomLevels[targetLevel].path;
      } else {
        imageUrl = currentImage.medium_path;
      }
      imageUrl = resolveImageUrl(imageUrl);

      const tex = PIXI.Texture.from(imageUrl, { resourceOptions: { crossorigin: 'anonymous' } });
      const sprite = new PIXI.Sprite(tex);
      sprite.width = imgWidth;
      sprite.height = imgHeight;
      layer.addChild(sprite);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentImage, tileInfo, useTileMode, imgWidth, imgHeight, prefetchRange]);



  // ===== Obstacles =====
  useEffect(() => {
    const layer = obstacleLayerRef.current;
    layer.removeChildren();
    const sc = transformRef.current.scale;

    for (const obs of obstacles) {
      const g = new PIXI.Graphics();
      if (obs.shape === 'circle' && obs.radius) {
        g.lineStyle(1 / sc, 0x6b7280);
        g.beginFill(0x9ca3af, 0.5);
        g.drawCircle(obs.x, obs.y, obs.radius);
        g.endFill();
      } else {
        g.lineStyle(1 / sc, 0x6b7280);
        g.beginFill(0x9ca3af, 0.5);
        g.drawRoundedRect(obs.x, obs.y, obs.width || 40, obs.height || 40, 2 / sc);
        g.endFill();
      }
      layer.addChild(g);
    }
  }, [obstacles]);

  // ===== 부스 바닥 (불투명 흰색, 테두리 없음) =====
  const boothFloorGfxRef = useRef<PIXI.Graphics | null>(null);
  useEffect(() => {
    const mc = mainContainerRef.current;
    if (!mc) return;
    let gfx = boothFloorGfxRef.current;
    if (!gfx || !gfx.parent) {
      if (gfx) gfx.destroy();
      gfx = new PIXI.Graphics();
      boothFloorGfxRef.current = gfx;
      // mainContainer에 추가 — tileLayer 바로 위 (이미지 위, 음영 아래)
      const tileIdx = mc.children.indexOf(tileLayerRef.current);
      mc.addChildAt(gfx, tileIdx >= 0 ? tileIdx + 1 : 0);
    }
    gfx.clear();
    for (const b of booths) {
      if (!b.is_active) continue;
      gfx.beginFill(0xffffff, 1);
      if (b.shape === 'polygon' && b.points) {
        const pts: { x: number; y: number }[] = typeof b.points === 'string' ? JSON.parse(b.points) : b.points;
        if (pts.length > 0) {
          gfx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) gfx.lineTo(pts[i].x, pts[i].y);
          gfx.closePath();
        }
      } else if (b.shape === 'circle' && b.radius) {
        const { cx, cy } = getBoothCenter(b);
        gfx.drawCircle(cx, cy, b.radius);
      } else {
        gfx.drawRect(b.x, b.y, b.width, b.height);
      }
      gfx.endFill();
    }
    gfx.visible = showBooths;
  }, [booths, showBooths]);

  // ===== Route =====
  useEffect(() => {
    const layer = routeLayerRef.current;
    layer.removeChildren();
    if (!currentRoutePoints || currentRoutePoints.length < 2) return;
    const sc = transformRef.current.scale;

    // Shadow line
    const shadow = new PIXI.Graphics();
    shadow.lineStyle(5 / sc, 0x1e1b4b, 0.15);
    shadow.moveTo(currentRoutePoints[0].x, currentRoutePoints[0].y);
    for (let i = 1; i < currentRoutePoints.length; i++) {
      shadow.lineTo(currentRoutePoints[i].x, currentRoutePoints[i].y);
    }
    layer.addChild(shadow);

    // Main line
    const mainLine = new PIXI.Graphics();
    mainLine.lineStyle(3 / sc, 0x4f46e5, 0.85);
    mainLine.moveTo(currentRoutePoints[0].x, currentRoutePoints[0].y);
    for (let i = 1; i < currentRoutePoints.length; i++) {
      mainLine.lineTo(currentRoutePoints[i].x, currentRoutePoints[i].y);
    }
    layer.addChild(mainLine);

    // Transition markers
    for (const m of routeTransitionMarkers) {
      const r = Math.max(10, 14 / sc);
      const color = m.type === 'start' ? 0x22c55e : m.type === 'end' ? 0xef4444 : 0xf59e0b;
      const g = new PIXI.Graphics();
      g.lineStyle(2 / sc, 0xffffff);
      g.beginFill(color, 0.95);
      g.drawCircle(0, 0, r);
      g.endFill();
      g.x = m.x;
      g.y = m.y;
      layer.addChild(g);

      const text = new PIXI.Text(m.label, {
        fontSize: Math.max(7, 9 / sc),
        fontFamily: 'Inter, sans-serif',
        fontWeight: 'bold',
        fill: 'white',
        align: 'center',
      });
      text.anchor.set(0.5, 0.5);
      text.x = m.x;
      text.y = m.y;
      layer.addChild(text);
    }

    // Route facility markers
    for (const fac of routeFacilityMarkers) {
      const r = Math.max(12, 16 / sc);
      const label = fac.type === 'stairs' ? 'S' : fac.type === 'elevator' ? 'EV' : fac.type === 'escalator' ? 'ES' : '?';
      const g = new PIXI.Graphics();
      g.lineStyle(2 / sc, 0xffffff);
      g.beginFill(0xf97316, 0.9);
      g.drawCircle(0, 0, r);
      g.endFill();
      g.x = fac.x;
      g.y = fac.y;
      layer.addChild(g);

      const text = new PIXI.Text(label, {
        fontSize: Math.max(6, 8 / sc),
        fontFamily: 'Inter, sans-serif',
        fontWeight: 'bold',
        fill: 'white',
        align: 'center',
      });
      text.anchor.set(0.5, 0.5);
      text.x = fac.x;
      text.y = fac.y;
      layer.addChild(text);
    }
  }, [currentRoutePoints, routeTransitionMarkers, routeFacilityMarkers]);

  // ===== Client Route (A* pathfinding result) — 프로그레스바 애니메이션 =====
  const routeAnimGfxRef = useRef<PIXI.Graphics | null>(null);
  const routeAnimRef = useRef<{ path: { x: number; y: number }[]; totalLen: number; segLens: number[]; phase: number } | null>(null);

  useEffect(() => {
    const gfx = routeGfxRef.current;
    if (!gfx) return;
    gfx.clear();
    routeAnimRef.current = null;

    if (!clientRoute || clientRoute.path.length < 2) return;
    const path = clientRoute.path;
    const startExt = clientRoute.startExtIdx ?? -1; // path[0]~path[startExt] 점선
    const endExt = clientRoute.endExtIdx ?? path.length; // path[endExt]~끝 점선

    // 실선 구간
    const solidStart = startExt >= 0 ? startExt : 0;
    const solidEnd = endExt < path.length ? endExt : path.length - 1;
    gfx.lineStyle(28, 0xe53e3e, 0.85);
    gfx.moveTo(path[solidStart].x, path[solidStart].y);
    for (let i = solidStart + 1; i <= solidEnd; i++) gfx.lineTo(path[i].x, path[i].y);

    // 점선 헬퍼: 두 점 사이를 점선으로
    const drawDashed = (ax: number, ay: number, bx: number, by: number, dashLen: number, gapLen: number) => {
      const dx = bx - ax, dy = by - ay;
      const totalLen = Math.sqrt(dx * dx + dy * dy);
      if (totalLen < 1) return;
      const ux = dx / totalLen, uy = dy / totalLen;
      let drawn = 0;
      while (drawn < totalLen) {
        const segEnd = Math.min(drawn + dashLen, totalLen);
        gfx.moveTo(ax + ux * drawn, ay + uy * drawn);
        gfx.lineTo(ax + ux * segEnd, ay + uy * segEnd);
        drawn = segEnd + gapLen;
      }
    };

    // 출발 점선 구간
    if (startExt >= 0) {
      gfx.lineStyle(20, 0xe53e3e, 0.5);
      for (let i = 0; i < startExt; i++) {
        drawDashed(path[i].x, path[i].y, path[i + 1].x, path[i + 1].y, 30, 20);
      }
    }
    // 도착 점선 구간
    if (endExt < path.length - 1) {
      gfx.lineStyle(20, 0xe53e3e, 0.5);
      for (let i = endExt; i < path.length - 1; i++) {
        drawDashed(path[i].x, path[i].y, path[i + 1].x, path[i + 1].y, 30, 20);
      }
    }

    // 애니메이션 데이터 준비 (실선 구간만)
    const solidStartIdx = startExt >= 0 ? startExt : 0;
    const solidEndIdx = endExt < path.length ? endExt : path.length - 1;
    const solidPath = path.slice(solidStartIdx, solidEndIdx + 1);
    const segLens: number[] = [0];
    let total = 0;
    for (let i = 1; i < solidPath.length; i++) {
      const d = Math.hypot(solidPath[i].x - solidPath[i-1].x, solidPath[i].y - solidPath[i-1].y);
      total += d;
      segLens.push(total);
    }
    routeAnimRef.current = { path: solidPath, totalLen: total, segLens, phase: 0 };

    // 애니메이션 그래픽 생성
    if (!routeAnimGfxRef.current && gfx.parent) {
      const animGfx = new PIXI.Graphics();
      gfx.parent.addChild(animGfx);
      routeAnimGfxRef.current = animGfx;
    }

    // 경로 그린 후 즉시 렌더 트리거
    renderTilesFnRef.current();
  }, [clientRoute]);

  // Ticker로 프로그레스바 애니메이션 (여러 개, 천천히)
  useEffect(() => {
    const app = pixiApp.current;
    if (!app) return;

    const BAR_PIXELS = 300;    // 각 바 길이 (픽셀)
    const BAR_GAP = 200;       // 바 사이 빈 간격 (픽셀)
    const PX_PER_SEC = 150;    // 이동 속도 (픽셀/초)

    // 경로 위 특정 거리의 (x,y) 좌표 (modular — 계속 순환)
    function pointAtDist(path: { x: number; y: number }[], d: number, totalLen: number): { x: number; y: number } {
      const dd = ((d % totalLen) + totalLen) % totalLen;
      let traveled = 0;
      for (let i = 1; i < path.length; i++) {
        const dx = path[i].x - path[i-1].x, dy = path[i].y - path[i-1].y;
        const segLen = Math.hypot(dx, dy);
        if (traveled + segLen >= dd) {
          const t = segLen > 0 ? (dd - traveled) / segLen : 0;
          return { x: path[i-1].x + dx * t, y: path[i-1].y + dy * t };
        }
        traveled += segLen;
      }
      return path[path.length - 1];
    }

    let elapsed = 0;

    const ticker = (dt: number) => {
      const animGfx = routeAnimGfxRef.current;
      const anim = routeAnimRef.current;
      if (!animGfx || !anim) { if (animGfx) animGfx.clear(); return; }

      const { path, totalLen } = anim;
      // dt는 프레임 단위(~1), 60fps 기준으로 초 변환
      elapsed += (dt / 60) * PX_PER_SEC;
      const offset = elapsed % totalLen;
      animGfx.clear();

      // 바+간격 패턴 길이 기반 개수
      const patternLen = BAR_PIXELS + BAR_GAP;
      const numBars = Math.max(1, Math.ceil(totalLen / patternLen));

      for (let b = 0; b < numBars; b++) {
        const barStart = (offset + b * patternLen) % totalLen;

        const steps = 12;
        const stepLen = BAR_PIXELS / steps;
        for (let s = 0; s < steps; s++) {
          const d0 = barStart + s * stepLen;
          const d1 = barStart + (s + 1) * stepLen;
          // 같은 세그먼트 위에 있는지 확인 (경로 끝→시작 직선 방지)
          const p0 = pointAtDist(path, d0, totalLen);
          const p1 = pointAtDist(path, d1, totalLen);
          const directDist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
          if (directDist > stepLen * 3) continue; // 끝→시작 점프 스킵
          const alpha = 0.3 + 0.6 * (s / steps);
          animGfx.lineStyle(20, 0xfca5a5, alpha);
          animGfx.moveTo(p0.x, p0.y);
          animGfx.lineTo(p1.x, p1.y);
        }
      }
    };
    app.ticker.add(ticker);
    return () => { try { app.ticker.remove(ticker); } catch {} };
  }, []);

  // ===== Booths (HTML DOM markers — Mapbox style) =====

  // 클러스터 내 부스들이 모두 같은 홀/구역에 속하고, 해당 홀/구역 전체가 화면에 보이면 홀/구역 이름 반환
  function getClusterHallName(boothIds: number[]): string | null {
    if (boothIds.length === 0) return null;
    const { width: cvW, height: cvH } = canvasDimsRef.current;
    const halls = hallsRef.current;
    if (halls.length === 0) return null;

    // 부스 중심 좌표가 포함된 모든 홀/구역 수집
    function findBoothHalls(booth: Booth): Hall[] {
      const { cx, cy } = getBoothCenter(booth);
      const result: Hall[] = [];
      for (const h of halls) {
        if (h.area_x == null || h.area_y == null || h.area_width == null || h.area_height == null) continue;
        if (cx >= h.area_x && cx <= h.area_x + h.area_width && cy >= h.area_y && cy <= h.area_y + h.area_height) {
          result.push(h);
        }
      }
      return result;
    }

    // 모든 부스가 공통으로 속한 홀/구역 찾기 (가장 작은 공통 영역 우선)
    let commonHalls: Set<number> | null = null;
    for (const bid of boothIds) {
      const booth = boothMapRef.current.get(bid);
      if (!booth) return null;
      const boothHalls = findBoothHalls(booth);
      if (boothHalls.length === 0) return null;
      const hallIdSet = new Set(boothHalls.map(h => h.id));
      if (commonHalls === null) commonHalls = hallIdSet;
      else {
        // 교집합
        for (const id of commonHalls) {
          if (!hallIdSet.has(id)) commonHalls.delete(id);
        }
      }
      if (commonHalls.size === 0) return null;
    }
    if (!commonHalls || commonHalls.size === 0) return null;
    // 공통 홀 중 가장 작은 영역 선택 (구역 > 홀)
    let commonHall: Hall | null = null;
    let smallestArea = Infinity;
    for (const hid of commonHalls) {
      const h = halls.find(hh => hh.id === hid);
      if (h && h.area_width != null && h.area_height != null) {
        const area = h.area_width * h.area_height;
        if (area < smallestArea) { smallestArea = area; commonHall = h; }
      }
    }
    if (!commonHall || commonHall.area_x == null || commonHall.area_y == null || commonHall.area_width == null || commonHall.area_height == null) return null;

    // 홀 전체가 화면에 보이는지 확인
    const tl = worldToScreen(commonHall.area_x, commonHall.area_y);
    const tr = worldToScreen(commonHall.area_x + commonHall.area_width, commonHall.area_y);
    const bl = worldToScreen(commonHall.area_x, commonHall.area_y + commonHall.area_height);
    const br = worldToScreen(commonHall.area_x + commonHall.area_width, commonHall.area_y + commonHall.area_height);
    const allX = [tl.sx, tr.sx, bl.sx, br.sx];
    const allY = [tl.sy, tr.sy, bl.sy, br.sy];
    const minSx = Math.min(...allX), maxSx = Math.max(...allX);
    const minSy = Math.min(...allY), maxSy = Math.max(...allY);
    const margin = -20;
    if (minSx < margin || maxSx > cvW - margin || minSy < margin || maxSy > cvH - margin) return null;

    const name = commonHall.display_name || (typeof commonHall.name === 'string' ? commonHall.name : (commonHall.name ? Object.values(commonHall.name)[0] : null));
    return name || null;
  }

  // recalcMarkers: called after interaction settles (debounced ~300ms)
  // Clusters visible booths → PIXI shading + DOM pin markers with optional count badge
  function recalcMarkers() {
    try { _recalcMarkersInner(); } catch (e) { console.error('[recalcMarkers] error:', e); }
  }
  function _recalcMarkersInner() {
    const markers = markerElementsRef.current;
    const { scale: sc, x: tx, y: ty, rotation: rot } = transformRef.current;
    const { width: cw, height: ch } = canvasDimsRef.current;
    const show = showBoothsRef.current;
    const clusterGfx = clusterGfxRef.current;

    // Viewport bounds in world space (rotation-aware)
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const scrCorners = [[0, 0], [cw, 0], [cw, ch], [0, ch]];
    const wCorners = scrCorners.map(([sx, sy]) => ({
      x: ((sx - tx) * cosR + (sy - ty) * sinR) / sc,
      y: (-(sx - tx) * sinR + (sy - ty) * cosR) / sc,
    }));
    const bx0 = Math.min(wCorners[0].x, wCorners[1].x, wCorners[2].x, wCorners[3].x);
    const by0 = Math.min(wCorners[0].y, wCorners[1].y, wCorners[2].y, wCorners[3].y);
    const bx1 = Math.max(wCorners[0].x, wCorners[1].x, wCorners[2].x, wCorners[3].x);
    const by1 = Math.max(wCorners[0].y, wCorners[1].y, wCorners[2].y, wCorners[3].y);

    const visibleBooths: Booth[] = [];
    for (const booth of boothsRef.current) {
      const { cx, cy } = getBoothCenter(booth);
      
      if (show && cx >= bx0 && cx <= bx1 && cy >= by0 && cy <= by1) {
        visibleBooths.push(booth);
      }
    }

    // 경로 코너(꺾이는 점) 추출 — 클러스터 대표 선택에 사용
    // routePath(서버 경로) 또는 clientRoute(A* 경로) 둘 다 참조
    const rpServer = routePathRef.current;
    const rpClient = clientRouteRef.current?.path;
    const rp = rpServer || rpClient || null;
    let routeCorners: { x: number; y: number }[] | null = null;
    if (rp && rp.length >= 2) {
      routeCorners = [rp[0]]; // 시작점
      const ANGLE_THRESH = 15 * Math.PI / 180;
      for (let i = 1; i < rp.length - 1; i++) {
        const dx1 = rp[i].x - rp[i - 1].x, dy1 = rp[i].y - rp[i - 1].y;
        const dx2 = rp[i + 1].x - rp[i].x, dy2 = rp[i + 1].y - rp[i].y;
        const a1 = Math.atan2(dy1, dx1), a2 = Math.atan2(dy2, dx2);
        let diff = Math.abs(a2 - a1);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff >= ANGLE_THRESH) routeCorners.push(rp[i]);
      }
      routeCorners.push(rp[rp.length - 1]); // 끝점
    }

    // 부스 → 경로/코너 최소 거리 계산
    function boothRouteScore(boothId: number): number {
      if (!rp || rp.length < 2) return Infinity;
      const booth = boothMapRef.current.get(boothId);
      if (!booth) return Infinity;
      const { cx, cy } = getBoothCenter(booth);
      let minDist = Infinity;
      // 코너 거리
      if (routeCorners) {
        for (const c of routeCorners) {
          const d = Math.sqrt((cx - c.x) ** 2 + (cy - c.y) ** 2);
          if (d < minDist) minDist = d;
        }
      }
      // 경로 선분 거리 (직선 구간도 고려)
      for (let i = 0; i < rp.length - 1; i++) {
        const ax = rp[i].x, ay = rp[i].y;
        const bx = rp[i + 1].x, by = rp[i + 1].y;
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        let t = len2 > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const d = Math.sqrt((cx - (ax + t * dx)) ** 2 + (cy - (ay + t * dy)) ** 2);
        if (d < minDist) minDist = d;
      }
      return minDist;
    }

    // Supercluster 기반 줌 레벨별 클러스터링 (전체 visible 부스)
    const clusters = clusterBooths(visibleBooths, worldToScreen, 0, sc, boothsRef.current, markerFontSizeRef.current);

    // Draw PIXI shading: 홀/구역 음영 + 클러스터 음영
    if (clusterGfx) {
      clusterGfx.clear();

      // 클러스터 음영 + 불투명 점선 테두리
      for (const c of clusters) {
        if (c.isCluster && c.count > 1) {
          const pad = 20;
          const x = c.bboxX - pad, y = c.bboxY - pad;
          const w = c.bboxW + pad * 2, h = c.bboxH + pad * 2;
          const r = 12;
          // 배경 음영
          clusterGfx.lineStyle(0);
          clusterGfx.beginFill(0x4f46e5, 0.08);
          clusterGfx.drawRoundedRect(x, y, w, h, r);
          clusterGfx.endFill();
          // 불투명 점선 테두리
          const dash = 15, gap = 10;
          clusterGfx.lineStyle(3, 0x4f46e5, 0.7);
          // 둥근 사각형 경로를 점선으로 그리기
          const pts: { x: number; y: number }[] = [];
          // top: left+r → right-r
          for (let px = x + r; px <= x + w - r; px += 1) pts.push({ x: px, y });
          // top-right arc
          for (let a = -Math.PI / 2; a <= 0; a += 0.1) pts.push({ x: x + w - r + Math.cos(a) * r, y: y + r + Math.sin(a) * r });
          // right: top+r → bottom-r
          for (let py = y + r; py <= y + h - r; py += 1) pts.push({ x: x + w, y: py });
          // bottom-right arc
          for (let a = 0; a <= Math.PI / 2; a += 0.1) pts.push({ x: x + w - r + Math.cos(a) * r, y: y + h - r + Math.sin(a) * r });
          // bottom: right-r → left+r
          for (let px = x + w - r; px >= x + r; px -= 1) pts.push({ x: px, y: y + h });
          // bottom-left arc
          for (let a = Math.PI / 2; a <= Math.PI; a += 0.1) pts.push({ x: x + r + Math.cos(a) * r, y: y + h - r + Math.sin(a) * r });
          // left: bottom-r → top+r
          for (let py = y + h - r; py >= y + r; py -= 1) pts.push({ x, y: py });
          // top-left arc
          for (let a = Math.PI; a <= Math.PI * 1.5; a += 0.1) pts.push({ x: x + r + Math.cos(a) * r, y: y + r + Math.sin(a) * r });
          // 점선 렌더
          let dist = 0;
          let drawing = true;
          let segDist = 0;
          for (let i = 0; i < pts.length; i++) {
            if (i === 0) { clusterGfx.moveTo(pts[0].x, pts[0].y); continue; }
            const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
            const d = Math.hypot(dx, dy);
            dist += d;
            segDist += d;
            const limit = drawing ? dash : gap;
            if (segDist >= limit) {
              segDist = 0;
              drawing = !drawing;
            }
            if (drawing) clusterGfx.lineTo(pts[i].x, pts[i].y);
            else clusterGfx.moveTo(pts[i].x, pts[i].y);
          }
        }
      }
    }

    // 클러스터 영역 중앙에 DOM 배지 계산 (screen 좌표)
    // clusterId → { sx, sy, count }
    const clusterCenters = new Map<string, { sx: number; sy: number; count: number }>();
    for (const c of clusters) {
      if (c.isCluster && c.count > 1) {
        const wcx = c.bboxX + c.bboxW / 2;
        const wcy = c.bboxY + c.bboxH / 2;
        const sp = worldToScreen(wcx, wcy);
        clusterCenters.set(c.id, { sx: sp.sx, sy: sp.sy, count: c.count });
      }
    }

    // 출발/도착 부스(또는 가장 가까운 부스)는 항상 개별 표시
    const pinBoothIds = new Set<number>();
    const sp = navStartPointRef.current;
    const ep = navEndPointRef.current;
    const findNearest = (wx: number, wy: number): number | null => {
      let bestId: number | null = null, bestDist = Infinity;
      for (const b of boothsRef.current) {
        const { cx, cy } = getBoothCenter(b);
        const d = (cx - wx) ** 2 + (cy - wy) ** 2;
        if (d < bestDist) { bestDist = d; bestId = b.id; }
      }
      return bestId;
    };
    if (sp) {
      const id = sp.boothId || findNearest(sp.x, sp.y);
      if (id) pinBoothIds.add(id);
    }
    if (ep) {
      const id = ep.boothId || findNearest(ep.x, ep.y);
      if (id) pinBoothIds.add(id);
    }

    // Determine which booth IDs to show as pins + cluster badge info
    const newIds = new Set<number>(pinBoothIds);
    // clusterKey → { boothId, count }
    const clusterReps = new Map<string, { boothId: number; count: number; name?: string }>();

    // 클러스터별 중심 좌표 + 경로까지 거리 사전 계산
    const clusterCenterMap = new Map<string, { cx: number; cy: number; routeDist: number }>();
    for (const c of clusters) {
      if (c.isCluster && c.count > 1) {
        const cx = c.bboxX + c.bboxW / 2;
        const cy = c.bboxY + c.bboxH / 2;
        let routeDist = Infinity;
        if (rp && rp.length >= 2) {
          for (let i = 0; i < rp.length - 1; i++) {
            const ax = rp[i].x, ay = rp[i].y, bx = rp[i+1].x, by = rp[i+1].y;
            const dx = bx - ax, dy = by - ay, len2 = dx*dx + dy*dy;
            let t = len2 > 0 ? ((cx-ax)*dx + (cy-ay)*dy) / len2 : 0;
            t = Math.max(0, Math.min(1, t));
            const d = Math.sqrt((cx-(ax+t*dx))**2 + (cy-(ay+t*dy))**2);
            if (d < routeDist) routeDist = d;
          }
        }
        clusterCenterMap.set(c.id, { cx, cy, routeDist });
      }
    }

    // 클러스터가 경로 쪽으로 "가려지지 않는지" 판별
    // 경로→클러스터 직선 사이에 더 가까운 다른 클러스터가 없으면 true
    function isClusterVisibleToRoute(clusterId: string): boolean {
      const self = clusterCenterMap.get(clusterId);
      if (!self || self.routeDist === Infinity) return false;
      // 경로에서 자기 클러스터 방향으로 더 가까이 있는 클러스터가 있는지 체크
      for (const [otherId, other] of clusterCenterMap) {
        if (otherId === clusterId) continue;
        if (other.routeDist >= self.routeDist) continue; // 더 멀면 무시
        // 경로→self 직선 근처에 other가 있는지 (간단한 각도 체크)
        // self와 other의 거리가 self의 routeDist보다 작으면 가려질 수 있음
        const d = Math.sqrt((self.cx - other.cx)**2 + (self.cy - other.cy)**2);
        if (d < self.routeDist * 0.8) return false; // 사이에 있음
      }
      return true;
    }

    for (const c of clusters) {
      // 클러스터에서 출발/도착 부스 제외
      const filteredIds = c.boothIds.filter(id => !pinBoothIds.has(id));
      const effectiveCount = filteredIds.length;

      if (!c.isCluster || effectiveCount <= 1) {
        // Individual marker(s)
        for (const id of filteredIds) newIds.add(id);
      } else {
        const useRouteRep = routeCorners && isClusterVisibleToRoute(c.id);

        if (useRouteRep) {
          // 경로에서 보이는 클러스터: 코너 > 경로 > 현재위치 순 우선
          const ncp = navCurrentPosRef.current;
          let bestId = filteredIds[0];
          let bestCornerDist = Infinity;
          let bestRouteDist = Infinity;
          let bestNavDist = Infinity;
          for (const bid of filteredIds) {
            const booth = boothMapRef.current.get(bid);
            if (!booth) continue;
            const { cx, cy } = getBoothCenter(booth);
            // 코너까지 최소 거리
            let cornerDist = Infinity;
            if (routeCorners) {
              for (const corner of routeCorners) {
                const d = Math.sqrt((cx - corner.x)**2 + (cy - corner.y)**2);
                if (d < cornerDist) cornerDist = d;
              }
            }
            const rDist = boothRouteScore(bid);
            const navDist = ncp ? Math.sqrt((cx - ncp.x)**2 + (cy - ncp.y)**2) : Infinity;
            // 코너 우선 → 경로 거리 → 현재위치 거리
            const THRESH = 50;
            const betterCorner = cornerDist < bestCornerDist - THRESH;
            const sameCorner = Math.abs(cornerDist - bestCornerDist) <= THRESH;
            const betterRoute = rDist < bestRouteDist - THRESH;
            const sameRoute = Math.abs(rDist - bestRouteDist) <= THRESH;
            if (betterCorner || (sameCorner && betterRoute) || (sameCorner && sameRoute && navDist < bestNavDist)) {
              bestCornerDist = cornerDist;
              bestRouteDist = rDist;
              bestNavDist = navDist;
              bestId = bid;
            }
          }
          const bestBooth = boothMapRef.current.get(bestId);
          const name = bestBooth ? (getBoothDisplayName(bestBooth) || bestBooth.booth_number) : undefined;
          newIds.add(bestId);
          clusterReps.set(c.id, { boothId: bestId, count: effectiveCount, name });
        } else if (routeCorners) {
          // 가려진 클러스터: 경로 기준 → 현재위치 tiebreak
          const ncp2 = navCurrentPosRef.current;
          let bestId = filteredIds[0];
          let bestScore = Infinity;
          let bestNav = Infinity;
          for (const bid of filteredIds) {
            const score = boothRouteScore(bid);
            const booth = boothMapRef.current.get(bid);
            const navD = (ncp2 && booth) ? Math.sqrt((getBoothCenter(booth).cx - ncp2.x)**2 + (getBoothCenter(booth).cy - ncp2.y)**2) : Infinity;
            if (score < bestScore - 50 || (Math.abs(score - bestScore) <= 50 && navD < bestNav)) {
              bestScore = score; bestNav = navD; bestId = bid;
            }
          }
          const bestBooth = boothMapRef.current.get(bestId);
          const name = bestBooth ? (getBoothDisplayName(bestBooth) || bestBooth.booth_number) : undefined;
          newIds.add(bestId);
          clusterReps.set(c.id, { boothId: bestId, count: effectiveCount, name });
        } else {
          const rep = selectRepresentative(filteredIds, boothsRef.current, hallsRef.current);
          if (rep.booth) {
            newIds.add(rep.booth.id);
            clusterReps.set(c.id, { boothId: rep.booth.id, count: effectiveCount, name: rep.name });
          } else if (filteredIds.length > 0) {
            newIds.add(filteredIds[0]);
            clusterReps.set(c.id, { boothId: filteredIds[0], count: effectiveCount });
          }
        }
      }
    }

    // 대표 부스 → 클러스터 중앙 매핑
    const repCenters = new Map<number, { wx: number; wy: number }>();
    for (const c of clusters) {
      if (c.isCluster && c.count > 1) {
        const rep = clusterReps.get(c.id);
        if (rep) {
          repCenters.set(rep.boothId, { wx: c.bboxX + c.bboxW / 2, wy: c.bboxY + c.bboxH / 2 });
        }
      }
    }
    clusterRepCenterRef.current = repCenters;

    // 홀/구역별 클러스터 수 + 개별 부스 수 → 1개씩만 있을 때 홀 이름 표시
    const hallClusterCount = new Map<number, { count: number; repBoothId: number; hallName: string }>();
    const hallIndividualCount = new Map<number, number>();
    const hallsForCheck = hallsRef.current;
    const { width: cvW3, height: cvH3 } = canvasDimsRef.current;
    // 화면에 전체 보이는 홀만 대상
    const visibleHalls = new Set<number>();
    for (const h of hallsForCheck) {
      if (h.area_x == null || h.area_y == null || h.area_width == null || h.area_height == null) continue;
      const tl = worldToScreen(h.area_x, h.area_y);
      const tr = worldToScreen(h.area_x + h.area_width, h.area_y);
      const bl = worldToScreen(h.area_x, h.area_y + h.area_height);
      const br = worldToScreen(h.area_x + h.area_width, h.area_y + h.area_height);
      const xs = [tl.sx, tr.sx, bl.sx, br.sx], ys = [tl.sy, tr.sy, bl.sy, br.sy];
      const mn = -20;
      if (Math.min(...xs) >= mn && Math.max(...xs) <= cvW3 - mn && Math.min(...ys) >= mn && Math.max(...ys) <= cvH3 - mn) {
        visibleHalls.add(h.id);
      }
    }
    // 클러스터별 → 어느 홀에 속하는지 (좌표 기반)
    for (const [cid, rep] of clusterReps) {
      if (rep.count <= 1) continue;
      const booth = boothMapRef.current.get(rep.boothId);
      if (!booth) continue;
      const { cx, cy } = getBoothCenter(booth);
      for (const h of hallsForCheck) {
        if (!visibleHalls.has(h.id)) continue;
        if (h.area_x == null || h.area_y == null || h.area_width == null || h.area_height == null) continue;
        if (cx >= h.area_x && cx <= h.area_x + h.area_width && cy >= h.area_y && cy <= h.area_y + h.area_height) {
          const prev = hallClusterCount.get(h.id);
          const hn = h.display_name || (typeof h.name === 'string' ? h.name : (h.name ? Object.values(h.name)[0] : ''));
          if (!prev) hallClusterCount.set(h.id, { count: 1, repBoothId: rep.boothId, hallName: hn });
          else hallClusterCount.set(h.id, { count: prev.count + 1, repBoothId: prev.repBoothId, hallName: hn });
          break; // 가장 먼저 매칭된 홀
        }
      }
    }
    // 개별 부스(클러스터 아닌)도 같은 홀 안에 있는지 체크
    for (const c of clusters) {
      if (c.isCluster && c.count > 1) continue;
      for (const boothId of c.boothIds) {
        if (!newIds.has(boothId)) continue;
        const b = boothMapRef.current.get(boothId);
        if (!b) continue;
        const { cx, cy } = getBoothCenter(b);
        for (const h of hallsForCheck) {
          if (!visibleHalls.has(h.id)) continue;
          if (h.area_x == null || h.area_y == null || h.area_width == null || h.area_height == null) continue;
          if (cx >= h.area_x && cx <= h.area_x + h.area_width && cy >= h.area_y && cy <= h.area_y + h.area_height) {
            hallIndividualCount.set(h.id, (hallIndividualCount.get(h.id) || 0) + 1);
            break;
          }
        }
      }
    }
    // 클러스터 딱 1개 + 개별 부스 0개인 홀만 이름 표시
    const nameMap = new Map<number, string>();
    for (const [hallId, info] of hallClusterCount) {
      const individualCnt = hallIndividualCount.get(hallId) || 0;
      if (info.count === 1 && individualCnt === 0) {
        nameMap.set(info.repBoothId, info.hallName);
      }
    }
    clusterNameMapRef.current = nameMap;

    const oldIds = stableIdsRef.current;

    // 사라지는 마커를 가장 가까운 클러스터 중심으로 찾기
    function findNearestClusterCenter(boothId: number): { wx: number; wy: number } | null {
      const booth = boothMapRef.current.get(boothId);
      if (!booth) return null;
      const { cx: bx, cy: by } = getBoothCenter(booth);
      let best: { wx: number; wy: number } | null = null;
      let bestDist = Infinity;
      for (const c of clusters) {
        if (c.isCluster && c.count > 1) {
          const cx = c.bboxX + c.bboxW / 2;
          const cy = c.bboxY + c.bboxH / 2;
          const d = (bx - cx) ** 2 + (by - cy) ** 2;
          if (d < bestDist) { bestDist = d; best = { wx: cx, wy: cy }; }
        }
      }
      return best;
    }

    // 사라지는 마커 즉시 숨김
    for (const id of oldIds) {
      if (!newIds.has(id)) {
        const el = markers.get(id);
        if (el) {
          el.style.display = 'none';
          el.style.transition = 'none';
          el.style.opacity = '1';
        }
      }
    }

    // 새로 나타나는 마커 즉시 표시
    for (const id of newIds) {
      const el = markers.get(id);
      if (!el) continue;
      if (!oldIds.has(id)) {
        const booth = boothMapRef.current.get(id);
        if (booth) {
          const center = clusterRepCenterRef.current.get(id);
          const wcx = center ? center.wx : getBoothCenter(booth).cx;
          const wcy = center ? center.wy : getBoothCenter(booth).cy;
          const { sx, sy } = worldToScreen(wcx, wcy);
          el.style.display = 'flex';
          el.style.transition = 'none';
          el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%) scale(1)`;
          el.style.opacity = '1';
        }
      }
    }

    // DOM 배지: 클러스터 영역 한가운데에 숫자 표시
    const overlay = markerOverlayRef.current;
    const badges = clusterBadgesRef.current;
    const badgeWorlds = clusterBadgeWorldRef.current;
    const activeBadgeIds = new Set<string>();
    if (overlay) {
      for (const [cid, center] of clusterCenters) {
        activeBadgeIds.add(cid);
        let badge = badges.get(cid);
        if (!badge) {
          badge = document.createElement('div');
          badge.style.cssText =
            'position:absolute;left:0;top:0;pointer-events:none;' +
            'min-width:27px;height:27px;border-radius:14px;' +
            'background:rgba(79,70,229,0.6);color:#fff;' +
            'font-size:13px;font-weight:700;font-family:Inter,sans-serif;' +
            'display:flex;align-items:center;justify-content:center;' +
            'padding:0 6px;' +
            'box-shadow:0 2px 6px rgba(0,0,0,0.15);z-index:5;';
          overlay.appendChild(badge);
          badges.set(cid, badge);
        }
        badge.textContent = String(center.count);
        badge.style.transform = `translate(${center.sx}px, ${center.sy}px) translate(-50%, -50%)`;
        badge.style.display = 'flex';
        // world 좌표 저장 (updateMarkerPositions에서 재사용)
        const wcx = clusters.find(c => c.id === cid)!;
        badgeWorlds.set(cid, { wx: wcx.bboxX + wcx.bboxW / 2, wy: wcx.bboxY + wcx.bboxH / 2 });
      }
      // 사라진 클러스터 배지 제거
      for (const [cid, badge] of badges) {
        if (!activeBadgeIds.has(cid)) {
          badge?.remove?.();
          badges.delete(cid);
          badgeWorlds.delete(cid);
        }
      }
    }

    stableIdsRef.current = newIds;
    prevVisibleIdsRef.current = newIds;
  }

  // updateMarkerPositions: called on every transform change via rAF
  function updateMarkerPositions() {
    try { _updateMarkerPositionsInner(); } catch (e) { console.error('[updateMarkerPositions] error:', e); }
  }
  function _updateMarkerPositionsInner() {
    const overlay = markerOverlayRef.current;
    if (!overlay) return;
    const markers = markerElementsRef.current;
    const { scale: sc, x: tx, y: ty, rotation: rot } = transformRef.current;
    const { width: cw, height: ch } = canvasDimsRef.current;
    const show = showBoothsRef.current;
    const selId = selectedBoothIdRef.current;
    const actCats = activeCategoriesRef.current;
    const catColors = categoryColorMapRef.current;
    const lnFn = lnRef.current;

    // Rotation-aware viewport bounds in world space
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const scrCorners = [[0, 0], [cw, 0], [cw, ch], [0, ch]];
    const wCorners = scrCorners.map(([sx, sy]) => ({
      x: ((sx - tx) * cosR + (sy - ty) * sinR) / sc,
      y: (-(sx - tx) * sinR + (sy - ty) * cosR) / sc,
    }));
    const bx0 = Math.min(wCorners[0].x, wCorners[1].x, wCorners[2].x, wCorners[3].x);
    const by0 = Math.min(wCorners[0].y, wCorners[1].y, wCorners[2].y, wCorners[3].y);
    const bx1 = Math.max(wCorners[0].x, wCorners[1].x, wCorners[2].x, wCorners[3].x);
    const by1 = Math.max(wCorners[0].y, wCorners[1].y, wCorners[2].y, wCorners[3].y);

    // Viewport culling
    const visibleBooths: Booth[] = [];
    for (const booth of boothsRef.current) {
      const { cx, cy } = getBoothCenter(booth);
      
      if (show && cx >= bx0 && cx <= bx1 && cy >= by0 && cy <= by1) {
        visibleBooths.push(booth);
      }
    }

    const visibleBoothIds = new Set(visibleBooths.map(b => b.id));

    // During interaction: keep stable set, only drop markers that left viewport
    const stable = stableIdsRef.current;
    const currentDisplay = new Set<number>();
    for (const id of stable) {
      if (visibleBoothIds.has(id)) currentDisplay.add(id);
    }

    // Schedule a settle recalculation (debounced after last interaction)
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      recalcMarkers();
    }, CLUSTER_ANIM_MS);

    const sampledIds = currentDisplay;
    const prevVisible = prevVisibleIdsRef.current;

    for (const booth of boothsRef.current) {
      const el = markers.get(booth.id);
      if (!el) continue;

      const isDisplayed = sampledIds.has(booth.id);

      if (!isDisplayed) {
        // Don't hide if mid-fade (managed by recalcMarkers)
        if (!prevVisible.has(booth.id) && !fadingIdsRef.current.has(booth.id)) {
          el.style.display = 'none';
        }
        continue;
      }

      // 클러스터 대표면 영역 중앙, 아니면 부스 중심
      const center = clusterRepCenterRef.current.get(booth.id);
      const wcx = center ? center.wx : getBoothCenter(booth).cx;
      const wcy = center ? center.wy : getBoothCenter(booth).cy;
      const { sx, sy } = worldToScreen(wcx, wcy);

      // Perspective scale: when tilted, markers near top (far) shrink, near bottom (close) grow
      const tilt = transformRef.current.tilt;
      let pScale = 1;
      if (tilt > 0) {
        const normalizedY = Math.max(0, Math.min(1, sy / ch));
        pScale = 0.5 + normalizedY * 0.8;
      }

      // Position update only (no fade logic here — recalcMarkers handles transitions)
      // transition 제거: 슬라이드 애니메이션 후 남은 transition이 드래그 시 지연 유발
      if (!fadingIdsRef.current.has(booth.id)) {
        el.style.transition = 'none';
      }
      el.style.display = 'flex';
      el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%) scale(${pScale.toFixed(3)})`;

      // Category filter opacity — skip if mid-fade
      if (!fadingIdsRef.current.has(booth.id)) {
        const opacity = actCats.size === 0 ? 1 : (booth.category_id && actCats.has(booth.category_id) ? 1 : 0.2);
        el.style.opacity = String(opacity);
      }

      // Update SVG pin color for selection
      const isSelected = booth.id === selId;
      const fill = booth.color || (booth.category_id && catColors[booth.category_id]) || '#ef4444';
      const paths = el.querySelectorAll('svg path');
      const circles = el.querySelectorAll('svg circle');
      if (paths.length >= 2) {
        paths[0].setAttribute('fill', fill);
        paths[0].setAttribute('stroke', isSelected ? '#4f46e5' : '#fff');
        paths[0].setAttribute('stroke-width', isSelected ? '3' : '2.5');
        paths[1].setAttribute('stroke', isSelected ? '#4f46e5' : '#fff');
      }
      if (circles.length >= 2) {
        circles[0].setAttribute('fill', fill);
        circles[1].setAttribute('stroke', isSelected ? '#4f46e5' : '#fff');
      }

      // Update label: 클러스터면 홀/구역명, 아니면 회사명/부스번호
      const nameEl = el.querySelector('[data-name]') as HTMLElement;
      const numEl = el.querySelector('[data-num]') as HTMLElement;
      const labelEl = el.querySelector('[data-label]') as HTMLElement;
      if (nameEl) {
        // 클러스터 대표면 홀/구역 이름 우선 사용
        const clusterName = clusterNameMapRef.current.get(booth.id);
        const displayName = clusterName || booth.display_name || lnFn(booth.company?.name) || '';
        nameEl.textContent = displayName || booth.booth_number;
        nameEl.style.whiteSpace = (clusterName || booth.display_name) ? 'pre-line' : 'nowrap';
        nameEl.style.lineHeight = '1.1';
        nameEl.style.fontSize = `${markerFontSizeRef.current}px`;
        // 홀/구역 이름이면 부스번호 숨김, 그 외 표기이름/회사명 있으면 표시
        if (numEl) {
          numEl.textContent = booth.booth_number;
          numEl.style.fontSize = `${Math.round(markerFontSizeRef.current * 0.75)}px`;
          numEl.style.display = clusterName ? 'none' : (displayName ? '' : 'none');
        } else if (displayName && labelEl) {
          // numEl 없으면 생성
          const ns = document.createElement('div');
          ns.setAttribute('data-num', '');
          ns.textContent = booth.booth_number;
          ns.style.fontSize = `${Math.round(markerFontSizeRef.current * 0.75)}px`;
          ns.style.fontWeight = '500';
          ns.style.color = '#6b7280'; ns.style.whiteSpace = 'nowrap';
          ns.style.textShadow = '-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff';
          labelEl.insertBefore(ns, nameEl);
        }
      }
    }

    // 클러스터 배지 위치 업데이트 (pan/zoom 추적)
    for (const [cid, badge] of clusterBadgesRef.current) {
      const wc = clusterBadgeWorldRef.current.get(cid);
      if (wc) {
        const sp = worldToScreen(wc.wx, wc.wy);
        badge.style.transform = `translate(${sp.sx}px, ${sp.sy}px) translate(-50%, -50%)`;
      }
    }

    // Facility DOM markers 위치 업데이트 (fixed size, no rotation)
    for (const [, el] of facilityMarkerElementsRef.current) {
      const wx = parseFloat(el.getAttribute('data-fac-wx') || '0');
      const wy = parseFloat(el.getAttribute('data-fac-wy') || '0');
      const { sx: fsx, sy: fsy } = worldToScreen(wx, wy);
      el.style.transform = `translate(${fsx}px, ${fsy}px) translate(-50%, -50%)`;
    }

    // Save current visible set for next frame comparison
    prevVisibleIdsRef.current = new Set(sampledIds);

    // 출발/도착 핀 마커 위치 업데이트
    const startEl = navStartMarkerRef.current;
    const endEl = navEndMarkerRef.current;
    const nsp = navStartPointRef.current;
    const nep = navEndPointRef.current;
    if (startEl) {
      if (nsp) {
        const sp = worldToScreen(nsp.x, nsp.y);
        startEl.style.display = 'flex';
        startEl.style.transform = `translate(${sp.sx - 7}px, ${sp.sy - 18}px)`;
      } else {
        startEl.style.display = 'none';
      }
    }
    if (endEl) {
      if (nep) {
        const sp = worldToScreen(nep.x, nep.y);
        endEl.style.display = 'flex';
        endEl.style.transform = `translate(${sp.sx - 7}px, ${sp.sy - 18}px)`;
      } else {
        endEl.style.display = 'none';
      }
    }
    // 현재 위치 마커
    const curEl = navCurrentMarkerRef.current;
    const ncp = navCurrentPosRef.current;
    if (curEl) {
      if (ncp) {
        const sp = worldToScreen(ncp.x, ncp.y);
        curEl.style.display = 'flex';
        curEl.style.transform = `translate(${sp.sx - 10}px, ${sp.sy - 10}px)`;
      } else {
        curEl.style.display = 'none';
      }
    }
  }

  useEffect(() => {
    const overlay = markerOverlayRef.current;
    if (!overlay) return;
    const markers = markerElementsRef.current;
    const currentIds = new Set(booths.map(b => b.id));

    // Remove deleted booths
    for (const [id, el] of markers) {
      if (!currentIds.has(id)) {
        el?.remove?.();
        markers.delete(id);
      }
    }

    // Create new marker DOM elements
    for (const booth of booths) {
      if (!markers.has(booth.id)) {
        const el = document.createElement('div');
        el.className = 'booth-marker';
        el.style.position = 'absolute';
        el.style.left = '0';
        el.style.top = '0';
        el.style.willChange = 'transform';
        el.style.pointerEvents = 'auto';
        el.style.cursor = 'pointer';
        el.style.zIndex = '10';
        el.style.display = 'none';
        el.style.flexDirection = 'column';
        el.style.alignItems = 'center';

        const fill = booth.color || (booth.category_id && categoryColorMap[booth.category_id]) || '#ef4444';

        // SVG map pin (realistic pin shape)
        const pinSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        pinSvg.setAttribute('width', '14');
        pinSvg.setAttribute('height', '18');
        pinSvg.setAttribute('viewBox', '0 0 28 36');
        pinSvg.style.filter = 'drop-shadow(0 2px 3px rgba(0,0,0,0.35))';
        pinSvg.innerHTML =
          `<path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="${fill}" stroke="#fff" stroke-width="2.5"/>` +
          `<circle cx="14" cy="14" r="8" fill="${fill}"/>` +
          `<circle cx="14" cy="14" r="8" fill="none" stroke="#fff" stroke-width="2"/>` +
          `<path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="none" stroke="#fff" stroke-width="2"/>`;

        // Label wrapper
        const label = document.createElement('div');
        label.setAttribute('data-label', '');
        label.style.textAlign = 'center';
        label.style.marginTop = '1px';
        label.style.lineHeight = '1.1';

        // 부스번호 (위, 작은 글씨)
        const numSpan = document.createElement('div');
        numSpan.setAttribute('data-num', '');
        numSpan.textContent = booth.booth_number;
        numSpan.style.fontSize = `${Math.round(markerFontSizeRef.current * 0.75)}px`;
        numSpan.style.fontWeight = '500';
        numSpan.style.color = '#6b7280';
        numSpan.style.whiteSpace = 'nowrap';
        numSpan.style.textShadow = '-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff';

        // 표기이름 > 회사명 > 부스번호
        const nameSpan = document.createElement('div');
        nameSpan.setAttribute('data-name', '');
        const initDisplayName = booth.display_name || lnRef.current(booth.company?.name) || '';
        nameSpan.textContent = initDisplayName || booth.booth_number;
        nameSpan.style.fontSize = `${markerFontSizeRef.current}px`;
        nameSpan.style.fontWeight = '700';
        nameSpan.style.fontFamily = 'Inter, sans-serif';
        nameSpan.style.color = '#1f2937';
        nameSpan.style.whiteSpace = booth.display_name ? 'pre-line' : 'nowrap';
        nameSpan.style.lineHeight = '1.1';
        nameSpan.style.overflow = 'visible';
        nameSpan.style.textShadow = '-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, 0 0 4px #fff';

        // 표기이름/회사명 있으면 부스번호+이름, 없으면 부스번호만
        if (initDisplayName) {
          label.appendChild(numSpan);
        }
        label.appendChild(nameSpan);

        el.appendChild(pinSvg);
        el.appendChild(label);

        // 마커 위에서도 드래그 가능하게 — pointerdown을 캔버스로 전달
        el.addEventListener('pointerdown', (e) => {
          const canvas = canvasRef.current;
          if (canvas) {
            const synth = new PointerEvent('pointerdown', {
              clientX: e.clientX, clientY: e.clientY,
              pointerId: e.pointerId, pointerType: e.pointerType,
              isPrimary: e.isPrimary, bubbles: true, cancelable: true,
            });
            canvas.dispatchEvent(synth);
          }
        });

        // Click handler
        el.addEventListener('pointerup', (e) => {
          e.stopPropagation();
          onBoothClickRef.current(booth);
          if (typeof window !== 'undefined' && typeof (window as any).onBoothClick === 'function') {
            (window as any).onBoothClick(booth.id, booth);
          }
        });

        overlay.appendChild(el);
        markers.set(booth.id, el);
      }
    }

    // Initial marker calculation + position update
    recalcMarkers();
    updateMarkerPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booths]);

  // 글자 크기 변경 시 클러스터 + 마커 재계산
  useEffect(() => {
    recalcMarkers();
    updateMarkerPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerFontSize]);

  // Redraw markers on style/filter changes
  useEffect(() => {
    updateMarkerPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBoothId, showBooths, activeCategories, categories, ln]);

  // 출발/도착 마커 위치 업데이트
  useEffect(() => {
    updateMarkerPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navStartPoint, navEndPoint, navCurrentPos]);

  // ===== Facilities (DOM-based, fixed size regardless of zoom) =====
  useEffect(() => {
    // Clear PIXI facility layer (kept for backwards compat)
    facilityLayerRef.current.removeChildren();

    const overlay = markerOverlayRef.current;
    if (!overlay) return;
    const facMarkers = facilityMarkerElementsRef.current;
    const currentFacIds = new Set(visibleFacilities.map(f => f.id));

    // Remove deleted/hidden facility markers
    for (const [id, el] of facMarkers) {
      if (!currentFacIds.has(id)) {
        el?.remove?.();
        facMarkers.delete(id);
      }
    }

    // Create/update DOM elements for visible facilities
    for (const fac of visibleFacilities) {
      const style = FACILITY_STYLES[fac.type] || { color: 0x6b7280, label: '?' };
      const hexColor = '#' + (style.color).toString(16).padStart(6, '0');

      const textColor = style.textColor || '#fff';
      const borderColor = style.borderColor || (style.color === 0xffffff ? 'rgba(209,213,219,0.9)' : 'rgba(255,255,255,0.9)');

      let el = facMarkers.get(fac.id);
      if (!el) {
        el = document.createElement('div');
        el.style.cssText =
          'position:absolute;left:0;top:0;pointer-events:none;' +
          'width:26px;height:26px;border-radius:50%;' +
          'display:flex;align-items:center;justify-content:center;' +
          'font-size:10px;font-weight:700;font-family:Inter,sans-serif;' +
          'box-shadow:0 1px 4px rgba(0,0,0,0.3);z-index:6;' +
          'will-change:transform;';
        el.style.background = hexColor;
        el.style.color = textColor;
        el.style.border = `2px solid ${borderColor}`;
        el.setAttribute('data-fac-wx', String(fac.x));
        el.setAttribute('data-fac-wy', String(fac.y));
        el.textContent = style.label;
        overlay.appendChild(el);
        facMarkers.set(fac.id, el);
      } else {
        // Update in case type/position changed
        el.style.background = hexColor;
        el.style.color = textColor;
        el.style.border = `2px solid ${borderColor}`;
        el.textContent = style.label;
        el.setAttribute('data-fac-wx', String(fac.x));
        el.setAttribute('data-fac-wy', String(fac.y));
      }
    }

    updateMarkerPositions();
  }, [visibleFacilities]);

  // ===== Current Position =====
  useEffect(() => {
    const layer = overlayLayerRef.current;
    layer.removeChildren();
    if (!currentPosition || currentPosition.floorId !== currentFloorId) return;
    const sc = transformRef.current.scale;

    const outer = new PIXI.Graphics();
    outer.lineStyle(3 / sc, 0xffffff);
    outer.beginFill(0xef4444, 0.9);
    outer.drawCircle(0, 0, Math.max(12, 16 / sc));
    outer.endFill();
    outer.x = currentPosition.x;
    outer.y = currentPosition.y;
    layer.addChild(outer);

    const inner = new PIXI.Graphics();
    inner.beginFill(0xffffff);
    inner.drawCircle(0, 0, Math.max(5, 6 / sc));
    inner.endFill();
    inner.x = currentPosition.x;
    inner.y = currentPosition.y;
    layer.addChild(inner);
  }, [currentPosition, currentFloorId]);

  // ===== Window-exposed functions =====
  function zoomIn() {
    const { width: cw, height: ch } = canvasDimsRef.current;
    // +0.5 zoom level (×√2 ≈ 1.414), snap to nearest 0.5
    const curLevel = Math.log2(transformRef.current.scale);
    const targetLevel = Math.ceil(curLevel * 2 + 0.01) / 2; // next 0.5 step up
    animateZoom(Math.pow(2, targetLevel), cw / 2, ch / 2, 200);
  }

  function zoomOut() {
    const { width: cw, height: ch } = canvasDimsRef.current;
    // -0.5 zoom level, snap to nearest 0.5
    const curLevel = Math.log2(transformRef.current.scale);
    const targetLevel = Math.floor(curLevel * 2 - 0.01) / 2; // next 0.5 step down
    animateZoom(Math.pow(2, targetLevel), cw / 2, ch / 2, 200);
  }

  function panToBooth(booth: Booth) {
    const mc = mainContainerRef.current;
    if (!mc) return;
    const { width: cw, height: ch } = canvasDimsRef.current;
    const sc = transformRef.current.scale;
    const { cx: centerX, cy: centerY } = getBoothCenter(booth);
    transformRef.current.x = cw / 2 - centerX * sc;
    transformRef.current.y = ch / 2 - centerY * sc;
    clampPosition(transformRef.current);
    syncContainerPosition(mc, transformRef.current);
    renderTilesFnRef.current();
    scheduleMarkerUpdate();
  }

  function resetView() {
    const mc = mainContainerRef.current;
    if (!mc) return;
    const { width: cw, height: ch } = canvasDimsRef.current;
    const minFitScale = Math.max(cw / imgWidth, ch / imgHeight);
    const fitScale = Math.max(minFitScale, Math.min(cw / imgWidth, ch / imgHeight) * 0.9);
    transformRef.current = {
      scale: fitScale,
      x: (cw - imgWidth * fitScale) / 2,
      y: (ch - imgHeight * fitScale) / 2,
      rotation: 0,
      tilt: 0,
    };
    clampPosition(transformRef.current);
    syncContainerPosition(mc, transformRef.current);
    mc.scale.set(fitScale);
    mc.rotation = 0;
    applyTilt(0);
    onZoomChangeRef.current?.(fitScale);
    renderTilesFnRef.current();
    scheduleMarkerUpdate();
  }

  function panToArea(x: number, y: number, width: number, height: number) {
    const mc = mainContainerRef.current;
    if (!mc) return;
    const { width: cw, height: ch } = canvasDimsRef.current;
    const scaleX = cw / width;
    const scaleY = ch / height;
    const newScale = Math.min(scaleX, scaleY) * 0.85;
    const minFitScale = Math.max(cw / imgWidth, ch / imgHeight);
    const clampedScale = Math.min(MAX_ZOOM, Math.max(minFitScale, newScale));
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    transformRef.current.scale = clampedScale;
    transformRef.current.x = cw / 2 - centerX * clampedScale;
    transformRef.current.y = cw / 2 - centerY * clampedScale;
    clampPosition(transformRef.current);
    syncContainerPosition(mc, transformRef.current);
    mc.scale.set(clampedScale);
    onZoomChange?.(clampedScale);
    renderTilesFnRef.current();
    scheduleMarkerUpdate();
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__mapViewerPanToBooth = panToBooth;
      (window as unknown as Record<string, unknown>).__mapViewerPanToArea = panToArea;
      (window as unknown as Record<string, unknown>).__mapViewerZoomIn = zoomIn;
      (window as unknown as Record<string, unknown>).__mapViewerZoomOut = zoomOut;
      (window as unknown as Record<string, unknown>).__mapViewerFontUp = () => setMarkerFontSize(s => Math.min(48, s + 4));
      (window as unknown as Record<string, unknown>).__mapViewerFontDown = () => setMarkerFontSize(s => Math.max(10, s - 4));
      (window as unknown as Record<string, unknown>).__mapViewerResetView = resetView;
      (window as unknown as Record<string, unknown>).__mapViewerSetTilt = (deg: number) => applyTilt(deg);
      (window as unknown as Record<string, unknown>).__mapViewerPanToWorld = (wx: number, wy: number, scale?: number, rotation?: number) => {
        const mc = mainContainerRef.current;
        if (!mc) return;
        const { width: cw, height: ch } = canvasDimsRef.current;
        const sc = scale ?? transformRef.current.scale;
        if (rotation !== undefined) transformRef.current.rotation = rotation;
        transformRef.current.scale = sc;
        const cosR = Math.cos(transformRef.current.rotation), sinR = Math.sin(transformRef.current.rotation);
        transformRef.current.x = cw / 2 - sc * (wx * cosR - wy * sinR);
        transformRef.current.y = ch / 2 - sc * (wx * sinR + wy * cosR);
        clampPosition(transformRef.current);
        syncContainerPosition(mc, transformRef.current);
        mc.scale.set(sc);
        mc.rotation = transformRef.current.rotation;
        onZoomChange?.(sc);
        renderTilesFnRef.current();
        scheduleMarkerUpdate();
      };
      // 부드러운 이동 + 회전 애니메이션
      let navAnimRaf = 0;
      (window as unknown as Record<string, unknown>).__mapViewerAnimateNav = (wx: number, wy: number, rotation: number, durationMs: number = 500) => {
        const mc = mainContainerRef.current;
        if (!mc) return;
        if (navAnimRaf) cancelAnimationFrame(navAnimRaf);
        const t = transformRef.current;
        const { width: cw, height: ch } = canvasDimsRef.current;
        const sc = t.scale;
        const startRot = t.rotation;
        // 최단 회전 방향
        let dRot = rotation - startRot;
        while (dRot > Math.PI) dRot -= 2 * Math.PI;
        while (dRot < -Math.PI) dRot += 2 * Math.PI;
        const startTime = performance.now();
        const step = (now: number) => {
          const elapsed = now - startTime;
          const progress = Math.min(1, elapsed / durationMs);
          const ease = 1 - Math.pow(1 - progress, 3);
          // 회전 보간
          t.rotation = startRot + dRot * ease;
          // 목표 world 좌표(wx,wy)가 항상 화면 중심에 오도록 — 회전 중에도 고정
          const cosR = Math.cos(t.rotation), sinR = Math.sin(t.rotation);
          t.x = cw / 2 - sc * (wx * cosR - wy * sinR);
          t.y = ch / 2 - sc * (wx * sinR + wy * cosR);
          // clampPosition 생략 — 네비 중 목표점이 정확히 화면 중심에 와야 함
          syncContainerPosition(mc, t);
          mc.rotation = t.rotation;
          renderTilesFnRef.current();
          scheduleMarkerUpdate();
          if (progress < 1) {
            navAnimRaf = requestAnimationFrame(step);
          } else {
            navAnimRaf = 0;
          }
        };
        navAnimRaf = requestAnimationFrame(step);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensions]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden" style={{ touchAction: 'none', overscrollBehavior: 'none', background: '#ffffff', cursor: 'grab', userSelect: 'none', WebkitUserSelect: 'none' }}>

      {/* Three.js 3D 벽 오버레이 — 필요 시 주석 해제. 상세 사용법: WallOverlay.tsx 참고.
      <WallOverlay
        booths={booths}
        transformRef={transformRef}
        canvasDimsRef={canvasDimsRef}
        canvasPadRef={canvasPadRef}
        containerRef={containerRef}
      /> */}
      {/* HTML DOM marker overlay — sits above canvas, pointer-events pass through except on markers */}
      <div
        ref={markerOverlayRef}
        className="absolute inset-0 overflow-hidden"
        style={{ pointerEvents: 'none', zIndex: 5, userSelect: 'none', WebkitUserSelect: 'none' }}
      />

      {/* 글자 크기 조절은 외부(index.tsx)에서 제어 */}

      {/* 출발/도착 핀 마커 — DOM refs로 매 프레임 위치 업데이트 */}
      <div ref={navStartMarkerRef} className="absolute pointer-events-none" style={{ display: 'none', flexDirection: 'column', alignItems: 'center', zIndex: 4 }}>
        <svg width="14" height="18" viewBox="0 0 28 36" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.35))' }}>
          <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="#22c55e" stroke="#fff" strokeWidth="2.5"/>
          <circle cx="14" cy="14" r="8" fill="#22c55e"/><circle cx="14" cy="14" r="8" fill="none" stroke="#fff" strokeWidth="2"/>
        </svg>
        <span style={{ fontSize: '12px', color: '#22c55e', fontWeight: 700, whiteSpace: 'nowrap', textShadow: '0 0 3px #fff, 0 0 3px #fff' }}>출발</span>
      </div>
      <div ref={navEndMarkerRef} className="absolute pointer-events-none" style={{ display: 'none', flexDirection: 'column', alignItems: 'center', zIndex: 4 }}>
        <svg width="14" height="18" viewBox="0 0 28 36" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.35))' }}>
          <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="#ef4444" stroke="#fff" strokeWidth="2.5"/>
          <circle cx="14" cy="14" r="8" fill="#ef4444"/><circle cx="14" cy="14" r="8" fill="none" stroke="#fff" strokeWidth="2"/>
        </svg>
        <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 700, whiteSpace: 'nowrap', textShadow: '0 0 3px #fff, 0 0 3px #fff' }}>도착</span>
      </div>

      {/* 현재 위치 마커 (네비게이션 모드) */}
      <div ref={navCurrentMarkerRef} className="absolute pointer-events-none" style={{ display: 'none', zIndex: 6 }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#3b82f6', border: '3px solid #fff', boxShadow: '0 0 0 4px rgba(59,130,246,0.3), 0 2px 6px rgba(0,0,0,0.3)' }} />
      </div>

      {/* Facility tooltip overlay */}
      {facilityTooltip && (
        <div
          className="absolute z-50 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-500/40 rounded-lg shadow-lg p-3 pointer-events-auto"
          style={{ left: Math.min(facilityTooltip.screenX, dimensions.width - 200), top: Math.max(0, facilityTooltip.screenY - 80) }}
        >
          <button onClick={() => setFacilityTooltip(null)} className="absolute top-1 right-2 text-gray-400 hover:text-gray-600 text-xs">&times;</button>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {ln(facilityTooltip.facility.name) || (FACILITY_STYLES[facilityTooltip.facility.type]?.label ?? facilityTooltip.facility.type)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {FACILITY_STYLES[facilityTooltip.facility.type]?.label} &middot;
            {facilityTooltip.facility.subtype ? ` ${facilityTooltip.facility.subtype}` : ''}
            {` (${Math.round(facilityTooltip.facility.x)}, ${Math.round(facilityTooltip.facility.y)})`}
          </p>
        </div>
      )}
    </div>
  );
}
