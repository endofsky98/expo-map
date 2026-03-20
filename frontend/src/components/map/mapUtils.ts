import { MapImage, ZoomLevel } from '@/types';
import { MapTransform, TileInfo, MAX_ZOOM, MIN_ZOOM } from './mapTypes';

/** Select best tile level for current scale (lower index = higher res). */
export function selectTileLevel(scale: number, ti: TileInfo): number {
  const idx = Math.round(-Math.log2(Math.max(0.01, scale)));
  return Math.max(0, Math.min(ti.levels.length - 1, idx));
}

/** World→screen with CSS perspective tilt compensation. */
export function worldToScreen(
  wx: number, wy: number, t: MapTransform, cw: number, ch: number,
): { sx: number; sy: number } {
  const cos = Math.cos(t.rotation), sin = Math.sin(t.rotation);
  const sx = t.x + t.scale * (wx * cos - wy * sin);
  const sy = t.y + t.scale * (wx * sin + wy * cos);
  // Tilt is handled by CSS on the wrapper — no JS compensation needed
  return { sx, sy };
}

/** Clamp so image AABB always contains screen center. */
export function clampPosition(
  t: { x: number; y: number; scale: number; rotation: number },
  imgW: number, imgH: number, cw: number, ch: number,
) {
  const sc = t.scale;
  const cosR = Math.cos(t.rotation), sinR = Math.sin(t.rotation);
  const absC = Math.abs(cosR), absS = Math.abs(sinR);
  const halfW = (imgW * absC + imgH * absS) * sc / 2;
  const halfH = (imgW * absS + imgH * absC) * sc / 2;
  const icx = t.x + sc * (imgW / 2 * cosR - imgH / 2 * sinR);
  const icy = t.y + sc * (imgW / 2 * sinR + imgH / 2 * cosR);
  const scx = cw / 2, scy = ch / 2;
  let dx = 0, dy = 0;
  if (icx + halfW < scx) dx = scx - (icx + halfW);
  else if (icx - halfW > scx) dx = scx - (icx - halfW);
  if (icy + halfH < scy) dy = scy - (icy + halfH);
  else if (icy - halfH > scy) dy = scy - (icy - halfH);
  t.x += dx; t.y += dy;
}

/** How many markers to show at a given scale. */
export function maxMarkersForScale(scale: number): number {
  if (scale >= 3.0) return 30;
  if (scale >= 2.0) return 20;
  if (scale >= 1.0) return 15;
  return 8;
}

export function parseZoomLevels(img: MapImage): ZoomLevel[] {
  if (!img.zoom_levels) return [];
  if (typeof img.zoom_levels === 'string') {
    try { return JSON.parse(img.zoom_levels); } catch { return []; }
  }
  return img.zoom_levels;
}

export function resolveImageUrl(path: string, apiBase: string): string {
  if (!path) return '';
  return path.startsWith('http') ? path : `${apiBase}${path}`;
}

/** Viewport bounds in world space (rotation-aware). */
export function viewportToWorldBounds(
  tx: number, ty: number, sc: number, rot: number, cw: number, ch: number,
) {
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  const corners = [[0, 0], [cw, 0], [cw, ch], [0, ch]];
  const wc = corners.map(([sx, sy]) => ({
    x: ((sx - tx) * cosR + (sy - ty) * sinR) / sc,
    y: (-(sx - tx) * sinR + (sy - ty) * cosR) / sc,
  }));
  const xs = wc.map(c => c.x), ys = wc.map(c => c.y);
  return {
    x: Math.min(...xs), y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}
