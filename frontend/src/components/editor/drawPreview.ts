/**
 * drawPreview.ts — 드래그/클릭 중 프리뷰 렌더링
 * 사각형, 다각형, 원, 타원, 노드, 연결선 프리뷰.
 */
import * as PIXI from 'pixi.js';
import type { EditorMode, Point } from './editorTypes';

const NODE_RADIUS = 8;

/** 사각형 모드 프리뷰 색상 */
function rectColor(mode: EditorMode): number {
  if (mode === 'booth_rect') return 0x22c55e;
  if (mode === 'obstacle_rect') return 0xef4444;
  if (mode === 'zone_rect') return 0x06b6d4; // cyan for zone
  return 0x8b5cf6; // hall
}

/** 다각형 모드 프리뷰 색상 */
function polyColor(mode: EditorMode): number {
  if (mode === 'booth_polygon') return 0x22c55e;
  if (mode === 'obstacle_polygon') return 0xef4444;
  if (mode === 'zone_polygon') return 0x06b6d4; // cyan for zone
  return 0x8b5cf6; // hall
}

export function drawPreview(
  g: PIXI.Graphics, mode: EditorMode, points: Point[], scale: number,
) {
  g.clear();
  if (points.length < 1) return;

  const p0 = points[0];
  const pLast = points[points.length - 1];

  switch (mode) {
    // ===== 사각형 =====
    case 'hall_rect':
    case 'zone_rect':
    case 'booth_rect':
    case 'obstacle_rect': {
      if (points.length < 2) return;
      const c = rectColor(mode);
      const x = Math.min(p0.x, pLast.x);
      const y = Math.min(p0.y, pLast.y);
      const w = Math.abs(pLast.x - p0.x);
      const h = Math.abs(pLast.y - p0.y);
      g.lineStyle(2 / scale, c, 0.8);
      g.beginFill(c, 0.15);
      g.drawRect(x, y, w, h);
      g.endFill();
      break;
    }

    // ===== 다각형 =====
    case 'hall_polygon':
    case 'zone_polygon':
    case 'booth_polygon':
    case 'obstacle_polygon': {
      const c = polyColor(mode);
      if (points.length >= 2) {
        g.lineStyle(2 / scale, c, 0.8);
        g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          g.lineTo(points[i].x, points[i].y);
        }
        if (points.length >= 3) {
          g.lineStyle(1 / scale, c, 0.4);
          g.lineTo(points[0].x, points[0].y);
        }
      }
      for (const p of points) {
        g.lineStyle(0);
        g.beginFill(c, 0.8);
        g.drawCircle(p.x, p.y, 4 / scale);
        g.endFill();
      }
      break;
    }

    // ===== 원 =====
    case 'booth_circle':
    case 'obstacle_circle': {
      if (points.length < 2) return;
      const c = mode === 'booth_circle' ? 0x22c55e : 0xef4444;
      const r = Math.hypot(pLast.x - p0.x, pLast.y - p0.y);
      g.lineStyle(2 / scale, c, 0.8);
      g.beginFill(c, 0.15);
      g.drawCircle(p0.x, p0.y, r);
      g.endFill();
      break;
    }

    // ===== 타원 =====
    case 'booth_ellipse': {
      if (points.length < 2) return;
      const rx = Math.abs(pLast.x - p0.x);
      const ry = Math.abs(pLast.y - p0.y);
      g.lineStyle(2 / scale, 0x22c55e, 0.8);
      g.beginFill(0x22c55e, 0.15);
      g.drawEllipse(p0.x, p0.y, rx, ry);
      g.endFill();
      break;
    }

    // ===== 노드 배치 =====
    case 'path_node': {
      g.lineStyle(1.5 / scale, 0x6366f1, 0.6);
      g.drawCircle(pLast.x, pLast.y, NODE_RADIUS / scale);
      break;
    }

    // ===== 노드 연결선 =====
    case 'path_connect': {
      if (points.length >= 2) {
        g.lineStyle(2 / scale, 0x22c55e, 0.5);
        g.moveTo(p0.x, p0.y);
        g.lineTo(pLast.x, pLast.y);
      }
      break;
    }

    default:
      break;
  }
}
