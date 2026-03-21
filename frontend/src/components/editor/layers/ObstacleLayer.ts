import * as PIXI from 'pixi.js';
import type { EditorObstacle, SelectedObject, DrawStyle } from '../editorTypes';
import { LAYER_COLORS } from '../editorTypes';
import { drawRect, drawPolygon, drawCircle } from '../ShapeDrawer';

interface ObstacleLayerProps {
  graphics: PIXI.Graphics;
  obstacles: EditorObstacle[];
  scale: number;
  selectedObject: SelectedObject;
}

export function renderObstacleLayer(props: ObstacleLayerProps) {
  const { graphics: g, obstacles, scale, selectedObject } = props;
  g.clear();

  const colors = LAYER_COLORS.obstacle;

  for (const obs of obstacles) {
    const selected = selectedObject?.kind === 'obstacle' && selectedObject.id === obs.id;
    const style: DrawStyle = {
      lineColor: selected ? 0xdc2626 : colors.line,
      lineWidth: 1.5,
      fillColor: colors.fill,
      fillAlpha: selected ? colors.selectedAlpha : colors.alpha,
      selected,
    };

    switch (obs.shape) {
      case 'polygon':
        if (obs.points && obs.points.length >= 3) {
          drawPolygon(g, obs.points, style, scale);
        }
        break;
      case 'circle':
        if (obs.radius != null) {
          drawCircle(g, obs.x, obs.y, obs.radius, style, scale);
        }
        break;
      default: // rectangle
        if (obs.width != null && obs.height != null) {
          drawRect(g, obs.x, obs.y, obs.width, obs.height, style, scale);
        }
        break;
    }

    // Selection ring for circle/polygon (center marker)
    if (selected && obs.shape !== 'rectangle') {
      g.lineStyle(2 / scale, 0xdc2626, 0.8);
      g.drawCircle(obs.x, obs.y, 4 / scale);
      g.lineStyle(0);
    }
  }
}
