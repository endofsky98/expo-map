import * as PIXI from 'pixi.js';
import type { EditorBooth, SelectedObject, DrawStyle } from '../editorTypes';
import { LAYER_COLORS } from '../editorTypes';
import { drawRect, drawPolygon, drawCircle, drawEllipse, createLabel } from '../ShapeDrawer';

interface BoothLayerProps {
  graphics: PIXI.Graphics;
  labelContainer: PIXI.Container;
  booths: EditorBooth[];
  scale: number;
  selectedObject: SelectedObject;
}

export function renderBoothLayer(props: BoothLayerProps) {
  const { graphics: g, labelContainer, booths, scale, selectedObject } = props;
  g.clear();
  // Remove old labels
  labelContainer.removeChildren();

  const colors = LAYER_COLORS.booth;

  for (const b of booths) {
    const selected = selectedObject?.kind === 'booth' && selectedObject.id === b.id;
    const style: DrawStyle = {
      lineColor: selected ? 0x4f46e5 : colors.line,
      lineWidth: 1.5,
      fillColor: colors.fill,
      fillAlpha: selected ? colors.selectedAlpha : colors.alpha,
      selected,
    };

    // Render by shape type
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
      default: // rectangle
        drawRect(g, b.x, b.y, b.width, b.height, style, scale);
        break;
    }

    // Label: 회사명 우선, 없으면 부스번호 (scale >= 0.5)
    if (scale >= 0.5) {
      const cx = b.shape === 'rectangle' ? b.x + b.width / 2 : b.x;
      const cy = b.shape === 'rectangle' ? b.y + b.height / 2 : b.y;

      // 회사명 (company 객체에서 추출)
      const companyName = b.company_name || ((b as any).company?.name
        ? (typeof (b as any).company.name === 'string' ? (b as any).company.name : (b as any).company.name.ko || (b as any).company.name.en || '')
        : '');
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
