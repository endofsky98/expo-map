import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Stage, Layer, Rect, Text, Image as KonvaImage, Group } from 'react-konva';
import Konva from 'konva';
import { Booth, Category, MapImage } from '@/types';

interface MapViewerProps {
  booths: Booth[];
  categories: Category[];
  currentImage: MapImage | null;
  selectedBoothId: number | null;
  activeCategories: Set<number>;
  onBoothClick: (booth: Booth) => void;
  onZoomChange?: (zoom: number) => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const VIEWPORT_PADDING = 200;

export default function MapViewer({
  booths,
  categories,
  currentImage,
  selectedBoothId,
  activeCategories,
  onBoothClick,
  onZoomChange,
}: MapViewerProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [viewportBounds, setViewportBounds] = useState({
    x: 0,
    y: 0,
    width: 800,
    height: 600,
  });

  // Resize observer
  useEffect(() => {
    function updateSize() {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    }
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Load background image with zoom-based resolution swap
  useEffect(() => {
    if (!currentImage) {
      setBgImage(null);
      return;
    }

    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8008';
    let imageUrl: string;
    if (scale < 0.8 && currentImage.low_res_url) {
      imageUrl = currentImage.low_res_url;
    } else if (scale > 1.5 && currentImage.high_res_url) {
      imageUrl = currentImage.high_res_url;
    } else if (currentImage.medium_res_url) {
      imageUrl = currentImage.medium_res_url;
    } else {
      imageUrl = currentImage.url;
    }

    // Prepend API base if URL is relative
    if (imageUrl && !imageUrl.startsWith('http')) {
      imageUrl = `${apiBase}${imageUrl}`;
    }

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => {
      setBgImage(img);
    };
    img.onerror = () => {
      // fallback: try the main URL
      if (currentImage.url) {
        const fallbackUrl = currentImage.url.startsWith('http')
          ? currentImage.url
          : `${apiBase}${currentImage.url}`;
        const fallbackImg = new window.Image();
        fallbackImg.crossOrigin = 'anonymous';
        fallbackImg.src = fallbackUrl;
        fallbackImg.onload = () => setBgImage(fallbackImg);
      }
    };
  }, [currentImage, scale]);

  // Update viewport bounds
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

  useEffect(() => {
    updateViewport();
  }, [dimensions, scale, position, updateViewport]);

  // Visible booths (viewport culling)
  const visibleBooths = useMemo(() => {
    return booths.filter((booth) => {
      const bx = booth.x;
      const by = booth.y;
      const bw = booth.width;
      const bh = booth.height;
      return (
        bx + bw > viewportBounds.x &&
        bx < viewportBounds.x + viewportBounds.width &&
        by + bh > viewportBounds.y &&
        by < viewportBounds.y + viewportBounds.height
      );
    });
  }, [booths, viewportBounds]);

  // Category color map
  const categoryColorMap = useMemo(() => {
    const map: Record<number, string> = {};
    categories.forEach((cat) => {
      map[cat.id] = cat.color;
    });
    return map;
  }, [categories]);

  // Wheel zoom
  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const factor = 1.08;
    let newScale = direction > 0 ? oldScale * factor : oldScale / factor;
    newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newScale));

    setScale(newScale);
    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    setPosition(newPos);
    onZoomChange?.(newScale);
  }

  function handleDragEnd() {
    const stage = stageRef.current;
    if (!stage) return;
    setPosition(stage.position());
  }

  function handleBoothClick(booth: Booth) {
    onBoothClick(booth);
    if (typeof window !== 'undefined' && typeof window.onBoothClick === 'function') {
      window.onBoothClick(booth.id, booth);
    }
  }

  // Zoom controls (called from parent via imperative)
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

  // Pan to booth
  function panToBooth(booth: Booth) {
    const centerX = booth.x + booth.width / 2;
    const centerY = booth.y + booth.height / 2;
    const newPos = {
      x: dimensions.width / 2 - centerX * scale,
      y: dimensions.height / 2 - centerY * scale,
    };
    setPosition(newPos);
  }

  // Expose panToBooth and zoom via ref
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
    if (booth.category_id && categoryColorMap[booth.category_id]) {
      return categoryColorMap[booth.category_id];
    }
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
          if (stage) {
            setPosition(stage.position());
          }
        }}
      >
        {/* Background image layer */}
        <Layer>
          {bgImage && (
            <KonvaImage
              image={bgImage}
              x={0}
              y={0}
              width={bgImage.naturalWidth}
              height={bgImage.naturalHeight}
            />
          )}
        </Layer>

        {/* Booths layer */}
        <Layer>
          {visibleBooths.map((booth) => {
            const isSelected = booth.id === selectedBoothId;
            const opacity = getBoothOpacity(booth);
            const fill = getBoothFill(booth);
            const fillWithAlpha = scale >= 2.0 ? fill : `${fill}66`;

            return (
              <Group
                key={booth.id}
                x={booth.x}
                y={booth.y}
                opacity={opacity}
                onClick={() => handleBoothClick(booth)}
                onTap={() => handleBoothClick(booth)}
              >
                {/* Booth rectangle */}
                <Rect
                  width={booth.width}
                  height={booth.height}
                  fill={scale >= 2.0 ? `${fill}33` : `${fill}22`}
                  stroke={isSelected ? '#4f46e5' : fill}
                  strokeWidth={isSelected ? 3 / scale : 1.5 / scale}
                  cornerRadius={2 / scale}
                />
                {/* Selection highlight */}
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
                {/* Booth number - always show */}
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
                {/* Company name - show at zoom >= 1.0 */}
                {scale >= 1.0 && booth.company?.name && (
                  <Text
                    text={booth.company.name}
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
                {/* Category - show at zoom >= 2.0 */}
                {scale >= 2.0 && booth.category?.name && (
                  <Text
                    text={booth.category.name}
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
      </Stage>
    </div>
  );
}
