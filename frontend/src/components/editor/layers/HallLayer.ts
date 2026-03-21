import * as PIXI from 'pixi.js';
import type { EditorHall, SelectedObject, DrawStyle, Point } from '../editorTypes';
import { LAYER_COLORS } from '../editorTypes';
import { drawRect, drawPolygon } from '../ShapeDrawer';
import { drawResizeHandles } from '../resizeHandles';

interface HallLayerProps {
  graphics: PIXI.Graphics;
  halls: EditorHall[];
  scale: number;
  selectedObject: SelectedObject;
}

export function renderHallLayer(props: HallLayerProps) {
  const { graphics: g, halls, scale, selectedObject } = props;
  g.clear();

  const colors = LAYER_COLORS.hall;

  // Sort by order so lower-order halls render first (background)
  const sorted = [...halls].sort((a, b) => a.order - b.order);

  for (const hall of sorted) {
    const selected = selectedObject?.kind === 'hall' && selectedObject.id === hall.id;
    const style: DrawStyle = {
      lineColor: selected ? 0x7c3aed : colors.line,
      lineWidth: 2,
      lineAlpha: selected ? 0.9 : 0.5,
      fillColor: colors.fill,
      fillAlpha: selected ? colors.selectedAlpha : colors.alpha,
      selected,
    };

    const shape = hall.shape ?? 'rectangle';

    switch (shape) {
      case 'polygon':
        const pts: Point[] | null = (() => { if (!hall.points) return null; if (Array.isArray(hall.points)) return hall.points; try { return JSON.parse(hall.points as unknown as string); } catch { return null; } })();
        if (pts && pts.length >= 3) {
          drawPolygon(g, pts, style, scale);
        }
        break;
      default: // rectangle
        if (
          hall.area_x != null && hall.area_y != null &&
          hall.area_width != null && hall.area_height != null
        ) {
          drawRect(g, hall.area_x, hall.area_y, hall.area_width, hall.area_height, style, scale);
          // 선택된 사각형 홀에 리사이즈 핸들 표시
          if (selected) drawResizeHandles(g, hall.area_x, hall.area_y, hall.area_width, hall.area_height, scale);
        }
        break;
    }
  }
}
