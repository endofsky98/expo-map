import { useState, useRef, useEffect, useMemo } from 'react';
import * as PIXI from 'pixi.js';
import { Booth, Facility, RoutePoint, RouteResult } from '@/types';
import { useI18n } from '@/lib/i18n';
import {
  MapViewerProps, MapTransform, TileInfo, FACILITY_STYLES,
  MIN_ZOOM, MAX_ZOOM, MIN_TILT, MAX_TILT, CANVAS_PAD, MIN_MARKER_DIST,
} from './mapTypes';
import {
  selectTileLevel, worldToScreen, clampPosition, maxMarkersForScale,
  parseZoomLevels, resolveImageUrl, viewportToWorldBounds,
} from './mapUtils';
import { TileManager } from './TileManager';
import { attachPointerEvents, PointerRefs, PointerCallbacks } from './useMapPointerEvents';

export default function MapViewer({
  booths, categories, currentImage, selectedBoothId, activeCategories,
  facilities, hiddenFacilityTypes, obstacles, routePath, routeResult,
  currentFloorId, currentPosition, showBooths, prefetchRange,
  onBoothClick, onMapClick, onZoomChange,
}: MapViewerProps) {
  const { ln } = useI18n();
  const [facilityTooltip, setFacilityTooltip] = useState<{ facility: Facility; screenX: number; screenY: number } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const containerRef = useRef<HTMLDivElement>(null);
  const pixiApp = useRef<PIXI.Application | null>(null);
  const mainContainerRef = useRef<PIXI.Container | null>(null);
  const transformRef = useRef<MapTransform>({ x: 0, y: 0, scale: 1, rotation: 0, tilt: 0 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasDimsRef = useRef({ width: 800, height: 600 });
  const canvasPadRef = useRef({ left: 0, top: 0 });
  const tiltWrapperRef = useRef<HTMLDivElement | null>(null);

  // Layers
  const tileLayerRef = useRef(new PIXI.Container());
  const obstacleLayerRef = useRef(new PIXI.Container());
  const routeLayerRef = useRef(new PIXI.Container());
  const facilityLayerRef = useRef(new PIXI.Container());
  const overlayLayerRef = useRef(new PIXI.Container());

  // Tile management
  const tileCacheRef = useRef<Map<string, PIXI.Texture>>(new Map());
  const tileManagerRef = useRef<TileManager | null>(null);
  const currentImageIdRef = useRef<number | null>(null);
  const renderTilesFnRef = useRef<() => void>(() => {});
  const tileDirtyRef = useRef(false);

  // Callback refs
  const onBoothClickRef = useRef(onBoothClick);
  const onMapClickRef = useRef(onMapClick);
  const onZoomChangeRef = useRef(onZoomChange);
  onBoothClickRef.current = onBoothClick;
  onMapClickRef.current = onMapClick;
  onZoomChangeRef.current = onZoomChange;

  // Marker refs
  const markerOverlayRef = useRef<HTMLDivElement | null>(null);
  const markerElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const rafIdRef = useRef(0);
  const prevVisibleIdsRef = useRef<Set<number>>(new Set());
  const stableIdsRef = useRef<Set<number>>(new Set());
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadingIdsRef = useRef<Set<number>>(new Set());
  const inertiaRafRef = useRef(0);
  const velocityRef = useRef({ vx: 0, vy: 0 });
  const animZoomRafRef = useRef(0);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8008';

  const tileInfo = useMemo((): TileInfo | null => {
    if (!currentImage?.tile_info) return null;
    try { return typeof currentImage.tile_info === 'string' ? JSON.parse(currentImage.tile_info) : currentImage.tile_info; }
    catch { return null; }
  }, [currentImage]);

  const categoryColorMap = useMemo(() => {
    const m: Record<number, string> = {};
    categories.forEach(c => { m[c.id] = c.color; });
    return m;
  }, [categories]);

  // Refs updated each render
  const showBoothsRef = useRef(showBooths); showBoothsRef.current = showBooths;
  const selectedBoothIdRef = useRef(selectedBoothId); selectedBoothIdRef.current = selectedBoothId;
  const activeCategoriesRef = useRef(activeCategories); activeCategoriesRef.current = activeCategories;
  const categoryColorMapRef = useRef(categoryColorMap); categoryColorMapRef.current = categoryColorMap;
  const lnRef = useRef(ln); lnRef.current = ln;
  const boothsRef = useRef(booths); boothsRef.current = booths;
  const boothMapRef = useRef<Map<number, Booth>>(new Map());
  const visibleFacilitiesRef = useRef<Facility[]>([]);
  const currentFloorIdRef = useRef(currentFloorId); currentFloorIdRef.current = currentFloorId;

  const visibleFacilities = useMemo(() =>
    facilities.filter(f => f.is_active && !hiddenFacilityTypes.has(f.type)),
    [facilities, hiddenFacilityTypes]);
  visibleFacilitiesRef.current = visibleFacilities;

  useEffect(() => {
    const m = new Map<number, Booth>();
    for (const b of booths) m.set(b.id, b);
    boothMapRef.current = m;
  }, [booths]);

  const currentRoutePoints = useMemo(() => {
    if (!routePath || !currentFloorId) return null;
    const pts = routePath.filter(p => p.floor_id === currentFloorId).map(p => ({ x: p.x, y: p.y }));
    return pts.length >= 2 ? pts : null;
  }, [routePath, currentFloorId]);

  const routeTransitionMarkers = useMemo(() => {
    if (!routePath || !currentFloorId || routePath.length < 2) return [];
    return routePath.reduce((acc: any[], p, i) => {
      if (p.floor_id !== currentFloorId) return acc;
      const prev = i > 0 ? routePath[i - 1] : null;
      const next = i < routePath.length - 1 ? routePath[i + 1] : null;
      if (i === 0) acc.push({ x: p.x, y: p.y, type: 'start', label: 'S' });
      else if (i === routePath.length - 1) acc.push({ x: p.x, y: p.y, type: 'end', label: 'D' });
      else if (prev?.floor_id !== currentFloorId) acc.push({ x: p.x, y: p.y, type: 'transition', label: '▼' });
      else if (next?.floor_id !== currentFloorId) acc.push({ x: p.x, y: p.y, type: 'transition', label: '▲' });
      return acc;
    }, []);
  }, [routePath, currentFloorId]);

  const routeFacilityMarkers = useMemo(() =>
    routeResult?.facilities_used?.filter(f => f.floor_id === currentFloorId) || [],
    [routeResult, currentFloorId]);

  const imgWidth = currentImage?.width || 800;
  const imgHeight = currentImage?.height || 600;

  // ===== Helpers =====
  function scheduleRenderTiles() { tileDirtyRef.current = true; }

  function syncContainerPosition(mc: PIXI.Container, t: { x: number; y: number }) {
    const pad = canvasPadRef.current;
    mc.position.set(t.x + pad.left, t.y + pad.top);
  }

  function scheduleMarkerUpdate() {
    if (rafIdRef.current) return;
    rafIdRef.current = requestAnimationFrame(() => { rafIdRef.current = 0; updateMarkerPositions(); });
  }

  function applyTilt(tilt: number) {
    const clamped = Math.max(MIN_TILT, Math.min(MAX_TILT, tilt));
    transformRef.current.tilt = clamped;
    // Apply CSS perspective to tilt wrapper (contains both canvas and marker overlay)
    const wrapper = tiltWrapperRef.current;
    if (clamped === 0) {
      if (wrapper) { wrapper.style.transform = ''; wrapper.style.transformOrigin = ''; }
    } else {
      const rad = (clamped * Math.PI) / 180;
      const scaleX = 1 / Math.cos(rad);
      const { width: vw, height: vh } = canvasDimsRef.current;
      // Origin at center horizontally, 30% from top vertically (within visible area)
      const ox = '50';
      const oy = '30';
      if (wrapper) {
        wrapper.style.transform = `perspective(800px) rotateX(${clamped}deg) scaleX(${scaleX.toFixed(4)})`;
        wrapper.style.transformOrigin = `${ox}% ${oy}%`;
      }
    }
    scheduleRenderTiles();
    scheduleMarkerUpdate();
  }

  // ===== PIXI init =====
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const w = el.offsetWidth || 800, h = el.offsetHeight || 600;
    canvasDimsRef.current = { width: w, height: h };

    const cw = Math.round(w * (1 + CANVAS_PAD * 2));
    const ch = Math.round(h * (1 + CANVAS_PAD));
    const padLeft = Math.round(w * CANVAS_PAD);
    const padTop = Math.round(h * CANVAS_PAD);

    const app = new PIXI.Application({
      width: cw, height: ch, backgroundAlpha: 0, antialias: true,
      resolution: window.devicePixelRatio || 1, autoDensity: true,
    });
    // Append canvas to tilt wrapper (so CSS tilt applies to both canvas and markers)
    const tiltWrapper = tiltWrapperRef.current || el;
    tiltWrapper.appendChild(app.view as HTMLCanvasElement);
    const canvas = app.view as HTMLCanvasElement;
    canvasRef.current = canvas;
    Object.assign(canvas.style, {
      touchAction: 'none', userSelect: 'none', overscrollBehavior: 'none',
      cursor: 'grab', position: 'absolute',
      width: `${cw}px`, height: `${ch}px`, left: `${-padLeft}px`, top: `${-padTop}px`,
    });
    canvasPadRef.current = { left: padLeft, top: padTop };

    const mc = new PIXI.Container();
    app.stage.addChild(mc);
    [tileLayerRef, obstacleLayerRef, routeLayerRef, facilityLayerRef, overlayLayerRef]
      .forEach(ref => mc.addChild(ref.current));
    mainContainerRef.current = mc;

    // TileManager
    tileManagerRef.current = new TileManager(tileLayerRef.current, apiBase, tileCacheRef.current);

    // Pointer events
    const pRefs: PointerRefs = {
      transformRef, canvasDimsRef, mainContainerRef, velocityRef,
      inertiaRafRef, animZoomRafRef, tileDirtyRef, renderTilesFnRef,
      boothsRef, visibleFacilitiesRef, currentFloorIdRef,
      onBoothClickRef, onMapClickRef, onZoomChangeRef,
    };
    const pCbs: PointerCallbacks = {
      syncContainerPosition, scheduleRenderTiles, scheduleMarkerUpdate,
      applyTilt, setFacilityTooltip,
    };
    const cleanupPointers = attachPointerEvents(canvas, el, pRefs, pCbs, imgWidth, imgHeight);

    pixiApp.current = app;
    setDimensions({ width: w, height: h });

    // ResizeObserver
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width: rw, height: rh } = entry.contentRect;
        if (rw > 0 && rh > 0) {
          const ncw = Math.round(rw * (1 + CANVAS_PAD * 2));
          const nch = Math.round(rh * (1 + CANVAS_PAD));
          const npl = Math.round(rw * CANVAS_PAD);
          const npt = Math.round(rh * CANVAS_PAD);
          app.renderer.resize(ncw, nch);
          canvasDimsRef.current = { width: rw, height: rh };
          canvasPadRef.current = { left: npl, top: npt };
          Object.assign(canvas.style, { width: `${ncw}px`, height: `${nch}px`, left: `${-npl}px`, top: `${-npt}px` });
          syncContainerPosition(mc, transformRef.current);
          setDimensions({ width: rw, height: rh });
        }
      }
    });
    ro.observe(el);

    // Mapbox-style render loop — check dirty flag every pixi frame
    const tickerFn = () => {
      if (tileDirtyRef.current) {
        tileDirtyRef.current = false;
        renderTilesFnRef.current();
      }
      // Also check TileManager dirty (retry timers)
      if (tileManagerRef.current?.isDirty()) {
        tileManagerRef.current.clearDirty();
        renderTilesFnRef.current();
      }
    };
    app.ticker.add(tickerFn);

    return () => {
      cleanupPointers();
      app.ticker.remove(tickerFn);
      ro.disconnect();
      tileManagerRef.current?.destroy();
      app.destroy(true);
      pixiApp.current = null;
      mainContainerRef.current = null;
      canvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Tile rendering =====
  useEffect(() => {
    const mc = mainContainerRef.current;
    if (!mc || !currentImage) return;

    const imageChanged = currentImage.id !== currentImageIdRef.current;
    if (imageChanged) {
      tileCacheRef.current.forEach(t => t.destroy(true));
      tileCacheRef.current.clear();
      tileManagerRef.current?.clear();
      currentImageIdRef.current = currentImage.id;
    }

    if (imageChanged) {
      const { width: cw, height: ch } = canvasDimsRef.current;
      const minFit = Math.max(cw / imgWidth, ch / imgHeight);
      const fit = Math.max(minFit, Math.min(cw / imgWidth, ch / imgHeight) * 0.9);
      transformRef.current = { scale: fit, x: (cw - imgWidth * fit) / 2, y: (ch - imgHeight * fit) / 2, rotation: 0, tilt: 0 };
      clampPosition(transformRef.current, imgWidth, imgHeight, cw, ch);
      syncContainerPosition(mc, transformRef.current);
      mc.scale.set(fit); mc.rotation = 0;
      applyTilt(0);
      onZoomChangeRef.current?.(fit);
    }

    if (tileInfo) {
      const doRender = () => {
        if (!tileInfo || !currentImage) return;
        const { x: tx, y: ty, scale: sc, rotation: rot } = transformRef.current;
        const { width: cw, height: ch } = canvasDimsRef.current;
        const levelIdx = selectTileLevel(sc, tileInfo);
        const level = tileInfo.levels[levelIdx];
        if (!level) return;
        const tileSize = tileInfo.tile_size;
        const sfx = imgWidth / level.width;
        const sfy = imgHeight / level.height;
        const bounds = viewportToWorldBounds(tx, ty, sc, rot, cw, ch);
        const colStart = Math.max(0, Math.floor((bounds.x / sfx) / tileSize) - prefetchRange);
        const colEnd = Math.min(level.cols - 1, Math.ceil(((bounds.x + bounds.w) / sfx) / tileSize) + prefetchRange);
        const rowStart = Math.max(0, Math.floor((bounds.y / sfy) / tileSize) - prefetchRange);
        const rowEnd = Math.min(level.rows - 1, Math.ceil(((bounds.y + bounds.h) / sfy) / tileSize) + prefetchRange);

        tileManagerRef.current?.update(
          currentImage.id, levelIdx,
          level.cols, level.rows, tileSize, sfx, sfy,
          level.width, level.height,
          colStart, colEnd, rowStart, rowEnd,
        );
      };
      renderTilesFnRef.current = doRender;
      doRender();
    } else {
      renderTilesFnRef.current = () => {};
      tileLayerRef.current.removeChildren();
      const zl = parseZoomLevels(currentImage);
      let url: string;
      if (zl.length > 0) {
        const sc = transformRef.current.scale;
        const norm = Math.max(0, Math.min(1, (sc - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)));
        url = zl[Math.min(zl.length - 1, Math.floor(norm * zl.length))].path;
      } else { url = currentImage.medium_path; }
      url = resolveImageUrl(url, apiBase);
      const tex = PIXI.Texture.from(url, { resourceOptions: { crossorigin: 'anonymous' } });
      const sprite = new PIXI.Sprite(tex);
      sprite.width = imgWidth; sprite.height = imgHeight;
      tileLayerRef.current.addChild(sprite);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentImage, tileInfo, imgWidth, imgHeight, prefetchRange]);

  // ===== Obstacles =====
  useEffect(() => {
    const layer = obstacleLayerRef.current;
    layer.removeChildren();
    const sc = transformRef.current.scale;
    for (const obs of obstacles) {
      const g = new PIXI.Graphics();
      g.lineStyle(1 / sc, 0x6b7280); g.beginFill(0x9ca3af, 0.5);
      if (obs.shape === 'circle' && obs.radius) g.drawCircle(obs.x, obs.y, obs.radius);
      else g.drawRoundedRect(obs.x, obs.y, obs.width || 40, obs.height || 40, 2 / sc);
      g.endFill(); layer.addChild(g);
    }
  }, [obstacles]);

  // ===== Route =====
  useEffect(() => {
    const layer = routeLayerRef.current;
    layer.removeChildren();
    if (!currentRoutePoints || currentRoutePoints.length < 2) return;
    const sc = transformRef.current.scale;
    const shadow = new PIXI.Graphics();
    shadow.lineStyle(5 / sc, 0x1e1b4b, 0.15);
    shadow.moveTo(currentRoutePoints[0].x, currentRoutePoints[0].y);
    currentRoutePoints.slice(1).forEach(p => shadow.lineTo(p.x, p.y));
    layer.addChild(shadow);
    const line = new PIXI.Graphics();
    line.lineStyle(3 / sc, 0x4f46e5, 0.85);
    line.moveTo(currentRoutePoints[0].x, currentRoutePoints[0].y);
    currentRoutePoints.slice(1).forEach(p => line.lineTo(p.x, p.y));
    layer.addChild(line);
    for (const m of routeTransitionMarkers) {
      const r = Math.max(10, 14 / sc);
      const color = m.type === 'start' ? 0x22c55e : m.type === 'end' ? 0xef4444 : 0xf59e0b;
      const g = new PIXI.Graphics();
      g.lineStyle(2 / sc, 0xffffff); g.beginFill(color, 0.95); g.drawCircle(0, 0, r); g.endFill();
      g.x = m.x; g.y = m.y; layer.addChild(g);
      const t = new PIXI.Text(m.label, { fontSize: Math.max(7, 9 / sc), fontFamily: 'Inter,sans-serif', fontWeight: 'bold', fill: 'white', align: 'center' });
      t.anchor.set(0.5); t.x = m.x; t.y = m.y; layer.addChild(t);
    }
    for (const fac of routeFacilityMarkers) {
      const r = Math.max(12, 16 / sc);
      const label = fac.type === 'stairs' ? 'S' : fac.type === 'elevator' ? 'EV' : fac.type === 'escalator' ? 'ES' : '?';
      const g = new PIXI.Graphics();
      g.lineStyle(2 / sc, 0xffffff); g.beginFill(0xf97316, 0.9); g.drawCircle(0, 0, r); g.endFill();
      g.x = fac.x; g.y = fac.y; layer.addChild(g);
      const t = new PIXI.Text(label, { fontSize: Math.max(6, 8 / sc), fontFamily: 'Inter,sans-serif', fontWeight: 'bold', fill: 'white', align: 'center' });
      t.anchor.set(0.5); t.x = fac.x; t.y = fac.y; layer.addChild(t);
    }
  }, [currentRoutePoints, routeTransitionMarkers, routeFacilityMarkers]);

  // ===== Booth markers (DOM overlay) =====
  function recalcMarkers() {
    const markers = markerElementsRef.current;
    const { scale: sc, x: tx, y: ty, rotation: rot } = transformRef.current;
    const MAX_MARKERS = maxMarkersForScale(sc);
    const { width: cw, height: ch } = canvasDimsRef.current;
    const show = showBoothsRef.current;
    const bounds = viewportToWorldBounds(tx, ty, sc, rot, cw, ch);
    const visible = boothsRef.current.filter(b => {
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      return show && cx >= bounds.x && cx <= bounds.x + bounds.w && cy >= bounds.y && cy <= bounds.y + bounds.h;
    });
    const screenPos = new Map<number, { sx: number; sy: number }>();
    for (const b of visible) screenPos.set(b.id, worldToScreen(b.x + b.width / 2, b.y + b.height / 2, transformRef.current, cw, ch));

    let newIds: Set<number>;
    if (visible.length <= MAX_MARKERS) {
      newIds = new Set(visible.map(b => b.id));
    } else {
      const fx = cw / 2, fy = ch * (2 / 3), maxD = Math.sqrt(cw * cw + ch * ch) / 2;
      const kept = new Set<number>(), kPos: { sx: number; sy: number }[] = [];
      for (const id of stableIdsRef.current) {
        const pos = screenPos.get(id); if (!pos) continue;
        const d = Math.sqrt((pos.sx - fx) ** 2 + (pos.sy - fy) ** 2);
        if (d / maxD > 0.85 || kept.size >= MAX_MARKERS) continue;
        kept.add(id); kPos.push(pos);
      }
      const pool = visible.filter(b => !kept.has(b.id)).map(b => {
        const pos = screenPos.get(b.id)!;
        const d = Math.sqrt((pos.sx - fx) ** 2 + (pos.sy - fy) ** 2);
        return { id: b.id, weight: Math.exp(-2.5 * (d / maxD) ** 2), ...pos };
      });
      while (kept.size < MAX_MARKERS && pool.length > 0) {
        const tw = pool.reduce((s, p) => s + p.weight, 0); if (tw <= 0) break;
        let r = Math.random() * tw, pi = pool.length - 1;
        for (let i = 0; i < pool.length; i++) { r -= pool[i].weight; if (r <= 0) { pi = i; break; } }
        const c = pool.splice(pi, 1)[0];
        if (!kPos.some(p => (p.sx - c.sx) ** 2 + (p.sy - c.sy) ** 2 < MIN_MARKER_DIST ** 2)) {
          kept.add(c.id); kPos.push({ sx: c.sx, sy: c.sy });
        }
      }
      newIds = kept;
    }

    const oldIds = stableIdsRef.current;
    for (const id of oldIds) {
      if (!newIds.has(id)) {
        const el = markers.get(id);
        if (el) {
          fadingIdsRef.current.add(id);
          el.style.transition = 'opacity 1s ease-out'; el.style.opacity = '0';
          setTimeout(() => { fadingIdsRef.current.delete(id); if (!stableIdsRef.current.has(id)) { el.style.display = 'none'; el.style.transition = ''; } }, 1000);
        }
      }
    }
    for (const id of newIds) {
      if (!oldIds.has(id)) {
        const el = markers.get(id);
        if (el) {
          const b = boothMapRef.current.get(id);
          if (b) {
            const { sx, sy } = worldToScreen(b.x + b.width / 2, b.y + b.height / 2, transformRef.current, cw, ch);
            el.style.display = 'flex';
            el.style.transform = `translate(${sx}px,${sy}px) translate(-50%,-100%)`;
            fadingIdsRef.current.add(id);
            el.style.opacity = '0'; el.style.transition = 'none';
            void el.offsetHeight;
            el.style.transition = 'opacity 1s ease-in'; el.style.opacity = '1';
            setTimeout(() => { fadingIdsRef.current.delete(id); }, 1000);
          }
        }
      }
    }
    stableIdsRef.current = newIds;
    prevVisibleIdsRef.current = newIds;
  }

  function updateMarkerPositions() {
    if (!markerOverlayRef.current) return;
    const markers = markerElementsRef.current;
    const { scale: sc, x: tx, y: ty, rotation: rot } = transformRef.current;
    const { width: cw, height: ch } = canvasDimsRef.current;
    const show = showBoothsRef.current;
    const selId = selectedBoothIdRef.current;
    const actCats = activeCategoriesRef.current;
    const catColors = categoryColorMapRef.current;
    const bounds = viewportToWorldBounds(tx, ty, sc, rot, cw, ch);
    const stable = stableIdsRef.current;

    const currentDisplay = new Set<number>();
    for (const id of stable) {
      const b = boothMapRef.current.get(id); if (!b) continue;
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      if (show && cx >= bounds.x && cx <= bounds.x + bounds.w && cy >= bounds.y && cy <= bounds.y + bounds.h)
        currentDisplay.add(id);
    }

    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => { recalcMarkers(); }, 300);

    for (const booth of boothsRef.current) {
      const el = markers.get(booth.id); if (!el) continue;
      const shown = currentDisplay.has(booth.id);
      if (!shown) {
        if (!prevVisibleIdsRef.current.has(booth.id) && !fadingIdsRef.current.has(booth.id)) el.style.display = 'none';
        continue;
      }
      const { sx, sy } = worldToScreen(booth.x + booth.width / 2, booth.y + booth.height / 2, transformRef.current, cw, ch);
      el.style.display = 'flex';
      el.style.transform = `translate(${sx}px,${sy}px) translate(-50%,-100%)`;
      if (!fadingIdsRef.current.has(booth.id)) {
        el.style.opacity = String(actCats.size === 0 ? 1 : (booth.category_id && actCats.has(booth.category_id) ? 1 : 0.2));
      }
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
      const label = el.querySelector('[data-label]') as HTMLElement;
      if (label) {
        const company = lnRef.current(booth.company?.name) || '';
        if (sc >= 1.5 && company) { label.textContent = `${booth.booth_number}\n${company}`; label.style.whiteSpace = 'pre-line'; }
        else { label.textContent = booth.booth_number; label.style.whiteSpace = 'nowrap'; }
      }
    }
    prevVisibleIdsRef.current = new Set(currentDisplay);
  }

  useEffect(() => {
    const overlay = markerOverlayRef.current; if (!overlay) return;
    const markers = markerElementsRef.current;
    const cur = new Set(booths.map(b => b.id));
    for (const [id, el] of markers) { if (!cur.has(id)) { el.remove(); markers.delete(id); } }
    for (const booth of booths) {
      if (markers.has(booth.id)) continue;
      const el = document.createElement('div');
      el.className = 'booth-marker';
      Object.assign(el.style, {
        position: 'absolute', left: '0', top: '0', willChange: 'transform',
        pointerEvents: 'auto', cursor: 'pointer', zIndex: '10',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      });
      const fill = booth.color || (booth.category_id && categoryColorMap[booth.category_id]) || '#ef4444';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '14'); svg.setAttribute('height', '18'); svg.setAttribute('viewBox', '0 0 28 36');
      svg.style.filter = 'drop-shadow(0 2px 3px rgba(0,0,0,0.35))';
      svg.innerHTML =
        `<path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="${fill}" stroke="#fff" stroke-width="2.5"/>` +
        `<circle cx="14" cy="14" r="8" fill="${fill}"/>` +
        `<circle cx="14" cy="14" r="8" fill="none" stroke="#fff" stroke-width="2"/>` +
        `<path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="none" stroke="#fff" stroke-width="2"/>`;
      const lbl = document.createElement('div');
      lbl.setAttribute('data-label', ''); lbl.textContent = booth.booth_number;
      Object.assign(lbl.style, {
        fontSize: '12px', fontWeight: '700', fontFamily: 'Inter, sans-serif',
        color: '#1f2937', textAlign: 'center', whiteSpace: 'nowrap',
        maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis',
        marginTop: '1px', lineHeight: '1.2',
        textShadow: '-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, 0 0 4px #fff',
      });
      el.appendChild(svg); el.appendChild(lbl);
      el.addEventListener('pointerup', e => {
        e.stopPropagation();
        onBoothClickRef.current(booth);
        if ((window as any).onBoothClick) (window as any).onBoothClick(booth.id, booth);
      });
      overlay.appendChild(el); markers.set(booth.id, el);
    }
    recalcMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booths]);

  useEffect(() => { updateMarkerPositions(); }, [selectedBoothId, showBooths, activeCategories, categories, ln]);

  // ===== Facilities =====
  useEffect(() => {
    const layer = facilityLayerRef.current; layer.removeChildren();
    const sc = transformRef.current.scale;
    for (const fac of visibleFacilities) {
      const style = FACILITY_STYLES[fac.type] || { color: 0x6b7280, label: '?' };
      const r = Math.max(10, 14 / sc);
      const g = new PIXI.Graphics();
      g.lineStyle(2 / sc, 0xffffff); g.beginFill(style.color, 0.9); g.drawCircle(0, 0, r); g.endFill();
      g.x = fac.x; g.y = fac.y; layer.addChild(g);
      const t = new PIXI.Text(style.label, { fontSize: Math.max(7, 9 / sc), fontFamily: 'Inter,sans-serif', fontWeight: 'bold', fill: 'white', align: 'center' });
      t.anchor.set(0.5); t.x = fac.x; t.y = fac.y; layer.addChild(t);
    }
  }, [visibleFacilities]);

  // ===== Current Position =====
  useEffect(() => {
    const layer = overlayLayerRef.current; layer.removeChildren();
    if (!currentPosition || currentPosition.floorId !== currentFloorId) return;
    const sc = transformRef.current.scale;
    const outer = new PIXI.Graphics();
    outer.lineStyle(3 / sc, 0xffffff); outer.beginFill(0xef4444, 0.9); outer.drawCircle(0, 0, Math.max(12, 16 / sc)); outer.endFill();
    outer.x = currentPosition.x; outer.y = currentPosition.y; layer.addChild(outer);
    const inner = new PIXI.Graphics();
    inner.beginFill(0xffffff); inner.drawCircle(0, 0, Math.max(5, 6 / sc)); inner.endFill();
    inner.x = currentPosition.x; inner.y = currentPosition.y; layer.addChild(inner);
  }, [currentPosition, currentFloorId]);

  // ===== External API =====
  function zoomIn() {
    const { width: cw, height: ch } = canvasDimsRef.current;
    const lv = Math.log2(transformRef.current.scale);
    const target = Math.pow(2, Math.ceil(lv * 2 + 0.01) / 2);
    const canvas = canvasRef.current;
    if (canvas && (canvas as any).__mapAnimateZoom) (canvas as any).__mapAnimateZoom(target, cw / 2, ch / 2, 200);
  }
  function zoomOut() {
    const { width: cw, height: ch } = canvasDimsRef.current;
    const lv = Math.log2(transformRef.current.scale);
    const target = Math.pow(2, Math.floor(lv * 2 - 0.01) / 2);
    const canvas = canvasRef.current;
    if (canvas && (canvas as any).__mapAnimateZoom) (canvas as any).__mapAnimateZoom(target, cw / 2, ch / 2, 200);
  }
  function panToBooth(booth: Booth) {
    const mc = mainContainerRef.current; if (!mc) return;
    const { width: cw, height: ch } = canvasDimsRef.current;
    const sc = transformRef.current.scale;
    transformRef.current.x = cw / 2 - (booth.x + booth.width / 2) * sc;
    transformRef.current.y = ch / 2 - (booth.y + booth.height / 2) * sc;
    clampPosition(transformRef.current, imgWidth, imgHeight, cw, ch);
    syncContainerPosition(mc, transformRef.current);
    renderTilesFnRef.current(); scheduleMarkerUpdate();
  }
  function resetView() {
    const mc = mainContainerRef.current; if (!mc) return;
    const { width: cw, height: ch } = canvasDimsRef.current;
    const minFit = Math.max(cw / imgWidth, ch / imgHeight);
    const fit = Math.max(minFit, Math.min(cw / imgWidth, ch / imgHeight) * 0.9);
    transformRef.current = { scale: fit, x: (cw - imgWidth * fit) / 2, y: (ch - imgHeight * fit) / 2, rotation: 0, tilt: 0 };
    clampPosition(transformRef.current, imgWidth, imgHeight, cw, ch);
    syncContainerPosition(mc, transformRef.current); mc.scale.set(fit); mc.rotation = 0;
    applyTilt(0); onZoomChangeRef.current?.(fit);
    renderTilesFnRef.current(); scheduleMarkerUpdate();
  }
  function panToArea(x: number, y: number, width: number, height: number) {
    const mc = mainContainerRef.current; if (!mc) return;
    const { width: cw, height: ch } = canvasDimsRef.current;
    const sc = Math.min(MAX_ZOOM, Math.max(Math.max(cw / imgWidth, ch / imgHeight), Math.min(cw / width, ch / height) * 0.85));
    transformRef.current.scale = sc;
    transformRef.current.x = cw / 2 - (x + width / 2) * sc;
    transformRef.current.y = ch / 2 - (y + height / 2) * sc;
    clampPosition(transformRef.current, imgWidth, imgHeight, cw, ch);
    syncContainerPosition(mc, transformRef.current); mc.scale.set(sc);
    onZoomChangeRef.current?.(sc);
    renderTilesFnRef.current(); scheduleMarkerUpdate();
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as any;
    w.__mapViewerPanToBooth = panToBooth;
    w.__mapViewerPanToArea = panToArea;
    w.__mapViewerZoomIn = zoomIn;
    w.__mapViewerZoomOut = zoomOut;
    w.__mapViewerResetView = resetView;
    w.__mapViewerSetTilt = (deg: number) => applyTilt(deg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensions]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden"
      style={{ touchAction: 'none', overscrollBehavior: 'none', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}
    >
      {/* STK pattern background */}
      <div className="absolute inset-0" style={{ zIndex: 0 }}>
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <pattern id="stk-pattern" x="0" y="0" width="200" height="120" patternUnits="userSpaceOnUse">
              <text x="100" y="60" textAnchor="middle" dominantBaseline="central" fill="rgba(255,255,255,0.06)" fontSize="32" fontWeight="900" fontFamily="system-ui,sans-serif">STK</text>
              <text x="0" y="120" textAnchor="middle" dominantBaseline="central" fill="rgba(255,255,255,0.06)" fontSize="32" fontWeight="900" fontFamily="system-ui,sans-serif">STK</text>
              <text x="200" y="120" textAnchor="middle" dominantBaseline="central" fill="rgba(255,255,255,0.06)" fontSize="32" fontWeight="900" fontFamily="system-ui,sans-serif">STK</text>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#stk-pattern)" />
        </svg>
      </div>
      {/* Tilt wrapper — contains canvas (appended by pixi) and marker overlay, CSS tilt applied here */}
      <div ref={tiltWrapperRef} className="absolute inset-0" style={{ zIndex: 1, transformStyle: 'preserve-3d' }}>
        {/* DOM marker overlay — inside tilt wrapper so markers tilt with the map */}
        <div ref={markerOverlayRef} className="absolute inset-0 overflow-hidden" style={{ pointerEvents: 'none', zIndex: 5 }} />
      </div>
      {/* Facility tooltip */}
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