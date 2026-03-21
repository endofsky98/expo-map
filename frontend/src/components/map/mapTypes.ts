// mapTypes.ts — Interfaces, constants, and pure utility functions
// Extracted from MapViewer.tsx without logic changes

import { Booth, Hall, Category, MapImage, Facility, RoutePoint, Obstacle, ZoomLevel, RouteResult } from '@/types';

export interface TileLevelInfo {
  level: number;
  width: number;
  height: number;
  cols: number;
  rows: number;
}

export interface TileInfo {
  tile_size: number;
  levels: TileLevelInfo[];
}

export interface CurrentPosition {
  x: number;
  y: number;
  floorId: number;
  hallId: number;
}

export interface MapViewerProps {
  booths: Booth[];
  halls?: Hall[];
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

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8.0;
export const MIN_TILT = 0;
export const MAX_TILT = 60;
export const MIN_BOOTH_SCREEN_SIZE = 3;
export const CLICK_THRESHOLD = 5;
export const CLICK_TIME_THRESHOLD = 300;
export const ROTATION_THRESHOLD = 25;
export const ZOOM_THRESHOLD = 0.1;
export const MIN_MARKER_DIST = 60;

export function maxMarkersForScale(scale: number): number {
  if (scale >= 3.0) return 30;
  if (scale >= 2.0) return 20;
  if (scale >= 1.0) return 15;
  return 8;
}

export const FACILITY_STYLES: Record<string, { color: number; label: string }> = {
  restroom: { color: 0x3b82f6, label: 'WC' },
  emergency_exit: { color: 0xef4444, label: 'EXIT' },
  stairs: { color: 0x22c55e, label: 'S' },
  elevator: { color: 0xf59e0b, label: 'EV' },
  escalator: { color: 0xf97316, label: 'ES' },
};

export function parseZoomLevels(img: MapImage): ZoomLevel[] {
  if (!img.zoom_levels) return [];
  if (typeof img.zoom_levels === 'string') {
    try { return JSON.parse(img.zoom_levels); } catch { return []; }
  }
  return img.zoom_levels;
}

export function hexStringToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

export function selectTileLevel(scale: number, ti: TileInfo): number {
  // Mapbox style: always pick the level with resolution >= screen pixel resolution
  // Account for devicePixelRatio — on retina displays we need higher-res tiles
  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  const effectiveScale = scale * dpr;
  // Math.floor → always round toward higher resolution level
  // e.g. scale=0.7, dpr=2 → effective=1.4 → idx=floor(-0.49)=floor(-0.49)=-1→clamped to 0
  // e.g. scale=0.3, dpr=1 → effective=0.3 → idx=floor(1.74)=1 → Level 1
  const idx = Math.floor(-Math.log2(Math.max(0.01, effectiveScale)));
  return Math.max(0, Math.min(ti.levels.length - 1, idx));
}
