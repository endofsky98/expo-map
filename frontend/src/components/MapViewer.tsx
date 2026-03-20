import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as PIXI from 'pixi.js';
import { Booth, Category, MapImage, Facility, RoutePoint, Obstacle, ZoomLevel, RouteResult } from '@/types';
import { useI18n } from '@/lib/i18n';

interface TileLevelInfo {
  level: number;
  width: number;
  height: number;
  cols: number;
  rows: number;
}

interface TileInfo {
  tile_size: number;
  levels: TileLevelInfo[];
}

interface CurrentPosition {
  x: number;
  y: number;
  floorId: number;
  hallId: number;
}

interface MapViewerProps {
  booths: Booth[];
  categories: Category[];
  currentImage: MapImage | null;
  selectedBoothId: number | null;
  activeCategories: Set<number>;
  facilities: Facility[];
  hiddenFacilityTypes: Set<string>;
  obstacles: Obstacle[];
  routePath: RoutePoint[] | null;
  routeResult?: RouteResult | null;
  currentFloorId: number | null;
  currentPosition: CurrentPosition | null;
  showBooths: boolean;
  prefetchRange: number;
  onBoothClick: (booth: Booth) => void;
  onMapClick?: (x: number, y: number, floorId: number) => void;
  onZoomChange?: (zoom: number) => void;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8.0;
const MIN_TILT = 0;
const MAX_TILT = 60;
const MIN_BOOTH_SCREEN_SIZE = 3;
const CLICK_THRESHOLD = 5;
const CLICK_TIME_THRESHOLD = 300;

function maxMarkersForScale(scale: number): number {
  if (scale >= 3.0) return 30;
  if (scale >= 2.0) return 20;
  if (scale >= 1.0) return 15;
  return 8;
}

const FACILITY_STYLES: Record<string, { color: number; label: string }> = {
  restroom: { color: 0x3b82f6, label: 'WC' },
  emergency_exit: { color: 0xef4444, label: 'EXIT' },
  stairs: { color: 0x22c55e, label: 'S' },
  elevator: { color: 0xf59e0b, label: 'EV' },
  escalator: { color: 0xf97316, label: 'ES' },
};

function parseZoomLevels(img: MapImage): ZoomLevel[] {
  if (!img.zoom_levels) return [];
  if (typeof img.zoom_levels === 'string') {
    try { return JSON.parse(img.zoom_levels); } catch { return []; }
  }
  return img.zoom_levels;
}

function hexStringToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

function selectTileLevel(scale: number, ti: TileInfo): number {
  const idx = Math.round(-Math.log2(Math.max(0.01, scale)));
  return Math.max(0, Math.min(ti.levels.length - 1, idx));
}

export default function MapViewer({
  booths,
  categories,
  currentImage,
  selectedBoothId,
  activeCategories,
  facilities,
  hiddenFacilityTypes,
  obstacles,
  routePath,
  routeResult,
  currentFloorId,
  currentPosition,
  showBooths,
  prefetchRange,
  onBoothClick,
  onMapClick,
  onZoomChange,
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

  // Callbacks as refs to avoid stale closures
  const onBoothClickRef = useRef(onBoothClick);
  const onMapClickRef = useRef(onMapClick);
  const onZoomChangeRef = useRef(onZoomChange);
  onBoothClickRef.current = onBoothClick;
  onMapClickRef.current = onMapClick;
  onZoomChangeRef.current = onZoomChange;

  const markerOverlayRef = useRef<HTMLDivElement | null>(null);
  const markerElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const rafIdRef = useRef<number>(0);
  const prevVisibleIdsRef = useRef<Set<number>>(new Set());
  const prevScaleRef = useRef<number>(1);
  const stableIdsRef = useRef<Set<number>>(new Set()); // confirmed markers (only recalc on settle)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadingIdsRef = useRef<Set<number>>(new Set()); // markers mid-fade, don't touch opacity
  const inertiaRafRef = useRef<number>(0);
  const velocityRef = useRef({ vx: 0, vy: 0 });

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

  const routeFacilityMarkers = useMemo(() => {
    if (!routeResult?.facilities_used || !currentFloorId) return [];
    return routeResult.facilities_used.filter((f) => f.floor_id === currentFloorId);
  }, [routeResult, currentFloorId]);

  const imgWidth = currentImage?.width || 800;
  const imgHeight = currentImage?.height || 600;

  // Refs for data accessed in click handler closure
  const boothsRef = useRef(booths);
  boothsRef.current = booths;
  const boothMapRef = useRef<Map<number, Booth>>(new Map());
  const visibleFacilitiesRef = useRef(visibleFacilities);
  useEffect(() => {
    const m = new Map<number, Booth>();
    for (const b of booths) m.set(b.id, b);
    boothMapRef.current = m;
  }, [booths]);
  visibleFacilitiesRef.current = visibleFacilities;
  const currentFloorIdRef = useRef(currentFloorId);
  currentFloorIdRef.current = currentFloorId;

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
    if (rafIdRef.current) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = 0;
      updateMarkerPositions();
    });
  }

  function clampPosition(t: { x: number; y: number; scale: number; rotation: number }) {
    const { width: cw, height: ch } = canvasDimsRef.current;
    const sc = t.scale;
    const cosR = Math.cos(t.rotation);
    const sinR = Math.sin(t.rotation);
    const absC = Math.abs(cosR);
    const absS = Math.abs(sinR);
    const effW = (imgWidth * absC + imgHeight * absS) * sc;
    const effH = (imgWidth * absS + imgHeight * absC) * sc;
    const icx = t.x + sc * (imgWidth / 2 * cosR - imgHeight / 2 * sinR);
    const icy = t.y + sc * (imgWidth / 2 * sinR + imgHeight / 2 * cosR);
    const clampedIcx = Math.max(cw - effW / 2, Math.min(effW / 2, icx));
    const clampedIcy = Math.max(ch - effH / 2, Math.min(effH / 2, icy));
    t.x += clampedIcx - icx;
    t.y += clampedIcy - icy;
  }

  const tileRenderPendingRef = useRef(false);
  function scheduleRenderTiles() {
    if (tileRenderPendingRef.current) return;
    tileRenderPendingRef.current = true;
    requestAnimationFrame(() => {
      tileRenderPendingRef.current = false;
      renderTilesFnRef.current();
    });
  }

  function applyTransform(newScale: number, newRotation: number, pivotX: number, pivotY: number) {
    const t = transformRef.current;
    const { width: cw, height: ch } = canvasDimsRef.current;
    // Minimum zoom: image must fill canvas (no smaller than fit)
    const minFitScale = Math.max(cw / imgWidth, ch / imgHeight);
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
      mc.position.set(t.x, t.y);
      mc.scale.set(clamped);
      mc.rotation = newRotation;
    }
    onZoomChangeRef.current?.(clamped);
    scheduleRenderTiles();
    scheduleMarkerUpdate();
  }

  function applyZoom(newScale: number, pivotX: number, pivotY: number) {
    applyTransform(newScale, transformRef.current.rotation, pivotX, pivotY);
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
      const origin = 'center 30%';
      if (canvas) { canvas.style.transform = tf; canvas.style.transformOrigin = origin; }
    }
    // 마커 오버레이에는 tilt 적용하지 않음 — 마커는 항상 정면 고정
    scheduleMarkerUpdate();
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
      if (mc) mc.position.set(t.x, t.y);
      renderTilesFnRef.current();
      scheduleMarkerUpdate();
      v.vx *= 0.92;
      v.vy *= 0.92;
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

    const app = new PIXI.Application({
      width: w,
      height: h,
      backgroundColor: 0xf3f4f6,
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
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    // Main container (replaces pixi-viewport)
    const mainContainer = new PIXI.Container();
    app.stage.addChild(mainContainer);
    mainContainer.addChild(tileLayerRef.current);
    mainContainer.addChild(obstacleLayerRef.current);
    mainContainer.addChild(routeLayerRef.current);
    // boothLayer removed — booths are now HTML DOM markers
    mainContainer.addChild(facilityLayerRef.current);
    mainContainer.addChild(overlayLayerRef.current);
    mainContainerRef.current = mainContainer;

    // ===== Pointer events for drag/zoom =====
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let pointerDownInfo = { x: 0, y: 0, time: 0 };
    const pointers = new Map<number, { x: number; y: number }>();
    let lastPinchDist = 0;
    let lastPinchAngle = 0;
    let lastPinchMidY = 0;
    // #2: Gesture classification
    let gestureType: 'none' | 'zoom' | 'tilt' = 'none';
    let gestureAccumDist = 0;
    let gestureAccumMidY = 0;
    const GESTURE_THRESHOLD = 5; // reduced from 12 for snappier response
    let moveRafPending = false; // rAF throttle for pointermove

    let lastDragX = 0, lastDragY = 0, lastDragTime = 0;

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      stopInertia();
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 1 && e.isPrimary) {
        const t = transformRef.current;
        dragStart = { x: e.clientX - t.x, y: e.clientY - t.y };
        isDragging = true;
        pointerDownInfo = { x: e.clientX, y: e.clientY, time: Date.now() };
        lastDragX = e.clientX; lastDragY = e.clientY; lastDragTime = Date.now();
      } else if (pointers.size === 2) {
        isDragging = false;
        const pts = Array.from(pointers.values());
        lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        lastPinchAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
        lastPinchMidY = (pts[0].y + pts[1].y) / 2;
        gestureType = 'none';
        gestureAccumDist = 0;
        gestureAccumMidY = 0;
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 2) {
        // rAF throttle for two-finger gestures to prevent jank on high-refresh-rate displays
        if (moveRafPending) return;
        moveRafPending = true;
        requestAnimationFrame(() => {
          moveRafPending = false;
          if (pointers.size !== 2) return;
          const pts = Array.from(pointers.values());
          const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
          const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
          const midY = (pts[0].y + pts[1].y) / 2;
          if (lastPinchDist > 0) {
            // #2: Classify gesture once, then commit
            const distDelta = Math.abs(dist - lastPinchDist);
            const midYDelta = Math.abs(midY - lastPinchMidY);
            if (gestureType === 'none') {
              gestureAccumDist += distDelta;
              gestureAccumMidY += midYDelta;
              if (gestureAccumDist > GESTURE_THRESHOLD || gestureAccumMidY > GESTURE_THRESHOLD) {
                gestureType = gestureAccumDist > gestureAccumMidY ? 'zoom' : 'tilt';
              }
            }
            if (gestureType !== 'tilt') {
              const rect = el.getBoundingClientRect();
              const cx = (pts[0].x + pts[1].x) / 2 - rect.left;
              const cy = (pts[0].y + pts[1].y) / 2 - rect.top;
              const newScale = transformRef.current.scale * (dist / lastPinchDist);
              const newRotation = transformRef.current.rotation + (angle - lastPinchAngle);
              applyTransform(newScale, newRotation, cx, cy);
            }
            if (gestureType === 'tilt') {
              const tiltDelta = -(midY - lastPinchMidY) * 0.3;
              applyTilt(transformRef.current.tilt + tiltDelta);
            }
          }
          lastPinchDist = dist;
          lastPinchAngle = angle;
          lastPinchMidY = midY;
        });
        return;
      }

      if (isDragging && e.isPrimary) {
        if (e.ctrlKey || e.metaKey) {
          // Ctrl+drag: vertical = tilt, horizontal = rotation
          const dy = e.clientY - lastDragY;
          const dx = e.clientX - lastDragX;
          // Vertical movement → tilt (drag down = tilt more)
          if (Math.abs(dy) > 0) {
            applyTilt(transformRef.current.tilt + dy * 0.3);
          }
          // Horizontal movement → rotation (center pivot)
          if (Math.abs(dx) > 0) {
            const { width: cw, height: ch } = canvasDimsRef.current;
            applyTransform(transformRef.current.scale, transformRef.current.rotation + dx * 0.003, cw / 2, ch / 2);
          }
          lastDragX = e.clientX; lastDragY = e.clientY; lastDragTime = Date.now();
        } else {
          // Normal drag: pan
          const t = transformRef.current;
          t.x = e.clientX - dragStart.x;
          t.y = e.clientY - dragStart.y;
          clampPosition(t);
          mainContainer.position.set(t.x, t.y);
          scheduleRenderTiles();
          scheduleMarkerUpdate();
          // Track velocity for inertia
          const now = Date.now();
          const dt = now - lastDragTime;
          if (dt > 0) {
            velocityRef.current.vx = (e.clientX - lastDragX) / dt * 16;
            velocityRef.current.vy = (e.clientY - lastDragY) / dt * 16;
          }
          lastDragX = e.clientX; lastDragY = e.clientY; lastDragTime = now;
        }
      }
    });

    canvas.addEventListener('pointerup', (e) => {
      canvas.releasePointerCapture(e.pointerId);
      pointers.delete(e.pointerId);

      if (e.isPrimary && isDragging) {
        isDragging = false;
        const dx = e.clientX - pointerDownInfo.x;
        const dy = e.clientY - pointerDownInfo.y;
        const dt = Date.now() - pointerDownInfo.time;
        if (Math.abs(dx) < CLICK_THRESHOLD && Math.abs(dy) < CLICK_THRESHOLD && dt < CLICK_TIME_THRESHOLD) {
          handleClick(e);
        } else {
          // Start inertia
          const v = velocityRef.current;
          if (Math.abs(v.vx) > 0.5 || Math.abs(v.vy) > 0.5) {
            startInertia(v.vx, v.vy);
          }
        }
      }
      if (pointers.size < 2) { lastPinchDist = 0; lastPinchAngle = 0; lastPinchMidY = 0; gestureType = 'none'; gestureAccumDist = 0; gestureAccumMidY = 0; }
    });

    canvas.addEventListener('pointercancel', (e) => {
      pointers.delete(e.pointerId);
      isDragging = false;
      if (pointers.size < 2) { lastPinchDist = 0; lastPinchAngle = 0; lastPinchMidY = 0; gestureType = 'none'; gestureAccumDist = 0; gestureAccumMidY = 0; }
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const rect = el.getBoundingClientRect();
      applyZoom(transformRef.current.scale * factor, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    function handleClick(e: PointerEvent) {
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const t = transformRef.current;
      const sc = t.scale;
      const cosR = Math.cos(t.rotation);
      const sinR = Math.sin(t.rotation);
      const dx0 = sx - t.x;
      const dy0 = sy - t.y;
      const wx = (dx0 * cosR + dy0 * sinR) / sc;
      const wy = (-dx0 * sinR + dy0 * cosR) / sc;

      // Check facilities first
      for (const fac of visibleFacilitiesRef.current) {
        const r = Math.max(10, 14 / sc);
        const fdx = wx - fac.x;
        const fdy = wy - fac.y;
        if (fdx * fdx + fdy * fdy <= r * r) {
          const fsx = t.x + sc * (fac.x * cosR - fac.y * sinR);
          const fsy = t.y + sc * (fac.x * sinR + fac.y * cosR);
          setFacilityTooltip((prev) =>
            prev?.facility.id === fac.id ? null : { facility: fac, screenX: fsx, screenY: fsy }
          );
          return;
        }
      }

      // Check booths
      for (const booth of boothsRef.current) {
        if (
          wx >= booth.x &&
          wx <= booth.x + booth.width &&
          wy >= booth.y &&
          wy <= booth.y + booth.height
        ) {
          onBoothClickRef.current(booth);
          if (typeof window !== 'undefined' && typeof (window as any).onBoothClick === 'function') {
            (window as any).onBoothClick(booth.id, booth);
          }
          return;
        }
      }

      // No booth/facility hit — fire onMapClick
      setFacilityTooltip(null);
      const floorId = currentFloorIdRef.current || 0;
      onMapClickRef.current?.(Math.round(wx), Math.round(wy), floorId);
      if (typeof window !== 'undefined' && typeof (window as any).onMapClick === 'function') {
        (window as any).onMapClick(Math.round(wx), Math.round(wy), floorId);
      }
    }

    pixiApp.current = app;
    setDimensions({ width: w, height: h });

    // ResizeObserver
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: rw, height: rh } = entry.contentRect;
        if (rw > 0 && rh > 0) {
          app.renderer.resize(rw, rh);
          canvasDimsRef.current = { width: rw, height: rh };
          setDimensions({ width: rw, height: rh });
        }
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      stopInertia();
      app.destroy(true);
      pixiApp.current = null;
      mainContainerRef.current = null;
      canvasRef.current = null;
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
      currentImageIdRef.current = currentImage.id;
    }

    // Initial fit when image changes
    if (imageChanged) {
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
      mc.position.set(transformRef.current.x, transformRef.current.y);
      mc.scale.set(fitScale);
      mc.rotation = 0;
      applyTilt(0);
      onZoomChangeRef.current?.(fitScale);
    }

    if (useTileMode && tileInfo) {
      const doRender = () => {
        if (!tileInfo || !currentImage) return;
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
          layer.removeChildren();
          currentTileLevelRef.current = levelIdx;
        }

        const neededKeys = new Set<string>();
        for (let r = rowStart; r <= rowEnd; r++) {
          for (let c = colStart; c <= colEnd; c++) {
            neededKeys.add(`${currentImage.id}_${levelIdx}_${r}_${c}`);
          }
        }

        for (let i = layer.children.length - 1; i >= 0; i--) {
          const child = layer.children[i];
          if (child.name && !neededKeys.has(child.name)) {
            layer.removeChildAt(i);
          }
        }

        const existingKeys = new Set<string>();
        for (const child of layer.children) {
          if (child.name) existingKeys.add(child.name);
        }

        for (let r = rowStart; r <= rowEnd; r++) {
          for (let c = colStart; c <= colEnd; c++) {
            const key = `${currentImage.id}_${levelIdx}_${r}_${c}`;
            if (existingKeys.has(key)) continue;

            const x = c * tileSize * sfx;
            const y = r * tileSize * sfy;
            const tw = Math.min(tileSize, level.width - c * tileSize);
            const th = Math.min(tileSize, level.height - r * tileSize);
            const dw = tw * sfx;
            const dh = th * sfy;

            const cached = tileCacheRef.current.get(key);
            if (cached) {
              const sprite = new PIXI.Sprite(cached);
              sprite.name = key;
              sprite.x = x;
              sprite.y = y;
              sprite.width = dw;
              sprite.height = dh;
              layer.addChild(sprite);
            } else {
              const placeholder = new PIXI.Graphics();
              placeholder.name = key;
              placeholder.beginFill(0xe5e7eb, 0.3);
              placeholder.drawRect(0, 0, dw, dh);
              placeholder.endFill();
              placeholder.x = x;
              placeholder.y = y;
              layer.addChild(placeholder);

              const url = `${apiBase}/api/tiles/${currentImage.id}/${levelIdx}/${r}/${c}`;
              const tex = PIXI.Texture.from(url, { resourceOptions: { crossorigin: 'anonymous' } });
              if (tex.valid) {
                tileCacheRef.current.set(key, tex);
                layer.removeChild(placeholder);
                const sprite = new PIXI.Sprite(tex);
                sprite.name = key;
                sprite.x = x;
                sprite.y = y;
                sprite.width = dw;
                sprite.height = dh;
                layer.addChild(sprite);
              } else {
                tex.baseTexture.on('loaded', () => {
                  tileCacheRef.current.set(key, tex);
                  if (placeholder.parent) {
                    const sprite = new PIXI.Sprite(tex);
                    sprite.name = key;
                    sprite.x = x;
                    sprite.y = y;
                    sprite.width = dw;
                    sprite.height = dh;
                    const idx = layer.getChildIndex(placeholder);
                    layer.removeChild(placeholder);
                    layer.addChildAt(sprite, Math.min(idx, layer.children.length));
                  }
                });
              }
            }
          }
        }
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

  // ===== Booths (HTML DOM markers — Mapbox style) =====

  // recalcMarkers: called after interaction settles (debounced)
  // Picks up to MAX_MARKERS using center-weighted sampling, applies fade transitions
  function recalcMarkers() {
    const markers = markerElementsRef.current;
    const { scale: sc, x: tx, y: ty, rotation: rot } = transformRef.current;
    const MAX_MARKERS = maxMarkersForScale(sc);
    const { width: cw, height: ch } = canvasDimsRef.current;
    const show = showBoothsRef.current;

    // Get visible booths in viewport
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const scrCorners = [[0, 0], [cw, 0], [cw, ch], [0, ch]];
    const wCorners = scrCorners.map(([sx, sy]) => ({
      x: ((sx - tx) * cosR + (sy - ty) * sinR) / sc,
      y: (-(sx - tx) * sinR + (sy - ty) * cosR) / sc,
    }));
    const bx0 = Math.min(...wCorners.map(c => c.x));
    const by0 = Math.min(...wCorners.map(c => c.y));
    const bx1 = Math.max(...wCorners.map(c => c.x));
    const by1 = Math.max(...wCorners.map(c => c.y));

    const visibleBooths: Booth[] = [];
    for (const booth of boothsRef.current) {
      const cx = booth.x + booth.width / 2;
      const cy = booth.y + booth.height / 2;
      if (show && cx >= bx0 && cx <= bx1 && cy >= by0 && cy <= by1) {
        visibleBooths.push(booth);
      }
    }

    // Compute screen positions for all visible booths
    const boothScreenPos = new Map<number, { sx: number; sy: number }>();
    for (const booth of visibleBooths) {
      const wcx = booth.x + booth.width / 2;
      const wcy = booth.y + booth.height / 2;
      boothScreenPos.set(booth.id, worldToScreen(wcx, wcy));
    }

    const MIN_MARKER_DIST = 60; // px minimum distance between markers

    let newIds: Set<number>;
    if (visibleBooths.length <= MAX_MARKERS) {
      newIds = new Set(visibleBooths.map(b => b.id));
    } else {
      const focusX = cw / 2;
      const focusY = ch * (2 / 3);
      const maxDist = Math.sqrt(cw * cw + ch * ch) / 2;

      // 1) Keep existing stable markers that are still visible AND not too far from focus
      const oldIds = stableIdsRef.current;
      const kept = new Set<number>();
      const keptPositions: { sx: number; sy: number }[] = [];

      // Score old markers — drop those whose probability fell too low
      for (const id of oldIds) {
        const pos = boothScreenPos.get(id);
        if (!pos) continue; // left viewport
        const dist = Math.sqrt((pos.sx - focusX) ** 2 + (pos.sy - focusY) ** 2);
        const normalized = dist / maxDist;
        // Drop if too far (probability < 15%)
        if (normalized > 0.85) continue;
        if (kept.size >= MAX_MARKERS) break;
        kept.add(id);
        keptPositions.push(pos);
      }

      // 2) Fill remaining slots with weighted random selection + minimum distance
      const candidates = visibleBooths.filter(b => !kept.has(b.id));
      const scored: { id: number; weight: number; sx: number; sy: number }[] = [];
      for (const booth of candidates) {
        const pos = boothScreenPos.get(booth.id)!;
        const dist = Math.sqrt((pos.sx - focusX) ** 2 + (pos.sy - focusY) ** 2);
        const normalized = dist / maxDist;
        const weight = Math.exp(-2.5 * normalized * normalized);
        scored.push({ id: booth.id, weight, ...pos });
      }

      // Weighted random selection without replacement, respecting min distance
      const pool = [...scored];
      while (kept.size < MAX_MARKERS && pool.length > 0) {
        const totalWeight = pool.reduce((sum, s) => sum + s.weight, 0);
        if (totalWeight <= 0) break;
        let r = Math.random() * totalWeight;
        let picked = pool.length - 1;
        for (let i = 0; i < pool.length; i++) {
          r -= pool[i].weight;
          if (r <= 0) { picked = i; break; }
        }
        const candidate = pool[picked];
        pool.splice(picked, 1);

        // Check minimum distance from all already-placed markers
        const tooClose = keptPositions.some(p => {
          const dx = p.sx - candidate.sx;
          const dy = p.sy - candidate.sy;
          return dx * dx + dy * dy < MIN_MARKER_DIST * MIN_MARKER_DIST;
        });
        if (tooClose) continue;

        kept.add(candidate.id);
        keptPositions.push({ sx: candidate.sx, sy: candidate.sy });
      }
      newIds = kept;
    }

    const oldIds = stableIdsRef.current;

    // FadeOut markers that are being removed
    for (const id of oldIds) {
      if (!newIds.has(id)) {
        const el = markers.get(id);
        if (el) {
          fadingIdsRef.current.add(id);
          el.style.transition = 'opacity 1s ease-out';
          el.style.opacity = '0';
          setTimeout(() => {
            fadingIdsRef.current.delete(id);
            if (!stableIdsRef.current.has(id)) {
              el.style.display = 'none';
              el.style.transition = '';
            }
          }, 1000);
        }
      }
    }

    // FadeIn new markers
    for (const id of newIds) {
      if (!oldIds.has(id)) {
        const el = markers.get(id);
        if (el) {
          const booth = boothMapRef.current.get(id);
          if (booth) {
            const wcx = booth.x + booth.width / 2;
            const wcy = booth.y + booth.height / 2;
            const { sx, sy } = worldToScreen(wcx, wcy);
            el.style.display = 'flex';
            el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
            fadingIdsRef.current.add(id);
            el.style.opacity = '0';
            el.style.transition = 'none';
            // Force layout flush so browser registers opacity:0 before transition starts
            void el.offsetHeight;
            el.style.transition = 'opacity 1s ease-in';
            el.style.opacity = '1';
            setTimeout(() => {
              fadingIdsRef.current.delete(id);
            }, 1000);
          }
        }
      }
    }

    stableIdsRef.current = newIds;
    prevVisibleIdsRef.current = newIds;
  }

  // updateMarkerPositions: called on every transform change via rAF
  function updateMarkerPositions() {
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
      const cx = booth.x + booth.width / 2;
      const cy = booth.y + booth.height / 2;
      if (show && cx >= bx0 && cx <= bx1 && cy >= by0 && cy <= by1) {
        visibleBooths.push(booth);
      }
    }

    const MAX_MARKERS = maxMarkersForScale(sc);
    const visibleBoothIds = new Set(visibleBooths.map(b => b.id));

    // During interaction: keep stable set, only drop markers that left viewport
    const stable = stableIdsRef.current;
    const currentDisplay = new Set<number>();
    for (const id of stable) {
      if (visibleBoothIds.has(id)) currentDisplay.add(id);
    }

    // Schedule a settle recalculation (debounced 300ms after last interaction)
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      recalcMarkers();
    }, 300);

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

      const wcx = booth.x + booth.width / 2;
      const wcy = booth.y + booth.height / 2;
      const { sx, sy } = worldToScreen(wcx, wcy);

      // Perspective scale: when tilted, markers near top (far) shrink, near bottom (close) grow
      const tilt = transformRef.current.tilt;
      let pScale = 1;
      if (tilt > 0) {
        const normalizedY = Math.max(0, Math.min(1, sy / ch));
        pScale = 0.5 + normalizedY * 0.8;
      }

      // Position update only (no fade logic here — recalcMarkers handles transitions)
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

      // Update label: booth number + company name when zoomed
      const label = el.querySelector('[data-label]') as HTMLElement;
      if (label) {
        const companyName = lnFn(booth.company?.name) || '';
        if (sc >= 1.5 && companyName) {
          label.textContent = `${booth.booth_number}\n${companyName}`;
          label.style.whiteSpace = 'pre-line';
        } else {
          label.textContent = booth.booth_number;
          label.style.whiteSpace = 'nowrap';
        }
      }
    }

    // Save current visible set for next frame comparison
    prevVisibleIdsRef.current = new Set(sampledIds);
  }

  useEffect(() => {
    const overlay = markerOverlayRef.current;
    if (!overlay) return;
    const markers = markerElementsRef.current;
    const currentIds = new Set(booths.map(b => b.id));

    // Remove deleted booths
    for (const [id, el] of markers) {
      if (!currentIds.has(id)) {
        el.remove();
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
        el.style.display = 'flex';
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

        // Booth number label — below pin, black text with white outline
        const label = document.createElement('div');
        label.setAttribute('data-label', '');
        label.textContent = booth.booth_number;
        label.style.fontSize = '12px';
        label.style.fontWeight = '700';
        label.style.fontFamily = 'Inter, sans-serif';
        label.style.color = '#1f2937';
        label.style.textAlign = 'center';
        label.style.whiteSpace = 'nowrap';
        label.style.maxWidth = '90px';
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';
        label.style.marginTop = '1px';
        label.style.textShadow = '-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, 0 0 4px #fff';
        label.style.lineHeight = '1.2';

        el.appendChild(pinSvg);
        el.appendChild(label);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booths]);

  // Redraw markers on style/filter changes
  useEffect(() => {
    updateMarkerPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBoothId, showBooths, activeCategories, categories, ln]);

  // ===== Facilities =====
  useEffect(() => {
    const layer = facilityLayerRef.current;
    layer.removeChildren();
    const sc = transformRef.current.scale;

    for (const fac of visibleFacilities) {
      const style = FACILITY_STYLES[fac.type] || { color: 0x6b7280, label: '?' };
      const r = Math.max(10, 14 / sc);

      const g = new PIXI.Graphics();
      g.lineStyle(2 / sc, 0xffffff);
      g.beginFill(style.color, 0.9);
      g.drawCircle(0, 0, r);
      g.endFill();
      g.x = fac.x;
      g.y = fac.y;
      layer.addChild(g);

      const text = new PIXI.Text(style.label, {
        fontSize: Math.max(7, 9 / sc),
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
    applyZoom(transformRef.current.scale * 1.3, cw / 2, ch / 2);
  }

  function zoomOut() {
    const { width: cw, height: ch } = canvasDimsRef.current;
    applyZoom(transformRef.current.scale / 1.3, cw / 2, ch / 2);
  }

  function panToBooth(booth: Booth) {
    const mc = mainContainerRef.current;
    if (!mc) return;
    const { width: cw, height: ch } = canvasDimsRef.current;
    const sc = transformRef.current.scale;
    const centerX = booth.x + booth.width / 2;
    const centerY = booth.y + booth.height / 2;
    transformRef.current.x = cw / 2 - centerX * sc;
    transformRef.current.y = ch / 2 - centerY * sc;
    clampPosition(transformRef.current);
    mc.position.set(transformRef.current.x, transformRef.current.y);
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
    mc.position.set(transformRef.current.x, transformRef.current.y);
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
    mc.position.set(transformRef.current.x, transformRef.current.y);
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
      (window as unknown as Record<string, unknown>).__mapViewerResetView = resetView;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensions]);

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ touchAction: 'none', overscrollBehavior: 'none' }}>
      {/* HTML DOM marker overlay — sits above canvas, pointer-events pass through except on markers */}
      <div
        ref={markerOverlayRef}
        className="absolute inset-0 overflow-hidden"
        style={{ pointerEvents: 'none', zIndex: 5 }}
      />
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
