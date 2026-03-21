/**
 * editorHitTest.ts — 에디터 오브젝트 전체 히트 테스트
 * 클릭 좌표 → 어떤 오브젝트에 닿았는지 판정.
 */
import type {
  SelectedObject, Point,
  EditorBooth, EditorObstacle, EditorHall, PathNode, PathEdge, Amenity,
} from './editorTypes';
import {
  hitTestRect, hitTestCircle, hitTestEllipse, hitTestPolygon, pointToSegmentDist,
} from './hitTest';

const NODE_HIT_RADIUS = 12;

interface HitTestData {
  halls: EditorHall[];
  booths: EditorBooth[];
  pathNodes: PathNode[];
  pathEdges: PathEdge[];
  obstacles: EditorObstacle[];
  amenities: Amenity[];
}

function parsePoints(pts: any): Point[] | null {
  if (!pts) return null;
  if (Array.isArray(pts)) return pts;
  try { return JSON.parse(pts); } catch { return null; }
}

/** 우선순위: pathNode > amenity > booth > obstacle > pathEdge > hall */
export function hitTestAll(
  wx: number, wy: number, scale: number, data: HitTestData,
): SelectedObject {
  // Path nodes (작은 타겟, 최우선)
  for (const n of data.pathNodes) {
    if (hitTestCircle(wx, wy, n.x, n.y, NODE_HIT_RADIUS / scale)) {
      return { kind: 'path_node', id: n.id };
    }
  }

  // Amenities
  for (const a of data.amenities) {
    if (hitTestCircle(wx, wy, a.x, a.y, 12 / scale)) {
      return { kind: 'amenity', id: a.id };
    }
  }

  // Booths
  for (const b of data.booths) {
    if (b.shape === 'circle' && b.radius) {
      if (hitTestCircle(wx, wy, b.x, b.y, b.radius)) return { kind: 'booth', id: b.id };
    } else if (b.shape === 'ellipse' && b.radius_x && b.radius_y) {
      if (hitTestEllipse(wx, wy, b.x, b.y, b.radius_x, b.radius_y)) return { kind: 'booth', id: b.id };
    } else if (b.shape === 'polygon') {
      const pts = parsePoints(b.points);
      if (pts && pts.length >= 3 && hitTestPolygon(wx, wy, pts)) return { kind: 'booth', id: b.id };
    } else {
      if (hitTestRect(wx, wy, b.x, b.y, b.width, b.height)) return { kind: 'booth', id: b.id };
    }
  }

  // Obstacles
  for (const o of data.obstacles) {
    if (o.shape === 'circle' && o.radius) {
      if (hitTestCircle(wx, wy, o.x, o.y, o.radius)) return { kind: 'obstacle', id: o.id };
    } else if (o.shape === 'polygon') {
      const pts = parsePoints(o.points);
      if (pts && pts.length >= 3 && hitTestPolygon(wx, wy, pts)) return { kind: 'obstacle', id: o.id };
    } else {
      if (hitTestRect(wx, wy, o.x, o.y, o.width || 40, o.height || 40)) return { kind: 'obstacle', id: o.id };
    }
  }

  // Path edges
  const nodeMap: Record<number, PathNode> = {};
  for (const n of data.pathNodes) nodeMap[n.id] = n;
  for (const edge of data.pathEdges) {
    const from = nodeMap[edge.from_node_id];
    const to = nodeMap[edge.to_node_id];
    if (!from || !to) continue;
    if (pointToSegmentDist(wx, wy, from.x, from.y, to.x, to.y) < 10 / scale) {
      return { kind: 'path_edge', id: edge.id };
    }
  }

  // Halls (가장 크니까 마지막)
  for (const h of data.halls) {
    if (h.shape === 'polygon') {
      const pts = parsePoints(h.points);
      if (pts && pts.length >= 3 && hitTestPolygon(wx, wy, pts)) return { kind: 'hall', id: h.id };
    } else if (h.area_x != null && h.area_y != null && h.area_width != null && h.area_height != null) {
      if (hitTestRect(wx, wy, h.area_x, h.area_y, h.area_width, h.area_height)) return { kind: 'hall', id: h.id };
    }
  }

  return null;
}

/** 오브젝트의 위치 반환 (드래그용) */
export function getObjPosition(
  hit: SelectedObject, data: HitTestData,
): Point | null {
  if (!hit) return null;
  if (hit.kind === 'booth') {
    const b = data.booths.find(bb => bb.id === hit.id);
    return b ? { x: b.x, y: b.y } : null;
  }
  if (hit.kind === 'path_node') {
    const n = data.pathNodes.find(nn => nn.id === hit.id);
    return n ? { x: n.x, y: n.y } : null;
  }
  if (hit.kind === 'obstacle') {
    const o = data.obstacles.find(oo => oo.id === hit.id);
    return o ? { x: o.x, y: o.y } : null;
  }
  if (hit.kind === 'amenity') {
    const a = data.amenities.find(aa => aa.id === hit.id);
    return a ? { x: a.x, y: a.y } : null;
  }
  return null;
}
