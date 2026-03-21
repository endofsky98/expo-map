import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as PIXI from 'pixi.js';
import { Booth, Hall, Category, MapImage, Facility, RoutePoint, Obstacle, ZoomLevel, RouteResult } from '@/types';
import { useI18n } from '@/lib/i18n';
import {
  MapViewerProps, TileInfo, CurrentPosition, FACILITY_STYLES,
  MIN_ZOOM, MAX_ZOOM, MIN_TILT, MAX_TILT, MIN_BOOTH_SCREEN_SIZE,
  CLICK_THRESHOLD, CLICK_TIME_THRESHOLD, ROTATION_THRESHOLD, ZOOM_THRESHOLD, MIN_MARKER_DIST,
  parseZoomLevels, hexStringToNumber, selectTileLevel,
} from './mapTypes';
import { attachPointerEvents } from './useMapPointerEvents';
import { TileStateManager } from './TileState';
import { clusterBooths, selectRepresentative, getBoothDisplayName, CLUSTER_RADIUS, CLUSTER_MAX_ZOOM, CLUSTER_ANIM_MS } from './clusterUtils';
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
  // Track tile load failures to avoid infinite retry loops (max 3 retries per tile)
  const tileFailCountRef = useRef<Map<string, number>>(new Map());
  const tileStateRef = useRef<TileStateManager | null>(null);

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

  const routeFacilityMarkers = useMemo(() => {
    if (!routeResult?.facilities_used || !currentFloorId) return [];
    return routeResult.facilities_used.filter((f) => f.floor_id === currentFloorId);
  }, [routeResult, currentFloorId]);

  const imgWidth = currentImage?.width || 800;
  const imgHeight = currentImage?.height || 600;

  // Refs for data accessed in click handler closure
  const boothsRef = useRef(booths);
  boothsRef.current = booths;
  const hallsRef = useRef<Hall[]>(halls);
  hallsRef.current = halls;
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

  // PIXI cluster shading layer ref
  const clusterContainerRef = useRef<PIXI.Container | null>(null);
  const clusterGfxRef = useRef<PIXI.Graphics | null>(null);
  const clusterBadgesRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const clusterBadgeWorldRef = useRef<Map<string, { wx: number; wy: number }>>(new Map());
  // 대표 부스 → 클러스터 중앙 world 좌표 (boothId → {wx, wy})
  const clusterRepCenterRef = useRef<Map<number, { wx: number; wy: number }>>(new Map());

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
      renderTilesFnRef.current();
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
    mainContainerRef.current = mainContainer;

    // ===== Pointer events — extracted to useMapPointerEvents.ts =====
    const cleanupPointers = attachPointerEvents({
      canvas, el, mainContainer, transformRef, canvasDimsRef, mainContainerRef,
      velocityRef, inertiaRafRef, animZoomRafRef,
      boothsRef, visibleFacilitiesRef, currentFloorIdRef,
      onBoothClickRef, onMapClickRef,
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
      app.destroy(true);
      pixiApp.current = null;
      mainContainerRef.current = null;
      canvasRef.current = null;
      clusterGfxRef.current = null;
      clusterContainerRef.current = null;
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
    }

    if (useTileMode && tileInfo) {
      // Initialize TileStateManager if needed
      if (!tileStateRef.current) {
        tileStateRef.current = new TileStateManager(
          layer, tileCacheRef.current, apiBase, tileDirtyRef,
        );
      }

      const doRender = () => {
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

  // recalcMarkers: called after interaction settles (debounced ~300ms)
  // Clusters visible booths → PIXI shading + DOM pin markers with optional count badge
  function recalcMarkers() {
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
      const cx = booth.x + booth.width / 2;
      const cy = booth.y + booth.height / 2;
      if (show && cx >= bx0 && cx <= bx1 && cy >= by0 && cy <= by1) {
        visibleBooths.push(booth);
      }
    }

    // Cluster or show individually based on zoom
    const forceIndividual = sc >= CLUSTER_MAX_ZOOM;
    const radius = forceIndividual ? 0 : CLUSTER_RADIUS;
    const clusters = clusterBooths(visibleBooths, worldToScreen, radius);

    // Draw PIXI cluster shading (world coordinates — auto follows pan/zoom)
    if (clusterGfx) {
      clusterGfx.clear();
      for (const c of clusters) {
        if (c.isCluster && c.count > 1) {
          const pad = 20;
          clusterGfx.lineStyle(1.5, 0x4f46e5, 0.2);
          clusterGfx.beginFill(0x4f46e5, 0.08);
          clusterGfx.drawRoundedRect(
            c.bboxX - pad,
            c.bboxY - pad,
            c.bboxW + pad * 2,
            c.bboxH + pad * 2,
            12,
          );
          clusterGfx.endFill();
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

    // Determine which booth IDs to show as pins + cluster badge info
    const newIds = new Set<number>();
    // clusterKey → { boothId, count }
    const clusterReps = new Map<string, { boothId: number; count: number }>();

    for (const c of clusters) {
      if (!c.isCluster || c.count === 1) {
        // Individual marker
        newIds.add(c.boothIds[0]);
      } else {
        // Cluster: pick representative
        const rep = selectRepresentative(c.boothIds, boothsRef.current, hallsRef.current);
        if (rep.booth) {
          newIds.add(rep.booth.id);
          clusterReps.set(c.id, { boothId: rep.booth.id, count: c.count });
        } else if (c.boothIds.length > 0) {
          // Fallback: use first booth id
          newIds.add(c.boothIds[0]);
          clusterReps.set(c.id, { boothId: c.boothIds[0], count: c.count });
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

    const oldIds = stableIdsRef.current;

    // FadeOut markers that are being removed
    for (const id of oldIds) {
      if (!newIds.has(id)) {
        const el = markers.get(id);
        if (el) {
          fadingIdsRef.current.add(id);
          el.style.transition = `opacity ${CLUSTER_ANIM_MS}ms ease-out`;
          el.style.opacity = '0';
          setTimeout(() => {
            fadingIdsRef.current.delete(id);
            if (!stableIdsRef.current.has(id)) {
              el.style.display = 'none';
              el.style.transition = '';
              // Remove badge when hidden
              const badge = el.querySelector('[data-badge]') as HTMLElement | null;
              if (badge) badge.style.display = 'none';
            }
          }, CLUSTER_ANIM_MS);
        }
      }
    }

    // FadeIn new markers + update badges
    for (const id of newIds) {
      const el = markers.get(id);
      if (!el) continue;

      if (!oldIds.has(id)) {
        // New marker: fade in (클러스터 대표면 영역 중앙에 위치)
        const booth = boothMapRef.current.get(id);
        if (booth) {
          const center = clusterRepCenterRef.current.get(id);
          const wcx = center ? center.wx : booth.x + booth.width / 2;
          const wcy = center ? center.wy : booth.y + booth.height / 2;
          const { sx, sy } = worldToScreen(wcx, wcy);
          el.style.display = 'flex';
          el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
          fadingIdsRef.current.add(id);
          el.style.opacity = '0';
          el.style.transition = 'none';
          void el.offsetHeight; // force layout flush
          el.style.transition = `opacity ${CLUSTER_ANIM_MS}ms ease-in`;
          el.style.opacity = '1';
          setTimeout(() => {
            fadingIdsRef.current.delete(id);
          }, CLUSTER_ANIM_MS);
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
            'min-width:36px;height:36px;border-radius:18px;' +
            'background:rgba(79,70,229,0.85);color:#fff;' +
            'font-size:16px;font-weight:700;font-family:Inter,sans-serif;' +
            'display:flex;align-items:center;justify-content:center;' +
            'padding:0 8px;' +
            'box-shadow:0 2px 6px rgba(0,0,0,0.25);z-index:20;';
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
          badge.remove();
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
      const wcx = center ? center.wx : booth.x + booth.width / 2;
      const wcy = center ? center.wy : booth.y + booth.height / 2;
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

      // Update label: 부스번호(위 작은) + 회사명(아래 큰)
      const nameEl = el.querySelector('[data-name]') as HTMLElement;
      const numEl = el.querySelector('[data-num]') as HTMLElement;
      const labelEl = el.querySelector('[data-label]') as HTMLElement;
      if (nameEl) {
        const companyName = lnFn(booth.company?.name) || '';
        nameEl.textContent = companyName || booth.booth_number;
        // 회사명이 있으면 부스번호 표시, 없으면 숨기기
        if (numEl) {
          numEl.textContent = booth.booth_number;
          numEl.style.display = companyName ? '' : 'none';
        } else if (companyName && labelEl) {
          // numEl 없으면 생성
          const ns = document.createElement('div');
          ns.setAttribute('data-num', '');
          ns.textContent = booth.booth_number;
          ns.style.fontSize = '12px'; ns.style.fontWeight = '500';
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

        // Label wrapper
        const label = document.createElement('div');
        label.setAttribute('data-label', '');
        label.style.textAlign = 'center';
        label.style.marginTop = '1px';
        label.style.lineHeight = '1.2';

        // 부스번호 (위, 작은 글씨)
        const numSpan = document.createElement('div');
        numSpan.setAttribute('data-num', '');
        numSpan.textContent = booth.booth_number;
        numSpan.style.fontSize = '12px';
        numSpan.style.fontWeight = '500';
        numSpan.style.color = '#6b7280';
        numSpan.style.whiteSpace = 'nowrap';
        numSpan.style.textShadow = '-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff';

        // 회사명 (아래, 큰 글씨)
        const nameSpan = document.createElement('div');
        nameSpan.setAttribute('data-name', '');
        const initCompanyName = lnRef.current(booth.company?.name) || '';
        nameSpan.textContent = initCompanyName || booth.booth_number;
        nameSpan.style.fontSize = '24px';
        nameSpan.style.fontWeight = '700';
        nameSpan.style.fontFamily = 'Inter, sans-serif';
        nameSpan.style.color = '#1f2937';
        nameSpan.style.whiteSpace = 'nowrap';
        nameSpan.style.overflow = 'visible';
        nameSpan.style.textShadow = '-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, 0 0 4px #fff';

        // 회사명 있으면 부스번호+회사명, 없으면 회사명 자리에 부스번호만
        if (initCompanyName) {
          label.appendChild(numSpan);
        }
        label.appendChild(nameSpan);

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
    const centerX = booth.x + booth.width / 2;
    const centerY = booth.y + booth.height / 2;
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
      (window as unknown as Record<string, unknown>).__mapViewerResetView = resetView;
      (window as unknown as Record<string, unknown>).__mapViewerSetTilt = (deg: number) => applyTilt(deg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensions]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden" style={{ touchAction: 'none', overscrollBehavior: 'none', background: '#ffffff' }}>

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
