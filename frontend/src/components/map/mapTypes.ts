import { Booth, Category, MapImage, Facility, RoutePoint, Obstacle, ZoomLevel, RouteResult } from '@/types';

// ===== Transform =====
export interface MapTransform {
  x: number; y: number; scale: number; rotation: number; tilt: number;
}

// ===== Tiles =====
export interface TileLevelInfo {
  level: number; width: number; height: number; cols: number; rows: number;
}
export interface TileInfo {
  tile_size: number; levels: TileLevelInfo[];
}

// Mapbox-style tile state
export type TileState = 'idle' | 'loading' | 'loaded' | 'errored';
export interface TileEntry {
  key: string;
  url: string;
  state: TileState;
  retries: number;
  sprite: any | null; // PIXI.Sprite or PIXI.Graphics placeholder
}

// ===== Constants =====
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8.0;
export const MIN_TILT = 0;
export const MAX_TILT = 60;
export const CLICK_THRESHOLD = 5;
export const CLICK_TIME_THRESHOLD = 300;
export const ROTATION_THRESHOLD = 25;   // px along circumference (Mapbox)
export const ZOOM_THRESHOLD = 0.1;      // log2 delta (Mapbox)
export const INERTIA_FRICTION = 0.85;
export const INERTIA_MIN_VELOCITY = 0.5;
export const INERTIA_INITIAL_FACTOR = 0.5;
export const MIN_MARKER_DIST = 60;
export const MAX_TILE_RETRIES = 3;
export const TILE_RETRY_BASE_MS = 500;
export const CANVAS_PAD = 0.2;          // overscan ratio

// ===== Props =====
export interface MapViewerProps {
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
  currentPosition: { x: number; y: number; floorId: number; hallId: number } | null;
  showBooths: boolean;
  prefetchRange: number;
  onBoothClick: (booth: Booth) => void;
  onMapClick?: (x: number, y: number, floorId: number) => void;
  onZoomChange?: (zoom: number) => void;
}

export const FACILITY_STYLES: Record<string, { color: number; label: string }> = {
  restroom: { color: 0x3b82f6, label: 'WC' },
  emergency_exit: { color: 0xef4444, label: 'EXIT' },
  stairs: { color: 0x22c55e, label: 'S' },
  elevator: { color: 0xf59e0b, label: 'EV' },
  escalator: { color: 0xf97316, label: 'ES' },
};
