/**
 * hitTest.ts — 오브젝트 히트 테스트 유틸
 * 점이 도형(사각형/원/다각형/선분) 안에 있는지 판정.
 */
import type { Point } from './editorTypes';

export function hitTestRect(
  wx: number, wy: number,
  x: number, y: number, w: number, h: number,
): boolean {
  return wx >= x && wx <= x + w && wy >= y && wy <= y + h;
}

export function hitTestCircle(
  wx: number, wy: number,
  cx: number, cy: number, r: number,
): boolean {
  return Math.hypot(wx - cx, wy - cy) <= r;
}

export function hitTestEllipse(
  wx: number, wy: number,
  cx: number, cy: number, rx: number, ry: number,
): boolean {
  const dx = (wx - cx) / rx;
  const dy = (wy - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

export function hitTestPolygon(wx: number, wy: number, points: Point[]): boolean {
  // Ray casting algorithm
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;
    if (((yi > wy) !== (yj > wy)) && (wx < (xj - xi) * (wy - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/** 점에서 선분까지 최단 거리 */
export function pointToSegmentDist(
  px: number, py: number,
  x1: number, y1: number, x2: number, y2: number,
): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
