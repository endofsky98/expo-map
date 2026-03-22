/**
 * ShapeDrawer.ts — PIXI 도형 그리기 유틸 (순수 렌더링)
 * 히트테스트는 hitTest.ts, 프리뷰는 drawPreview.ts 참조.
 */
import * as PIXI from 'pixi.js';
import type { Point, DrawStyle, PathNodeType } from './editorTypes';
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
  g.drawPolygon(points.flatMap(p => [p.x, p.y]));
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

  if (selected) {
    g.lineStyle(2 / scale, 0x4f46e5, 0.8);
    g.drawCircle(x, y, r * 1.8);
    g.lineStyle(0);
  }

  g.lineStyle(1.5 / scale, 0xffffff);
  g.beginFill(color, 0.95);
  g.drawCircle(x, y, r);
  g.endFill();

  // 층간 연결 표시
  if (type === 'stairs' || type === 'escalator' || type === 'elevator') {
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

// ===== Amenity 마커 =====

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

// ===== 텍스트 라벨 =====

/** 텍스트 캐시: key → { text, style, resolution } */
const _labelCache = new Map<string, PIXI.Text>();
let _labelCacheGen = 0;

/** 현재 렌더 사이클에서 사용된 캐시 키 */
let _usedKeys = new Set<string>();

/** 렌더 사이클 시작 시 호출 — 미사용 캐시 정리 */
export function beginLabelCycle() {
  _labelCacheGen++;
  _usedKeys = new Set();
}

/** 렌더 사이클 종료 시 호출 — 미사용 Text destroy */
export function endLabelCycle() {
  for (const [key, t] of _labelCache) {
    if (!_usedKeys.has(key)) {
      t.destroy(true);
      _labelCache.delete(key);
    }
  }
}

export function createLabel(
  text: string, x: number, y: number, color: string,
  scale: number, anchor?: { x: number; y: number },
): PIXI.Text {
  const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
  const fontSize = Math.max(15, 20 / scale);
  const res = Math.min(dpr, 2); // 모바일 과도한 해상도 방지

  // 캐시 키: 텍스트+색상+fontSize 기준 (위치는 매번 변경 가능)
  const cacheKey = `${text}|${color}|${Math.round(fontSize)}`;
  _usedKeys.add(cacheKey);

  let label = _labelCache.get(cacheKey);
  if (label && !label.destroyed) {
    // 위치만 업데이트
    label.x = x;
    label.y = y;
    if (label.parent) label.parent.removeChild(label);
    return label;
  }

  label = new PIXI.Text(text, {
    fontSize,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif',
    fill: color,
    fontWeight: '600',
  });
  label.resolution = res;
  if (anchor) label.anchor.set(anchor.x, anchor.y);
  label.x = x;
  label.y = y;
  _labelCache.set(cacheKey, label);
  return label;
}
