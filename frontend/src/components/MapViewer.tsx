import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Stage, Layer, Rect, Text, Image as KonvaImage, Group, Circle, Line } from 'react-konva';
import Konva from 'konva';
import { Booth, Category, MapImage, Facility, RoutePoint, Obstacle, ZoomLevel, RouteResult } from '@/types';
import { useI18n } from '@/lib/i18n';

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

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 5.0;
const VIEWPORT_PADDING = 200;
const MIN_BOOTH_SCREEN_SIZE = 20;

const FACILITY_STYLES: Record<string, { color: string; label: string }> = {
  restroom: { color: '#3b82f6', label: 'WC' },
  emergency_exit: { color: '#ef4444', label: 'EXIT' },
  stairs: { color: '#22c55e', label: 'S' },
  elevator: { color: '#f59e0b', label: 'EV' },
  escalator: { color: '#f97316', label: 'ES' },
};

function parseZoomLevels(img: MapImage): ZoomLevel[] {
  if (!img.zoom_levels) return [];
  if (typeof img.zoom_levels === 'string') {
    try { return JSON.parse(img.zoom_levels); } catch { return []; }
  }
  return img.zoom_levels;
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
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [nextBgImage, setNextBgImage] = useState<HTMLImageElement | null>(null);
  const [crossfadeOpacity, setCrossfadeOpacity] = useState(0);
  const [viewportBounds, setViewportBounds] = useState({ x: 0, y: 0, width: 800, height: 600 });
  const crossfadeTimerRef = useRef<number | null>(null);
  const currentZoomLevelRef = useRef<number>(-1);
  const lastPinchDistRef = useRef<number>(0);
  const lastPinchCenterRef = useRef<{ x: number; y: number } | null>(null);
  const isPinchingRef = useRef<boolean>(false);
  const currentImageIdRef = useRef<number | null>(null);
  // Prefetch cache: stores preloaded images by zoom level index
  const prefetchCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Cleanup prefetch cache and images on unmount (floor memory management)
  useEffect(() => {
    return () => {
      prefetchCacheRef.current.clear();
      setBgImage(null);
      setNextBgImage(null);
      if (crossfadeTimerRef.current) cancelAnimationFrame(crossfadeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    function updateSize() {
      if (containerRef.current) {
        setDimensions({ width: containerRef.current.offsetWidth, height: containerRef.current.offsetHeight });
      }
    }
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8008';

  function resolveImageUrl(path: string): string {
    if (!path) return '';
    return path.startsWith('http') ? path : `${apiBase}${path}`;
  }

  function getTargetZoomLevel(zoomLevels: ZoomLevel[], currentScale: number): number {
    const scaleRange = MAX_ZOOM - MIN_ZOOM;
    const normalizedScale = Math.max(0, Math.min(1, (currentScale - MIN_ZOOM) / scaleRange));
    return Math.min(zoomLevels.length - 1, Math.floor(normalizedScale * zoomLevels.length));
  }

  // Prefetch adjacent zoom level images in background
  useEffect(() => {
    if (!currentImage) return;
    const zoomLevels = parseZoomLevels(currentImage);
    if (zoomLevels.length === 0) return;

    const currentLevel = getTargetZoomLevel(zoomLevels, scale);
    const imageId = currentImage.id;
    const levelsToPreload: number[] = [];

    // Always preload next higher resolution (해상도 선행 로드)
    if (currentLevel + 1 < zoomLevels.length) {
      levelsToPreload.push(currentLevel + 1);
    }

    // Preload adjacent levels based on prefetchRange
    for (let offset = 1; offset <= prefetchRange; offset++) {
      if (currentLevel - offset >= 0) levelsToPreload.push(currentLevel - offset);
      if (currentLevel + offset < zoomLevels.length && !levelsToPreload.includes(currentLevel + offset)) {
        levelsToPreload.push(currentLevel + offset);
      }
    }

    for (const level of levelsToPreload) {
      const cacheKey = `${imageId}-${level}`;
      if (prefetchCacheRef.current.has(cacheKey)) continue;
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.src = resolveImageUrl(zoomLevels[level].path);
      img.onload = () => {
        prefetchCacheRef.current.set(cacheKey, img);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentImage, scale, prefetchRange]);

  // Crossfade zoom: pick the right zoom level image based on current scale
  useEffect(() => {
    if (!currentImage) { setBgImage(null); setNextBgImage(null); return; }
    const zoomLevels = parseZoomLevels(currentImage);

    let imageUrl: string;
    let targetLevel = -1;

    if (zoomLevels.length > 0) {
      targetLevel = getTargetZoomLevel(zoomLevels, scale);
      imageUrl = zoomLevels[targetLevel].path;
    } else {
      if (scale < 0.8 && currentImage.low_path) imageUrl = currentImage.low_path;
      else if (scale > 1.5 && currentImage.high_path) imageUrl = currentImage.high_path;
      else imageUrl = currentImage.medium_path;
    }

    imageUrl = resolveImageUrl(imageUrl);

    const imageChanged = currentImage.id !== currentImageIdRef.current;
    if (imageChanged) {
      currentZoomLevelRef.current = -1;
      currentImageIdRef.current = currentImage.id;
      // Clear prefetch cache on image/floor change
      prefetchCacheRef.current.clear();
    }

    if (targetLevel === currentZoomLevelRef.current && bgImage && !imageChanged) return;

    // Check prefetch cache first
    const cacheKey = `${currentImage.id}-${targetLevel}`;
    const cachedImg = prefetchCacheRef.current.get(cacheKey);

    function applyImage(img: HTMLImageElement) {
      if (!bgImage || imageChanged) {
        setBgImage(img);
        setNextBgImage(null);
        currentZoomLevelRef.current = targetLevel;
      } else {
        setNextBgImage(img);
        setCrossfadeOpacity(0);
        if (crossfadeTimerRef.current) cancelAnimationFrame(crossfadeTimerRef.current);
        let startTime: number | null = null;
        const duration = 200;
        function animate(timestamp: number) {
          if (!startTime) startTime = timestamp;
          const elapsed = timestamp - startTime;
          const progress = Math.min(1, elapsed / duration);
          setCrossfadeOpacity(progress);
          if (progress < 1) {
            crossfadeTimerRef.current = requestAnimationFrame(animate);
          } else {
            setBgImage(img);
            setNextBgImage(null);
            setCrossfadeOpacity(0);
            currentZoomLevelRef.current = targetLevel;
          }
        }
        crossfadeTimerRef.current = requestAnimationFrame(animate);
      }
    }

    if (cachedImg) {
      applyImage(cachedImg);
    } else {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.src = imageUrl;
      img.onload = () => {
        prefetchCacheRef.current.set(cacheKey, img);
        applyImage(img);
      };
    }

    return () => {
      if (crossfadeTimerRef.current) cancelAnimationFrame(crossfadeTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentImage, scale]);

  const updateViewport = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.position();
    const sc = stage.scaleX();
    setViewportBounds({
      x: -pos.x / sc - VIEWPORT_PADDING / sc,
      y: -pos.y / sc - VIEWPORT_PADDING / sc,
      width: dimensions.width / sc + (2 * VIEWPORT_PADDING) / sc,
      height: dimensions.height / sc + (2 * VIEWPORT_PADDING) / sc,
    });
  }, [dimensions]);

  useEffect(() => { updateViewport(); }, [dimensions, scale, position, updateViewport]);

  // Filter visible booths: viewport + minimum screen size
  const visibleBooths = useMemo(() => {
    if (!showBooths) return [];
    return booths.filter((booth) => {
      if (
        booth.x + booth.width < viewportBounds.x ||
        booth.x > viewportBounds.x + viewportBounds.width ||
        booth.y + booth.height < viewportBounds.y ||
        booth.y > viewportBounds.y + viewportBounds.height
      ) return false;
      const screenWidth = booth.width * scale;
      const screenHeight = booth.height * scale;
      if (screenWidth < MIN_BOOTH_SCREEN_SIZE || screenHeight < MIN_BOOTH_SCREEN_SIZE) return false;
      return true;
    });
  }, [booths, viewportBounds, scale, showBooths]);

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
    const points: number[] = [];
    for (const p of routePath) {
      if (p.floor_id === currentFloorId) {
        points.push(p.x, p.y);
      }
    }
    return points.length >= 4 ? points : null;
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

  function getTouchDistance(t1: Touch, t2: Touch): number {
    return Math.sqrt(Math.pow(t2.clientX - t1.clientX, 2) + Math.pow(t2.clientY - t1.clientY, 2));
  }

  function getTouchCenter(t1: Touch, t2: Touch): { x: number; y: number } {
    return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
  }

  function handleTouchMove(e: Konva.KonvaEventObject<TouchEvent>) {
    const touches = e.evt.touches;
    if (touches.length !== 2) return;
    e.evt.preventDefault();

    const stage = stageRef.current;
    if (!stage) return;

    stage.draggable(false);
    if (stage.isDragging()) {
      stage.stopDrag();
    }

    const t1 = touches[0];
    const t2 = touches[1];
    const newDist = getTouchDistance(t1, t2);
    const newCenter = getTouchCenter(t1, t2);

    if (!lastPinchDistRef.current) {
      lastPinchDistRef.current = newDist;
      lastPinchCenterRef.current = newCenter;
      return;
    }

    const oldScale = stage.scaleX();
    let newScale = oldScale * (newDist / lastPinchDistRef.current);
    newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newScale));

    const pointTo = {
      x: (newCenter.x - stage.x()) / oldScale,
      y: (newCenter.y - stage.y()) / oldScale,
    };
    const newPos = {
      x: newCenter.x - pointTo.x * newScale,
      y: newCenter.y - pointTo.y * newScale,
    };

    setScale(newScale);
    setPosition(newPos);
    onZoomChange?.(newScale);

    lastPinchDistRef.current = newDist;
    lastPinchCenterRef.current = newCenter;
  }

  function handleTouchEnd(e: Konva.KonvaEventObject<TouchEvent>) {
    const touches = e.evt.touches;
    if (touches.length === 0) {
      const stage = stageRef.current;
      if (stage) stage.draggable(true);
      lastPinchDistRef.current = 0;
      lastPinchCenterRef.current = null;
      isPinchingRef.current = false;
    }
  }

  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const factor = 1.08;
    let newScale = direction > 0 ? oldScale * factor : oldScale / factor;
    newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newScale));
    setScale(newScale);
    const newPos = { x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale };
    setPosition(newPos);
    onZoomChange?.(newScale);
  }

  function handleDragEnd() {
    const stage = stageRef.current;
    if (stage) setPosition(stage.position());
  }

  // --- Coordinate-based booth click detection (v7 requirement 5) ---
  // Instead of attaching events to each booth element, we detect clicks at the stage level,
  // convert screen coordinates to map coordinates, and find which booth was clicked.
  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>) {
    if (isPinchingRef.current) return;
    setFacilityTooltip(null);

    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    // Convert screen coordinates to map coordinates
    const stagePos = stage.position();
    const stageScale = stage.scaleX();
    const mapX = (pointer.x - stagePos.x) / stageScale;
    const mapY = (pointer.y - stagePos.y) / stageScale;

    // Check facilities first (they render on top)
    for (const fac of visibleFacilities) {
      const r = Math.max(10, 14 / stageScale);
      const dx = mapX - fac.x;
      const dy = mapY - fac.y;
      if (dx * dx + dy * dy <= r * r) {
        handleFacilityClick(fac);
        return;
      }
    }

    // Find booth at this map coordinate
    for (const booth of booths) {
      if (
        mapX >= booth.x &&
        mapX <= booth.x + booth.width &&
        mapY >= booth.y &&
        mapY <= booth.y + booth.height
      ) {
        onBoothClick(booth);
        if (typeof window !== 'undefined' && typeof window.onBoothClick === 'function') {
          window.onBoothClick(booth.id, booth);
        }
        return;
      }
    }

    // No booth at click position — fire onMapClick with map coordinates
    const floorId = currentFloorId || 0;
    console.log(`onMapClick(${Math.round(mapX)}, ${Math.round(mapY)}, ${floorId})`);
    onMapClick?.(Math.round(mapX), Math.round(mapY), floorId);
    if (typeof window !== 'undefined' && typeof window.onMapClick === 'function') {
      window.onMapClick(Math.round(mapX), Math.round(mapY), floorId);
    }
  }

  function handleStageTap(e: Konva.KonvaEventObject<TouchEvent>) {
    if (isPinchingRef.current) return;
    // Use same coordinate detection as click
    handleStageClick(e as unknown as Konva.KonvaEventObject<MouseEvent>);
  }

  function handleFacilityClick(facility: Facility) {
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.position();
    const sc = stage.scaleX();
    const screenX = facility.x * sc + pos.x;
    const screenY = facility.y * sc + pos.y;
    setFacilityTooltip((prev) =>
      prev?.facility.id === facility.id ? null : { facility, screenX, screenY }
    );
  }

  function zoomIn() {
    const newScale = Math.min(MAX_ZOOM, scale * 1.3);
    setScale(newScale);
    onZoomChange?.(newScale);
  }

  function zoomOut() {
    const newScale = Math.max(MIN_ZOOM, scale / 1.3);
    setScale(newScale);
    onZoomChange?.(newScale);
  }

  function panToBooth(booth: Booth) {
    const centerX = booth.x + booth.width / 2;
    const centerY = booth.y + booth.height / 2;
    setPosition({ x: dimensions.width / 2 - centerX * scale, y: dimensions.height / 2 - centerY * scale });
  }

  function panToArea(x: number, y: number, width: number, height: number) {
    const scaleX = dimensions.width / width;
    const scaleY = dimensions.height / height;
    const newScale = Math.min(scaleX, scaleY) * 0.85;
    const clampedScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newScale));
    setScale(clampedScale);
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    setPosition({ x: dimensions.width / 2 - centerX * clampedScale, y: dimensions.height / 2 - centerY * clampedScale });
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
  }, [scale, dimensions]);

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

  const imgWidth = currentImage?.width || (bgImage?.naturalWidth ?? 800);
  const imgHeight = currentImage?.height || (bgImage?.naturalHeight ?? 600);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        draggable
        onWheel={handleWheel}
        onClick={handleStageClick}
        onTap={handleStageTap}
        onTouchStart={(e) => {
          const touches = e.evt.touches;
          if (touches.length === 2) {
            isPinchingRef.current = true;
            const stage = stageRef.current;
            if (stage) {
              stage.draggable(false);
              if (stage.isDragging()) stage.stopDrag();
            }
            const t1 = touches[0];
            const t2 = touches[1];
            lastPinchDistRef.current = getTouchDistance(t1, t2);
            lastPinchCenterRef.current = getTouchCenter(t1, t2);
          }
        }}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDragEnd={handleDragEnd}
        onDragMove={() => {
          const stage = stageRef.current;
          if (stage) setPosition(stage.position());
        }}
      >
        {/* Background image layer with crossfade */}
        <Layer>
          {bgImage && (
            <KonvaImage image={bgImage} x={0} y={0} width={imgWidth} height={imgHeight} />
          )}
          {nextBgImage && (
            <KonvaImage image={nextBgImage} x={0} y={0} width={imgWidth} height={imgHeight} opacity={crossfadeOpacity} />
          )}
        </Layer>

        {/* Obstacles layer */}
        <Layer>
          {obstacles.map((obs) => {
            if (obs.shape === 'circle' && obs.radius) {
              return (
                <Circle
                  key={`obs-${obs.id}`}
                  x={obs.x}
                  y={obs.y}
                  radius={obs.radius}
                  fill="#9ca3af"
                  opacity={0.5}
                  stroke="#6b7280"
                  strokeWidth={1 / scale}
                  listening={false}
                />
              );
            }
            return (
              <Rect
                key={`obs-${obs.id}`}
                x={obs.x}
                y={obs.y}
                width={obs.width || 40}
                height={obs.height || 40}
                fill="#9ca3af"
                opacity={0.5}
                stroke="#6b7280"
                strokeWidth={1 / scale}
                cornerRadius={2 / scale}
                listening={false}
              />
            );
          })}
        </Layer>

        {/* Route layer */}
        {currentRoutePoints && (
          <Layer>
            <Line
              points={currentRoutePoints}
              stroke="#1e1b4b"
              strokeWidth={5 / scale}
              lineCap="round"
              lineJoin="round"
              opacity={0.15}
              listening={false}
            />
            <Line
              points={currentRoutePoints}
              stroke="#4f46e5"
              strokeWidth={3 / scale}
              dash={[8 / scale, 4 / scale]}
              lineCap="round"
              lineJoin="round"
              opacity={0.85}
              listening={false}
            />
            {routeTransitionMarkers.map((m, i) => {
              const r = Math.max(10, 14 / scale);
              const color = m.type === 'start' ? '#22c55e' : m.type === 'end' ? '#ef4444' : '#f59e0b';
              return (
                <Group key={`rt-${i}`} x={m.x} y={m.y} listening={false}>
                  <Circle radius={r} fill={color} stroke="white" strokeWidth={2 / scale} opacity={0.95} />
                  <Text
                    x={-r} y={-r / 2} width={r * 2}
                    text={m.label} fontSize={Math.max(7, 9 / scale)}
                    fontFamily="Inter, sans-serif" fontStyle="bold" fill="white"
                    align="center" listening={false}
                  />
                </Group>
              );
            })}
            {routeFacilityMarkers.map((fac) => {
              const r = Math.max(12, 16 / scale);
              const label = fac.type === 'stairs' ? 'S' : fac.type === 'elevator' ? 'EV' : fac.type === 'escalator' ? 'ES' : '?';
              return (
                <Group key={`rf-${fac.id}`} x={fac.x} y={fac.y} listening={false}>
                  <Circle radius={r} fill="#f97316" stroke="white" strokeWidth={2 / scale} opacity={0.9} />
                  <Text
                    x={-r} y={-r / 2} width={r * 2}
                    text={label} fontSize={Math.max(6, 8 / scale)}
                    fontFamily="Inter, sans-serif" fontStyle="bold" fill="white"
                    align="center" listening={false}
                  />
                </Group>
              );
            })}
          </Layer>
        )}

        {/* Booths layer — rendered only when showBooths is true */}
        {showBooths && (
          <Layer listening={false}>
            {visibleBooths.map((booth) => {
              const isSelected = booth.id === selectedBoothId;
              const opacity = getBoothOpacity(booth);
              const fill = getBoothFill(booth);
              const companyName = ln(booth.company?.name) || '';
              const categoryName = ln(booth.category?.name) || '';

              return (
                <Group
                  key={booth.id}
                  x={booth.x}
                  y={booth.y}
                  opacity={opacity}
                  listening={false}
                >
                  <Rect
                    width={booth.width}
                    height={booth.height}
                    fill={scale >= 2.0 ? `${fill}33` : `${fill}22`}
                    stroke={isSelected ? '#4f46e5' : fill}
                    strokeWidth={isSelected ? 3 / scale : 1.5 / scale}
                    cornerRadius={2 / scale}
                  />
                  {isSelected && (
                    <Rect
                      width={booth.width}
                      height={booth.height}
                      stroke="#4f46e5"
                      strokeWidth={3 / scale}
                      cornerRadius={2 / scale}
                      dash={[6 / scale, 3 / scale]}
                      listening={false}
                    />
                  )}
                  <Text
                    text={booth.booth_number}
                    x={4 / scale}
                    y={4 / scale}
                    fontSize={scale < 1.0 ? 10 / scale : 11 / scale}
                    fontFamily="Inter, sans-serif"
                    fontStyle="bold"
                    fill="#1f2937"
                    width={booth.width - 8 / scale}
                    wrap="none"
                    ellipsis
                    listening={false}
                  />
                  {scale >= 1.0 && companyName && (
                    <Text
                      text={companyName}
                      x={4 / scale}
                      y={18 / scale}
                      fontSize={9 / scale}
                      fontFamily="Inter, sans-serif"
                      fill="#4b5563"
                      width={booth.width - 8 / scale}
                      wrap="none"
                      ellipsis
                      listening={false}
                    />
                  )}
                  {scale >= 2.0 && categoryName && (
                    <Text
                      text={categoryName}
                      x={4 / scale}
                      y={30 / scale}
                      fontSize={7 / scale}
                      fontFamily="Inter, sans-serif"
                      fill={fill}
                      width={booth.width - 8 / scale}
                      wrap="none"
                      ellipsis
                      listening={false}
                    />
                  )}
                </Group>
              );
            })}
          </Layer>
        )}

        {/* Facilities layer (always on top) */}
        <Layer listening={false}>
          {visibleFacilities.map((fac) => {
            const style = FACILITY_STYLES[fac.type] || { color: '#6b7280', label: '?' };
            const r = Math.max(10, 14 / scale);
            return (
              <Group
                key={`fac-${fac.id}`}
                x={fac.x}
                y={fac.y}
                listening={false}
              >
                <Circle
                  radius={r}
                  fill={style.color}
                  stroke="white"
                  strokeWidth={2 / scale}
                  opacity={0.9}
                />
                <Text
                  text={style.label}
                  x={-r}
                  y={-r / 2}
                  width={r * 2}
                  fontSize={Math.max(7, 9 / scale)}
                  fontFamily="Inter, sans-serif"
                  fontStyle="bold"
                  fill="white"
                  align="center"
                  listening={false}
                />
              </Group>
            );
          })}
        </Layer>

        {/* Current position marker */}
        {currentPosition && currentPosition.floorId === currentFloorId && (
          <Layer>
            <Circle x={currentPosition.x} y={currentPosition.y} radius={Math.max(12, 16 / scale)} fill="#ef4444" stroke="white" strokeWidth={3 / scale} opacity={0.9} />
            <Circle x={currentPosition.x} y={currentPosition.y} radius={Math.max(5, 6 / scale)} fill="white" listening={false} />
          </Layer>
        )}
      </Stage>

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
