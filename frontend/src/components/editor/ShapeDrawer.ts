/**
 * ShapeDrawer — PIXI 도형 그리기 유틸 (공통 모듈)
 * 모든 레이어에서 일관된 스타일로 도형을 그리기 위한 함수 모음.
 */
import * as PIXI from 'pixi.js';
import type { Point, DrawStyle, PathNodeType, EditorMode } from './editorTypes';
import { PATH_NODE_COLORS, AMENITY_COLORS, AmenityType } from './editorTypes';

// ===== 기본 도형 =====

export function drawRect(
  g: PIXI.Graphics, x: number, y: number, w: number, h: number,
  style: DrawStyle, scale: number,
) {
  g.lineStyle((style.selected ? 3 : style.lineWidth) / scale, style.lineColor, style.lineAlpha ?? 1);
  g.beginFill(style.fillColor, style.selected ? style.fillAlpha * 2 : style.fillAlpha);
  g.drawRect(x, y, w, h);
  g.endFill();
}

export function drawPolygon(
  g: PIXI.Graphics, points: Point[], style: DrawStyle, scale: number,
) {
  if (points.length < 3) return;
  g.lineStyle((style.selected ? 3 : style.lineWidth) / scale, style.lineColor, style.lineAlpha ?? 1);
  g.beginFill(style.fillColor, style.selected ? style.fillAlpha * 2 : style.fillAlpha);
  const flat = points.flatMap(p => [p.x, p.y]);
  g.drawPolygon(flat);
  g.endFill();
}

export function drawCircle(
  g: PIXI.Graphics, cx: number, cy: number, r: number,
  style: DrawStyle, scale: number,
) {
  g.lineStyle((style.selected ? 3 : style.lineWidth) / scale, style.lineColor, style.lineAlpha ?? 1);
  g.beginFill(style.fillColor, style.selected ? style.fillAlpha * 2 : style.fillAlpha);
  g.drawCircle(cx, cy, r);
  g.endFill();
}

export function drawEllipse(
  g: PIXI.Graphics, cx: number, cy: number, rx: number, ry: number,
  style: DrawStyle, scale: number,
) {
  g.lineStyle((style.selected ? 3 : style.lineWidth) / scale, style.lineColor, style.lineAlpha ?? 1);
  g.beginFill(style.fillColor, style.selected ? style.fillAlpha * 2 : style.fillAlpha);
  g.drawEllipse(cx, cy, rx, ry);
  g.endFill();
}

// ===== Path 노드 =====

const NODE_RADIUS = 8;

export function drawPathNode(
  g: PIXI.Graphics, x: number, y: number, type: PathNodeType,
  selected: boolean, scale: number,
) {
  const color = PATH_NODE_COLORS[type] || 0x6b7280;
  const r = NODE_RADIUS / scale;

  // 선택 링
  if (selected) {
    g.lineStyle(2 / scale, 0x4f46e5, 0.8);
    g.drawCircle(x, y, r * 1.8);
    g.lineStyle(0);
  }

  // 노드 본체
  g.lineStyle(1.5 / scale, 0xffffff);
  g.beginFill(color, 0.95);
  g.drawCircle(x, y, r);
  g.endFill();

  // 타입별 표시
  if (type === 'stairs' || type === 'escalator' || type === 'elevator') {
    // 층간 연결 표시: 이중 원
    g.lineStyle(1 / scale, 0xf97316, 0.8);
    g.drawCircle(x, y, r * 1.4);
  }
}

// ===== Path 엣지 =====

export function drawPathEdge(
  g: PIXI.Graphics, from: Point, to: Point,
  style: DrawStyle, scale: number,
) {
  g.lineStyle((style.selected ? 3 : style.lineWidth) / scale, style.lineColor, style.lineAlpha ?? 1);
  g.moveTo(from.x, from.y);
  g.lineTo(to.x, to.y);
}

// ===== Amenity 아이콘 =====

export function drawAmenityMarker(
  g: PIXI.Graphics, x: number, y: number, type: string,
  selected: boolean, scale: number,
) {
  const color = AMENITY_COLORS[type as AmenityType] || 0x6b7280;
  const r = 8 / scale;

  if (selected) {
    g.lineStyle(3 / scale, 0x1d4ed8, 1);
    g.beginFill(color, 0.5);
  } else {
    g.lineStyle(1.5 / scale, color, 0.8);
    g.beginFill(color, 0.3);
  }
  g.drawCircle(x, y, r);
  g.endFill();
}

// ===== 프리뷰 (드래그 중 표시) =====

export function drawPreview(
  g: PIXI.Graphics, mode: EditorMode, points: Point[], scale: number,
) {
  g.clear();
  if (points.length < 1) return;

  const p0 = points[0];
  const pLast = points[points.length - 1];

  switch (mode) {
    // 사각형 드래그 프리뷰
    case 'hall_rect':
    case 'booth_rect':
    case 'obstacle_rect': {
      if (points.length < 2) return;
      const color = mode === 'booth_rect' ? 0x22c55e : mode === 'obstacle_rect' ? 0xef4444 : 0x8b5cf6;
      const x = Math.min(p0.x, pLast.x);
      const y = Math.min(p0.y, pLast.y);
      const w = Math.abs(pLast.x - p0.x);
      const h = Math.abs(pLast.y - p0.y);
      g.lineStyle(2 / scale, color, 0.8);
      g.beginFill(color, 0.15);
      g.drawRect(x, y, w, h);
      g.endFill();
      break;
    }

    // 다각형 프리뷰 (점 이어서)
    case 'hall_polygon':
    case 'booth_polygon':
    case 'obstacle_polygon': {
      const color = mode === 'booth_polygon' ? 0x22c55e : mode === 'obstacle_polygon' ? 0xef4444 : 0x8b5cf6;
      if (points.length >= 2) {
        g.lineStyle(2 / scale, color, 0.8);
        g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          g.lineTo(points[i].x, points[i].y);
        }
        // 닫기 프리뷰 (마지막 점 → 첫 점 점선처럼)
        if (points.length >= 3) {
          g.lineStyle(1 / scale, color, 0.4);
          g.lineTo(points[0].x, points[0].y);
        }
      }
      // 점 표시
      for (const p of points) {
        g.lineStyle(0);
        g.beginFill(color, 0.8);
        g.drawCircle(p.x, p.y, 4 / scale);
        g.endFill();
      }
      break;
    }

    // 원 프리뷰 (중심 + 드래그)
    case 'booth_circle':
    case 'obstacle_circle': {
      if (points.length < 2) return;
      const color = mode === 'booth_circle' ? 0x22c55e : 0xef4444;
      const r = Math.hypot(pLast.x - p0.x, pLast.y - p0.y);
      g.lineStyle(2 / scale, color, 0.8);
      g.beginFill(color, 0.15);
      g.drawCircle(p0.x, p0.y, r);
      g.endFill();
      break;
    }

    // 타원 프리뷰
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

    // 통로 직선 프리뷰
    case 'path_node': {
      // 노드 배치 모드에서는 마우스 위치에 작은 원 표시
      g.lineStyle(1.5 / scale, 0x6366f1, 0.6);
      g.drawCircle(pLast.x, pLast.y, NODE_RADIUS / scale);
      break;
    }

    case 'path_connect': {
      // 두 노드 연결 프리뷰
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

// ===== 텍스트 라벨 =====

export function createLabel(
  text: string, x: number, y: number, color: string,
  scale: number, anchor?: { x: number; y: number },
): PIXI.Text {
  const label = new PIXI.Text(text, {
    fontSize: Math.max(6, 8 / scale),
    fontFamily: 'Inter, sans-serif',
    fill: color,
    fontWeight: 'bold',
  });
  if (anchor) label.anchor.set(anchor.x, anchor.y);
  label.x = x;
  label.y = y;
  return label;
}

// ===== Hit Test 유틸 =====

export function hitTestRect(wx: number, wy: number, x: number, y: number, w: number, h: number): boolean {
  return wx >= x && wx <= x + w && wy >= y && wy <= y + h;
}

export function hitTestCircle(wx: number, wy: number, cx: number, cy: number, r: number): boolean {
  return Math.hypot(wx - cx, wy - cy) <= r;
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

export function pointToSegmentDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
