import * as PIXI from 'pixi.js';
import type { EditorBooth, SelectedObject, DrawStyle } from '../editorTypes';
import { LAYER_COLORS } from '../editorTypes';
import { drawRect, drawPolygon, drawCircle, drawEllipse, createLabel } from '../ShapeDrawer';
import { drawResizeHandles } from '../resizeHandles';

interface BoothLayerProps {
  graphics: PIXI.Graphics;
  labelContainer: PIXI.Container;
  booths: EditorBooth[];
  scale: number;
  selectedObject: SelectedObject;
}

/** hex color string (#RRGGBB) → 0xRRGGBB number */
function hexToNum(hex: string): number {
  return parseInt(hex.replace('#', ''), 16) || LAYER_COLORS.booth.fill;
}

/** 다국어 이름 → 한국어 우선 */
function ln(name: unknown): string {
  if (!name) return '';
  if (typeof name === 'string') return name;
  if (typeof name === 'object' && name !== null) {
    const n = name as Record<string, string>;
    return n.ko || n.en || Object.values(n)[0] || '';
  }
  return String(name);
}

export function renderBoothLayer(props: BoothLayerProps) {
  const { graphics: g, labelContainer, booths, scale, selectedObject } = props;
  g.clear();
  labelContainer.removeChildren();

  const defaultColors = LAYER_COLORS.booth;

  for (const b of booths) {
    const selected = selectedObject?.kind === 'booth' && selectedObject.id === b.id;

    // 카테고리 색상 적용 (category.color 또는 booth.color)
    const catColor = (b as any).category?.color || b.color;
    const fillColor = catColor ? hexToNum(catColor) : defaultColors.fill;

    const style: DrawStyle = {
      lineColor: selected ? 0x4f46e5 : (catColor ? hexToNum(catColor) : defaultColors.line),
      lineWidth: 1.5,
      fillColor,
      fillAlpha: selected ? defaultColors.selectedAlpha : defaultColors.alpha,
      selected,
    };

    switch (b.shape) {
      case 'polygon':
        if (b.points && b.points.length >= 3) drawPolygon(g, b.points, style, scale);
        break;
      case 'circle':
        if (b.radius) drawCircle(g, b.x, b.y, b.radius, style, scale);
        break;
      case 'ellipse':
        if (b.radius_x && b.radius_y) drawEllipse(g, b.x, b.y, b.radius_x, b.radius_y, style, scale);
        break;
      default:
        drawRect(g, b.x, b.y, b.width, b.height, style, scale);
        if (selected) drawResizeHandles(g, b.x, b.y, b.width, b.height, scale);
        break;
    }

    // Label: 회사명 우선, 없으면 부스번호
    if (scale >= 0.5) {
      const cx = b.shape === 'rectangle' ? b.x + b.width / 2 : b.x;
      const cy = b.shape === 'rectangle' ? b.y + b.height / 2 : b.y;

      const companyName = b.company_name || ln((b as any).company?.name);
      const catName = ln((b as any).category?.name);
      const displayName = companyName || b.booth_number;

      if (displayName) {
        const label = createLabel(displayName, cx, cy, selected ? '#312e81' : '#1e293b', scale, { x: 0.5, y: 0.5 });
        labelContainer.addChild(label);
      }

      // 회사명이 있으면 부스번호를 아래에 작게
      if (companyName && scale >= 0.8) {
        const numLabel = createLabel(b.booth_number, cx, cy + 14 / scale, '#94a3b8', scale, { x: 0.5, y: 0.5 });
        labelContainer.addChild(numLabel);
      }
    }
  }
}
