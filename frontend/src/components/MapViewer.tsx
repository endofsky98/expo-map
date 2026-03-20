import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
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
const MIN_BOOTH_SCREEN_SIZE = 20;

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

function hexWithAlpha(hex: string, alpha: number): number {
  // Returns the hex color as number; alpha handled via sprite/graphics alpha
  return parseInt(hex.replace('#', ''), 16);
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
  const viewportRef = useRef<Viewport | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Layer refs
  const tileLayerRef = useRef<PIXI.Container>(new PIXI.Container());
  const obstacleLayerRef = useRef<PIXI.Container>(new PIXI.Container());
  const routeLayerRef = useRef<PIXI.Container>(new PIXI.Container());
  const boothLayerRef = useRef<PIXI.Container>(new PIXI.Container());
  const facilityLayerRef = useRef<PIXI.Container>(new PIXI.Container());
  const overlayLayerRef = useRef<PIXI.Container>(new PIXI.Container());

  // State tracking refs
  const tileCacheRef = useRef<Map<string, PIXI.Texture>>(new Map());
  const currentImageIdRef = useRef<number | null>(null);
  const currentTileLevelRef = useRef<number>(0);
  const lastScaleRef = useRef<number>(1);

  // Callbacks as refs to avoid stale closures
  const onBoothClickRef = useRef(onBoothClick);
  const onMapClickRef = useRef(onMapClick);
  const onZoomChangeRef = useRef(onZoomChange);
  onBoothClickRef.current = onBoothClick;
  onMapClickRef.current = onMapClick;
  onZoomChangeRef.current = onZoomChange;

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

  // ===== Initialize PIXI Application =====
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const w = el.offsetWidth || 800;
    const h = el.offsetHeight || 600;

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
    canvas.style.touchAction = 'none';
    canvas.style.overscrollBehavior = 'none';
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    const vp = new Viewport({
      screenWidth: w,
      screenHeight: h,
      worldWidth: 10000,
      worldHeight: 10000,
      events: app.renderer.events,
    } as any);
    app.stage.addChild(vp as any);
    vp.drag().pinch().wheel().decelerate({ friction: 0.95 });
    vp.clampZoom({ minScale: MIN_ZOOM, maxScale: MAX_ZOOM });

    // Add layers in order
    vp.addChild(tileLayerRef.current as any);
    vp.addChild(obstacleLayerRef.current as any);
    vp.addChild(routeLayerRef.current as any);
    vp.addChild(boothLayerRef.current as any);
    vp.addChild(facilityLayerRef.current as any);
    vp.addChild(overlayLayerRef.current as any);

    // Events
    vp.on('moved', () => {
      onZoomChangeRef.current?.(vp.scale.x);
      lastScaleRef.current = vp.scale.x;
    });
    vp.on('zoomed', () => {
      onZoomChangeRef.current?.(vp.scale.x);
      lastScaleRef.current = vp.scale.x;
    });
    vp.on('clicked', (e: { world: PIXI.IPointData; screen: PIXI.IPointData; event: PIXI.FederatedPointerEvent }) => {
      const worldPos = e.world;
      const screenPos = e.screen;
      const sc = vp.scale.x;

      // Check facilities first
      for (const fac of visibleFacilitiesRef.current) {
        const r = Math.max(10, 14 / sc);
        const dx = worldPos.x - fac.x;
        const dy = worldPos.y - fac.y;
        if (dx * dx + dy * dy <= r * r) {
          const sPos = vp.toScreen(fac.x, fac.y);
          setFacilityTooltip((prev) =>
            prev?.facility.id === fac.id ? null : { facility: fac, screenX: sPos.x, screenY: sPos.y }
          );
          return;
        }
      }

      // Check booths
      for (const booth of boothsRef.current) {
        if (
          worldPos.x >= booth.x &&
          worldPos.x <= booth.x + booth.width &&
          worldPos.y >= booth.y &&
          worldPos.y <= booth.y + booth.height
        ) {
          onBoothClickRef.current(booth);
          if (typeof window !== 'undefined' && typeof window.onBoothClick === 'function') {
            window.onBoothClick(booth.id, booth);
          }
          return;
        }
      }

      // No booth/facility hit — fire onMapClick
      setFacilityTooltip(null);
      const floorId = currentFloorIdRef.current || 0;
      onMapClickRef.current?.(Math.round(worldPos.x), Math.round(worldPos.y), floorId);
      if (typeof window !== 'undefined' && typeof window.onMapClick === 'function') {
        window.onMapClick(Math.round(worldPos.x), Math.round(worldPos.y), floorId);
      }
    });

    pixiApp.current = app;
    viewportRef.current = vp;
    setDimensions({ width: w, height: h });

    // ResizeObserver
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: rw, height: rh } = entry.contentRect;
        if (rw > 0 && rh > 0) {
          app.renderer.resize(rw, rh);
          vp.resize(rw, rh);
          setDimensions({ width: rw, height: rh });
        }
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      app.destroy(true);
      pixiApp.current = null;
      viewportRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refs for data accessed in click handler closure
  const boothsRef = useRef(booths);
  boothsRef.current = booths;
  const visibleFacilitiesRef = useRef(visibleFacilities);
  visibleFacilitiesRef.current = visibleFacilities;
  const currentFloorIdRef = useRef(currentFloorId);
  currentFloorIdRef.current = currentFloorId;

  // ===== Tile/Image rendering =====
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !currentImage) return;

    const layer = tileLayerRef.current;
    layer.removeChildren();
    const imageChanged = currentImage.id !== currentImageIdRef.current;
    if (imageChanged) {
      tileCacheRef.current.forEach((tex) => tex.destroy(true));
      tileCacheRef.current.clear();
      currentImageIdRef.current = currentImage.id;
    }

    if (useTileMode && tileInfo) {
      // Tile mode rendering
      renderTiles(vp, layer);

      const onMoved = () => renderTiles(vp, layer);
      vp.on('moved', onMoved);
      vp.on('zoomed', onMoved);
      return () => {
        vp.off('moved', onMoved);
        vp.off('zoomed', onMoved);
      };
    } else {
      // Single image fallback
      const zoomLevels = parseZoomLevels(currentImage);
      let imageUrl: string;
      if (zoomLevels.length > 0) {
        const sc = vp.scale.x;
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
  }, [currentImage, tileInfo, useTileMode, imgWidth, imgHeight]);

  function selectTileLevel(scale: number): number {
    if (!tileInfo) return 0;
    const idx = Math.round(-Math.log2(Math.max(0.01, scale)));
    return Math.max(0, Math.min(tileInfo.levels.length - 1, idx));
  }

  function renderTiles(vp: Viewport, layer: PIXI.Container) {
    if (!tileInfo || !currentImage) return;
    const sc = vp.scale.x;
    const levelIdx = selectTileLevel(sc);
    const level = tileInfo.levels[levelIdx];
    if (!level) return;
    const tileSize = tileInfo.tile_size;
    const sfx = imgWidth / level.width;
    const sfy = imgHeight / level.height;

    const bounds = vp.getVisibleBounds();
    const colStart = Math.max(0, Math.floor((bounds.x / sfx) / tileSize) - prefetchRange);
    const colEnd = Math.min(level.cols - 1, Math.ceil(((bounds.x + bounds.width) / sfx) / tileSize) + prefetchRange);
    const rowStart = Math.max(0, Math.floor((bounds.y / sfy) / tileSize) - prefetchRange);
    const rowEnd = Math.min(level.rows - 1, Math.ceil(((bounds.y + bounds.height) / sfy) / tileSize) + prefetchRange);

    // Only re-render if level changed or we need different tiles
    const levelChanged = levelIdx !== currentTileLevelRef.current;
    if (levelChanged) {
      layer.removeChildren();
      currentTileLevelRef.current = levelIdx;
    }

    // Track which tiles are currently in the layer
    const neededKeys = new Set<string>();
    for (let r = rowStart; r <= rowEnd; r++) {
      for (let c = colStart; c <= colEnd; c++) {
        neededKeys.add(`${currentImage.id}_${levelIdx}_${r}_${c}`);
      }
    }

    // Remove tiles no longer needed
    for (let i = layer.children.length - 1; i >= 0; i--) {
      const child = layer.children[i];
      if (child.name && !neededKeys.has(child.name)) {
        layer.removeChildAt(i);
      }
    }

    // Add new tiles
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
          // Show placeholder then load
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
  }

  // ===== Obstacles =====
  useEffect(() => {
    const layer = obstacleLayerRef.current;
    layer.removeChildren();
    const vp = viewportRef.current;
    const sc = vp?.scale.x || 1;

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
    const vp = viewportRef.current;
    const sc = vp?.scale.x || 1;

    // Shadow line
    const shadow = new PIXI.Graphics();
    shadow.lineStyle(5 / sc, 0x1e1b4b, 0.15);
    shadow.moveTo(currentRoutePoints[0].x, currentRoutePoints[0].y);
    for (let i = 1; i < currentRoutePoints.length; i++) {
      shadow.lineTo(currentRoutePoints[i].x, currentRoutePoints[i].y);
    }
    layer.addChild(shadow);

    // Main dashed line
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

  // ===== Booths =====
  useEffect(() => {
    const layer = boothLayerRef.current;
    layer.removeChildren();
    if (!showBooths) return;
    const vp = viewportRef.current;
    const sc = vp?.scale.x || 1;

    // Viewport culling
    const bounds = vp?.getVisibleBounds();

    for (const booth of booths) {
      // Viewport culling
      if (bounds) {
        if (
          booth.x + booth.width < bounds.x ||
          booth.x > bounds.x + bounds.width ||
          booth.y + booth.height < bounds.y ||
          booth.y > bounds.y + bounds.height
        ) continue;
      }
      // Min screen size check
      const screenWidth = booth.width * sc;
      const screenHeight = booth.height * sc;
      if (screenWidth < MIN_BOOTH_SCREEN_SIZE || screenHeight < MIN_BOOTH_SCREEN_SIZE) continue;

      const isSelected = booth.id === selectedBoothId;
      const opacity = getBoothOpacity(booth);
      const fill = getBoothFill(booth);
      const fillNum = hexStringToNumber(fill);

      const container = new PIXI.Container();
      container.x = booth.x;
      container.y = booth.y;
      container.alpha = opacity;

      // Booth rect
      const g = new PIXI.Graphics();
      g.lineStyle(isSelected ? 3 / sc : 1.5 / sc, isSelected ? 0x4f46e5 : fillNum);
      g.beginFill(fillNum, sc >= 2.0 ? 0.2 : 0.13);
      g.drawRoundedRect(0, 0, booth.width, booth.height, 2 / sc);
      g.endFill();
      container.addChild(g);

      // Selected dash overlay
      if (isSelected) {
        const dash = new PIXI.Graphics();
        dash.lineStyle(3 / sc, 0x4f46e5, 1);
        dash.drawRoundedRect(0, 0, booth.width, booth.height, 2 / sc);
        container.addChild(dash);
      }

      // Booth number
      const numText = new PIXI.Text(booth.booth_number, {
        fontSize: sc < 1.0 ? 10 / sc : 11 / sc,
        fontFamily: 'Inter, sans-serif',
        fontWeight: 'bold',
        fill: '#1f2937',
      });
      numText.x = 4 / sc;
      numText.y = 4 / sc;
      // Clip text width
      if (numText.width > booth.width - 8 / sc) {
        numText.width = booth.width - 8 / sc;
      }
      container.addChild(numText);

      // Company name (at scale >= 1.0)
      if (sc >= 1.0) {
        const companyName = ln(booth.company?.name) || '';
        if (companyName) {
          const compText = new PIXI.Text(companyName, {
            fontSize: 9 / sc,
            fontFamily: 'Inter, sans-serif',
            fill: '#4b5563',
          });
          compText.x = 4 / sc;
          compText.y = 18 / sc;
          if (compText.width > booth.width - 8 / sc) {
            compText.width = booth.width - 8 / sc;
          }
          container.addChild(compText);
        }
      }

      // Category name (at scale >= 2.0)
      if (sc >= 2.0) {
        const categoryName = ln(booth.category?.name) || '';
        if (categoryName) {
          const catText = new PIXI.Text(categoryName, {
            fontSize: 7 / sc,
            fontFamily: 'Inter, sans-serif',
            fill: fill,
          });
          catText.x = 4 / sc;
          catText.y = 30 / sc;
          if (catText.width > booth.width - 8 / sc) {
            catText.width = booth.width - 8 / sc;
          }
          container.addChild(catText);
        }
      }

      layer.addChild(container);
    }
  }, [booths, showBooths, selectedBoothId, activeCategories, categories, categoryColorMap, ln]);

  // Redraw booths when zoom changes significantly
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    let lastRedrawScale = vp.scale.x;
    const onZoomed = () => {
      const sc = vp.scale.x;
      // Redraw if scale changed enough to affect visibility thresholds
      if (
        Math.abs(sc - lastRedrawScale) / lastRedrawScale > 0.15 ||
        (lastRedrawScale < 1.0 && sc >= 1.0) ||
        (lastRedrawScale >= 1.0 && sc < 1.0) ||
        (lastRedrawScale < 2.0 && sc >= 2.0) ||
        (lastRedrawScale >= 2.0 && sc < 2.0)
      ) {
        lastRedrawScale = sc;
        redrawBooths();
      }
    };
    vp.on('zoomed', onZoomed);
    vp.on('moved', onZoomed);
    return () => {
      vp.off('zoomed', onZoomed);
      vp.off('moved', onZoomed);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booths, showBooths, selectedBoothId, activeCategories, categories, categoryColorMap, ln]);

  function redrawBooths() {
    const layer = boothLayerRef.current;
    layer.removeChildren();
    if (!showBooths) return;
    const vp = viewportRef.current;
    const sc = vp?.scale.x || 1;
    const bounds = vp?.getVisibleBounds();

    for (const booth of booths) {
      if (bounds) {
        if (
          booth.x + booth.width < bounds.x ||
          booth.x > bounds.x + bounds.width ||
          booth.y + booth.height < bounds.y ||
          booth.y > bounds.y + bounds.height
        ) continue;
      }
      const screenWidth = booth.width * sc;
      const screenHeight = booth.height * sc;
      if (screenWidth < MIN_BOOTH_SCREEN_SIZE || screenHeight < MIN_BOOTH_SCREEN_SIZE) continue;

      const isSelected = booth.id === selectedBoothId;
      const opacity = getBoothOpacity(booth);
      const fill = getBoothFill(booth);
      const fillNum = hexStringToNumber(fill);

      const container = new PIXI.Container();
      container.x = booth.x;
      container.y = booth.y;
      container.alpha = opacity;

      const g = new PIXI.Graphics();
      g.lineStyle(isSelected ? 3 / sc : 1.5 / sc, isSelected ? 0x4f46e5 : fillNum);
      g.beginFill(fillNum, sc >= 2.0 ? 0.2 : 0.13);
      g.drawRoundedRect(0, 0, booth.width, booth.height, 2 / sc);
      g.endFill();
      container.addChild(g);

      if (isSelected) {
        const dash = new PIXI.Graphics();
        dash.lineStyle(3 / sc, 0x4f46e5, 1);
        dash.drawRoundedRect(0, 0, booth.width, booth.height, 2 / sc);
        container.addChild(dash);
      }

      const numText = new PIXI.Text(booth.booth_number, {
        fontSize: sc < 1.0 ? 10 / sc : 11 / sc,
        fontFamily: 'Inter, sans-serif',
        fontWeight: 'bold',
        fill: '#1f2937',
      });
      numText.x = 4 / sc;
      numText.y = 4 / sc;
      if (numText.width > booth.width - 8 / sc) {
        numText.width = booth.width - 8 / sc;
      }
      container.addChild(numText);

      if (sc >= 1.0) {
        const companyName = ln(booth.company?.name) || '';
        if (companyName) {
          const compText = new PIXI.Text(companyName, {
            fontSize: 9 / sc,
            fontFamily: 'Inter, sans-serif',
            fill: '#4b5563',
          });
          compText.x = 4 / sc;
          compText.y = 18 / sc;
          if (compText.width > booth.width - 8 / sc) {
            compText.width = booth.width - 8 / sc;
          }
          container.addChild(compText);
        }
      }

      if (sc >= 2.0) {
        const categoryName = ln(booth.category?.name) || '';
        if (categoryName) {
          const catText = new PIXI.Text(categoryName, {
            fontSize: 7 / sc,
            fontFamily: 'Inter, sans-serif',
            fill: fill,
          });
          catText.x = 4 / sc;
          catText.y = 30 / sc;
          if (catText.width > booth.width - 8 / sc) {
            catText.width = booth.width - 8 / sc;
          }
          container.addChild(catText);
        }
      }

      layer.addChild(container);
    }
  }

  // ===== Facilities =====
  useEffect(() => {
    const layer = facilityLayerRef.current;
    layer.removeChildren();
    const vp = viewportRef.current;
    const sc = vp?.scale.x || 1;

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
    const vp = viewportRef.current;
    const sc = vp?.scale.x || 1;

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

  function zoomIn() {
    const vp = viewportRef.current;
    if (!vp) return;
    const newScale = Math.min(MAX_ZOOM, vp.scale.x * 1.3);
    vp.setZoom(newScale, true);
    onZoomChange?.(newScale);
  }

  function zoomOut() {
    const vp = viewportRef.current;
    if (!vp) return;
    const newScale = Math.max(MIN_ZOOM, vp.scale.x / 1.3);
    vp.setZoom(newScale, true);
    onZoomChange?.(newScale);
  }

  function panToBooth(booth: Booth) {
    const vp = viewportRef.current;
    if (!vp) return;
    const centerX = booth.x + booth.width / 2;
    const centerY = booth.y + booth.height / 2;
    vp.moveCenter(centerX, centerY);
  }

  function panToArea(x: number, y: number, width: number, height: number) {
    const vp = viewportRef.current;
    if (!vp) return;
    const scaleX = dimensions.width / width;
    const scaleY = dimensions.height / height;
    const newScale = Math.min(scaleX, scaleY) * 0.85;
    const clampedScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newScale));
    vp.setZoom(clampedScale, false);
    vp.moveCenter(x + width / 2, y + height / 2);
    onZoomChange?.(clampedScale);
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__mapViewerPanToBooth = panToBooth;
      (window as unknown as Record<string, unknown>).__mapViewerPanToArea = panToArea;
      (window as unknown as Record<string, unknown>).__mapViewerZoomIn = zoomIn;
      (window as unknown as Record<string, unknown>).__mapViewerZoomOut = zoomOut;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensions]);

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ touchAction: 'none', overscrollBehavior: 'none' }}>
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
