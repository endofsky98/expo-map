import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Stage, Layer, Rect, Text, Image as KonvaImage, Group, Circle, Line } from 'react-konva';
import Konva from 'konva';
import { Booth, Category, MapImage, Facility, RoutePoint, Obstacle, ZoomLevel } from '@/types';
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
  currentFloorId: number | null;
  currentHallId: number | null;
  currentPosition: CurrentPosition | null;
  onBoothClick: (booth: Booth) => void;
  onZoomChange?: (zoom: number) => void;
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 5.0;
const VIEWPORT_PADDING = 200;
const MIN_BOOTH_SCREEN_SIZE = 10; // pixels

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
  currentFloorId,
  currentHallId,
  currentPosition,
  onBoothClick,
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

  // Crossfade zoom: pick the right zoom level image based on current scale
  useEffect(() => {
    if (!currentImage) { setBgImage(null); setNextBgImage(null); return; }
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8008';
    const zoomLevels = parseZoomLevels(currentImage);

    let imageUrl: string;
    let targetLevel = -1;

    if (zoomLevels.length > 0) {
      // Map scale to zoom level
      const scaleRange = MAX_ZOOM - MIN_ZOOM;
      const normalizedScale = Math.max(0, Math.min(1, (scale - MIN_ZOOM) / scaleRange));
      targetLevel = Math.min(zoomLevels.length - 1, Math.floor(normalizedScale * zoomLevels.length));
      imageUrl = zoomLevels[targetLevel].path;
    } else {
      // Fallback to legacy 3-level system
      if (scale < 0.8 && currentImage.low_path) imageUrl = currentImage.low_path;
      else if (scale > 1.5 && currentImage.high_path) imageUrl = currentImage.high_path;
      else imageUrl = currentImage.medium_path;
    }

    if (imageUrl && !imageUrl.startsWith('http')) imageUrl = `${apiBase}${imageUrl}`;

    // If same zoom level, skip
    if (targetLevel === currentZoomLevelRef.current && bgImage) return;

    // Preload new image in background
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => {
      if (!bgImage) {
        // First load - no crossfade needed
        setBgImage(img);
        currentZoomLevelRef.current = targetLevel;
      } else {
        // Crossfade: show new image on top with increasing opacity
        setNextBgImage(img);
        setCrossfadeOpacity(0);
        if (crossfadeTimerRef.current) cancelAnimationFrame(crossfadeTimerRef.current);
        let startTime: number | null = null;
        const duration = 200; // ms
        function animate(timestamp: number) {
          if (!startTime) startTime = timestamp;
          const elapsed = timestamp - startTime;
          const progress = Math.min(1, elapsed / duration);
          setCrossfadeOpacity(progress);
          if (progress < 1) {
            crossfadeTimerRef.current = requestAnimationFrame(animate);
          } else {
            // Crossfade complete
            setBgImage(img);
            setNextBgImage(null);
            setCrossfadeOpacity(0);
            currentZoomLevelRef.current = targetLevel;
          }
        }
        crossfadeTimerRef.current = requestAnimationFrame(animate);
      }
    };

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
    return booths.filter((booth) => {
      // Viewport check
      if (
        booth.x + booth.width < viewportBounds.x ||
        booth.x > viewportBounds.x + viewportBounds.width ||
        booth.y + booth.height < viewportBounds.y ||
        booth.y > viewportBounds.y + viewportBounds.height
      ) return false;
      // Minimum screen size check
      const screenWidth = booth.width * scale;
      const screenHeight = booth.height * scale;
      if (screenWidth < MIN_BOOTH_SCREEN_SIZE && screenHeight < MIN_BOOTH_SCREEN_SIZE) return false;
      return true;
    });
  }, [booths, viewportBounds, scale]);

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
      if (p.floor_id === currentFloorId && (currentHallId === null || p.hall_id === currentHallId)) {
        points.push(p.x, p.y);
      }
    }
    return points.length >= 4 ? points : null;
  }, [routePath, currentFloorId, currentHallId]);

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

  function handleBoothClick(booth: Booth) {
    setFacilityTooltip(null);
    onBoothClick(booth);
    if (typeof window !== 'undefined' && typeof window.onBoothClick === 'function') {
      window.onBoothClick(booth.id, booth);
    }
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

  // Determine image dimensions for rendering (use original image size)
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
              stroke="#4f46e5"
              strokeWidth={3 / scale}
              dash={[8 / scale, 4 / scale]}
              lineCap="round"
              lineJoin="round"
              opacity={0.8}
              listening={false}
            />
          </Layer>
        )}

        {/* Booths layer */}
        <Layer>
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
                onClick={() => handleBoothClick(booth)}
                onTap={() => handleBoothClick(booth)}
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

        {/* Facilities layer (always on top) */}
        <Layer>
          {visibleFacilities.map((fac) => {
            const style = FACILITY_STYLES[fac.type] || { color: '#6b7280', label: '?' };
            const r = Math.max(10, 14 / scale);
            return (
              <Group
                key={`fac-${fac.id}`}
                x={fac.x}
                y={fac.y}
                onClick={() => handleFacilityClick(fac)}
                onTap={() => handleFacilityClick(fac)}
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
        {currentPosition && currentPosition.floorId === currentFloorId && (currentHallId === null || currentPosition.hallId === currentHallId) && (
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
