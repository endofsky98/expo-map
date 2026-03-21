/**
 * resizeHandles.ts — 리사이즈 핸들 유틸리티
 * 사각형 오브젝트의 8개 리사이즈 핸들 계산/히트테스트/적용.
 */
import type { Point } from './editorTypes';

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface ResizeHandlePoint {
  handle: ResizeHandle;
  x: number;
  y: number;
}

export interface ResizeOrigin {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 사각형의 8개 핸들 좌표 계산 */
export function getHandlePoints(x: number, y: number, w: number, h: number): ResizeHandlePoint[] {
  return [
    { handle: 'nw', x: x,           y: y           },
    { handle: 'n',  x: x + w / 2,   y: y           },
    { handle: 'ne', x: x + w,       y: y           },
    { handle: 'e',  x: x + w,       y: y + h / 2   },
    { handle: 'se', x: x + w,       y: y + h       },
    { handle: 's',  x: x + w / 2,   y: y + h       },
    { handle: 'sw', x: x,           y: y + h       },
    { handle: 'w',  x: x,           y: y + h / 2   },
  ];
}

/** 핸들 히트테스트. 히트한 핸들 이름 반환, 없으면 null */
export function hitTestHandles(
  wx: number, wy: number,
  x: number, y: number, w: number, h: number,
  scale: number,
  hitRadius = 8,
): ResizeHandle | null {
  const r = hitRadius / scale;
  const pts = getHandlePoints(x, y, w, h);
  for (const p of pts) {
    const dx = wx - p.x, dy = wy - p.y;
    if (dx * dx + dy * dy <= r * r) return p.handle;
  }
  return null;
}

/** 핸들 드래그로 새 x/y/w/h 계산 */
export function applyHandleDrag(
  handle: ResizeHandle,
  origin: ResizeOrigin,
  dx: number,
  dy: number,
): { x: number; y: number; w: number; h: number } {
  let { x, y, w, h } = origin;
  const MIN = 10;

  switch (handle) {
    case 'nw': x += dx; y += dy; w -= dx; h -= dy; break;
    case 'n':  y += dy; h -= dy; break;
    case 'ne': y += dy; w += dx; h -= dy; break;
    case 'e':  w += dx; break;
    case 'se': w += dx; h += dy; break;
    case 's':  h += dy; break;
    case 'sw': x += dx; w -= dx; h += dy; break;
    case 'w':  x += dx; w -= dx; break;
  }

  // Clamp minimum size
  if (w < MIN) { if (handle.includes('w')) x = origin.x + origin.w - MIN; w = MIN; }
  if (h < MIN) { if (handle.includes('n')) y = origin.y + origin.h - MIN; h = MIN; }

  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** 리사이즈 핸들 렌더링 (PIXI.Graphics에 직접) */
export function drawResizeHandles(
  g: import('pixi.js').Graphics,
  x: number, y: number, w: number, h: number,
  scale: number,
) {
  const size = 6 / scale;
  const half = size / 2;
  const pts = getHandlePoints(x, y, w, h);

  g.lineStyle(1.5 / scale, 0x4f46e5, 1);
  g.beginFill(0xffffff, 1);
  for (const p of pts) {
    g.drawRect(p.x - half, p.y - half, size, size);
  }
  g.endFill();
}
