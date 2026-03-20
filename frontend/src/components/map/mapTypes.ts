// mapTypes.ts — Interfaces, constants, and pure utility functions
// Extracted from MapViewer.tsx without logic changes

import { Booth, Category, MapImage, Facility, RoutePoint, Obstacle, ZoomLevel, RouteResult } from '@/types';

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
  const idx = Math.round(-Math.log2(Math.max(0.01, scale)));
  return Math.max(0, Math.min(ti.levels.length - 1, idx));
}
