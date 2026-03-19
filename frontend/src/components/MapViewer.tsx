import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Stage, Layer, Rect, Text, Image as KonvaImage, Group, Circle, Line } from 'react-konva';
import Konva from 'konva';
import { Booth, Category, MapImage, Facility, RoutePoint } from '@/types';
import { useI18n } from '@/lib/i18n';

interface MapViewerProps {
  booths: Booth[];
  categories: Category[];
  currentImage: MapImage | null;
  selectedBoothId: number | null;
  activeCategories: Set<number>;
  facilities: Facility[];
  hiddenFacilityTypes: Set<string>;
  routePath: RoutePoint[] | null;
  currentFloorId: number | null;
  currentHallId: number | null;
  onBoothClick: (booth: Booth) => void;
  onZoomChange?: (zoom: number) => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const VIEWPORT_PADDING = 200;

const FACILITY_STYLES: Record<string, { color: string; label: string }> = {
  restroom: { color: '#3b82f6', label: 'WC' },
  emergency_exit: { color: '#ef4444', label: 'EXIT' },
  stairs: { color: '#22c55e', label: 'S' },
  elevator: { color: '#f59e0b', label: 'EV' },
  escalator: { color: '#f97316', label: 'ES' },
};

export default function MapViewer({
  booths,
  categories,
  currentImage,
  selectedBoothId,
  activeCategories,
  facilities,
  hiddenFacilityTypes,
  routePath,
  currentFloorId,
  currentHallId,
  onBoothClick,
  onZoomChange,
}: MapViewerProps) {
  const { ln } = useI18n();
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [viewportBounds, setViewportBounds] = useState({ x: 0, y: 0, width: 800, height: 600 });

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

  useEffect(() => {
    if (!currentImage) { setBgImage(null); return; }
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8008';
    let imageUrl: string;
    if (scale < 0.8 && currentImage.low_path) imageUrl = currentImage.low_path;
    else if (scale > 1.5 && currentImage.high_path) imageUrl = currentImage.high_path;
    else imageUrl = currentImage.medium_path;
    if (imageUrl && !imageUrl.startsWith('http')) imageUrl = `${apiBase}${imageUrl}`;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => setBgImage(img);
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

  const visibleBooths = useMemo(() => {
    return booths.filter((booth) => {
      return (
        booth.x + booth.width > viewportBounds.x &&
        booth.x < viewportBounds.x + viewportBounds.width &&
        booth.y + booth.height > viewportBounds.y &&
        booth.y < viewportBounds.y + viewportBounds.height
      );
    });
  }, [booths, viewportBounds]);

  const categoryColorMap = useMemo(() => {
    const map: Record<number, string> = {};
    categories.forEach((cat) => { map[cat.id] = cat.color; });
    return map;
  }, [categories]);

  // Filter facilities for current floor/hall and visible types
  const visibleFacilities = useMemo(() => {
    return facilities.filter((f) => {
      if (!f.is_active) return false;
      if (hiddenFacilityTypes.has(f.type)) return false;
      return true;
    });
  }, [facilities, hiddenFacilityTypes]);

  // Filter route path for current floor/hall
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
    onBoothClick(booth);
    if (typeof window !== 'undefined' && typeof window.onBoothClick === 'function') {
      window.onBoothClick(booth.id, booth);
    }
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__mapViewerPanToBooth = panToBooth;
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
        {/* Background image layer */}
        <Layer>
          {bgImage && (
            <KonvaImage image={bgImage} x={0} y={0} width={bgImage.naturalWidth} height={bgImage.naturalHeight} />
          )}
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
              <Group key={`fac-${fac.id}`} x={fac.x} y={fac.y}>
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
      </Stage>
    </div>
  );
}
