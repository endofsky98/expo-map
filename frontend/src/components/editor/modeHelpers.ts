/**
 * modeHelpers.ts — EditorMode 분류 유틸
 */
import type { EditorMode } from './editorTypes';

export function isRectMode(m: EditorMode): boolean {
  return m === 'hall_rect' || m === 'zone_rect' || m === 'booth_rect' || m === 'obstacle_rect';
}

export function isCircleMode(m: EditorMode): boolean {
  return m === 'booth_circle' || m === 'obstacle_circle';
}

export function isPolygonMode(m: EditorMode): boolean {
  return m === 'hall_polygon' || m === 'zone_polygon' || m === 'booth_polygon' || m === 'obstacle_polygon';
}

/** rect, circle, ellipse — 드래그로 그리는 모드 */
export function isDrawMode(m: EditorMode): boolean {
  return isRectMode(m) || isCircleMode(m) || m === 'booth_ellipse';
}

/** 클릭으로 즉시 배치하는 모드 */
export function isClickMode(m: EditorMode): boolean {
  return m === 'path_node' || m === 'path_connect' || m === 'amenity' || m === 'delete';
}
