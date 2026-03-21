/**
 * useEditorPointer — 에디터 캔버스 포인터 이벤트 훅 (공통 모듈)
 * 모드별 분기: 선택/드래그/사각형/다각형/원/타원/노드/연결/삭제
 */
import { useRef, useEffect, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import type {
  EditorMode, SelectedObject, ShapeCompleteData, Point,
  EditorBooth, EditorObstacle, EditorHall, PathNode, PathEdge, Amenity,
} from './editorTypes';
import {
  hitTestRect, hitTestCircle, hitTestPolygon, pointToSegmentDist,
} from './ShapeDrawer';

const CLICK_THRESHOLD = 5;
const CLICK_TIME = 300;
const NODE_HIT_RADIUS = 12;

interface PointerDeps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  mainContainerRef: React.RefObject<PIXI.Container | null>;
  transformRef: React.RefObject<{ x: number; y: number; scale: number }>;
  previewGraphicsRef: React.RefObject<PIXI.Graphics | null>;
  // Mode
  mode: EditorMode;
  // Data
  halls: EditorHall[];
  booths: EditorBooth[];
  pathNodes: PathNode[];
  pathEdges: PathEdge[];
  obstacles: EditorObstacle[];
  amenities: Amenity[];
  // Callbacks
  onObjectSelect: (obj: SelectedObject) => void;
  onShapeComplete: (mode: EditorMode, data: ShapeCompleteData) => void;
  onNodeConnect: (fromId: number, toId: number) => void;
  onObjectMove: (kind: string, id: number, x: number, y: number) => void;
  onObjectDelete: (kind: string, id: number) => void;
  // State
  pathNodeType: string;
  amenityType: string;
  connectFromId: number | null;
  setConnectFromId: (id: number | null) => void;
  // Zoom
  applyZoom: (newScale: number, pivotX: number, pivotY: number) => void;
}

function screenToWorld(sx: number, sy: number, t: { x: number; y: number; scale: number }): Point {
  return { x: (sx - t.x) / t.scale, y: (sy - t.y) / t.scale };
}

export default function useEditorPointer(deps: PointerDeps) {
  // Stable refs for all deps (avoid stale closures)
  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => {
    const canvas = deps.canvasRef.current;
    if (!canvas) return;

    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let pointerDownInfo = { x: 0, y: 0, time: 0 };
    const pointers = new Map<number, Point>();
    let lastPinchDist = 0;

    // Draw state
    let drawPoints: Point[] = [];
    let isDrawing = false;

    // Select-drag state
    let isDraggingObject = false;
    let dragObjKind = '';
    let dragObjId = 0;
    let dragObjOffset = { x: 0, y: 0 };

    // Polygon state (for polygon modes)
    let polygonPoints: Point[] = [];

    function getWorldPos(e: PointerEvent): Point {
      const rect = canvas!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      return screenToWorld(sx, sy, depsRef.current.transformRef.current!);
    }

    // ===== Hit test all objects =====
    function hitTestAll(wx: number, wy: number, scale: number): SelectedObject {
      const d = depsRef.current;

      // Path nodes first (small targets, priority)
      for (const n of d.pathNodes) {
        if (hitTestCircle(wx, wy, n.x, n.y, NODE_HIT_RADIUS / scale)) {
          return { kind: 'path_node', id: n.id };
        }
      }

      // Amenities
      for (const a of d.amenities) {
        if (hitTestCircle(wx, wy, a.x, a.y, 12 / scale)) {
          return { kind: 'amenity', id: a.id };
        }
      }

      // Booths
      for (const b of d.booths) {
        if (b.shape === 'circle' && b.radius) {
          if (hitTestCircle(wx, wy, b.x, b.y, b.radius)) return { kind: 'booth', id: b.id };
        } else if (b.shape === 'ellipse' && b.radius_x && b.radius_y) {
          const dx = (wx - b.x) / b.radius_x, dy = (wy - b.y) / b.radius_y;
          if (dx * dx + dy * dy <= 1) return { kind: 'booth', id: b.id };
        } else if (b.shape === 'polygon' && b.points && b.points.length >= 3) {
          if (hitTestPolygon(wx, wy, b.points)) return { kind: 'booth', id: b.id };
        } else {
          if (hitTestRect(wx, wy, b.x, b.y, b.width, b.height)) return { kind: 'booth', id: b.id };
        }
      }

      // Obstacles
      for (const o of d.obstacles) {
        if (o.shape === 'circle' && o.radius) {
          if (hitTestCircle(wx, wy, o.x, o.y, o.radius)) return { kind: 'obstacle', id: o.id };
        } else if (o.shape === 'polygon' && o.points && o.points.length >= 3) {
          if (hitTestPolygon(wx, wy, o.points)) return { kind: 'obstacle', id: o.id };
        } else {
          if (hitTestRect(wx, wy, o.x, o.y, o.width || 40, o.height || 40)) return { kind: 'obstacle', id: o.id };
        }
      }

      // Path edges
      const nodeMap: Record<number, PathNode> = {};
      for (const n of d.pathNodes) nodeMap[n.id] = n;
      for (const e of d.pathEdges) {
        const from = nodeMap[e.from_node_id];
        const to = nodeMap[e.to_node_id];
        if (!from || !to) continue;
        if (pointToSegmentDist(wx, wy, from.x, from.y, to.x, to.y) < 10 / scale) {
          return { kind: 'path_edge', id: e.id };
        }
      }

      // Halls
      for (const h of d.halls) {
        if (h.shape === 'polygon' && h.points && h.points.length >= 3) {
          if (hitTestPolygon(wx, wy, h.points)) return { kind: 'hall', id: h.id };
        } else if (h.area_x != null && h.area_y != null && h.area_width != null && h.area_height != null) {
          if (hitTestRect(wx, wy, h.area_x, h.area_y, h.area_width, h.area_height)) return { kind: 'hall', id: h.id };
        }
      }

      return null;
    }

    // ===== Get draggable position for object =====
    function getObjPosition(hit: SelectedObject): Point | null {
      if (!hit) return null;
      const d = depsRef.current;
      if (hit.kind === 'booth') {
        const b = d.booths.find(bb => bb.id === hit.id);
        return b ? { x: b.x, y: b.y } : null;
      }
      if (hit.kind === 'path_node') {
        const n = d.pathNodes.find(nn => nn.id === hit.id);
        return n ? { x: n.x, y: n.y } : null;
      }
      if (hit.kind === 'obstacle') {
        const o = d.obstacles.find(oo => oo.id === hit.id);
        return o ? { x: o.x, y: o.y } : null;
      }
      if (hit.kind === 'amenity') {
        const a = d.amenities.find(aa => aa.id === hit.id);
        return a ? { x: a.x, y: a.y } : null;
      }
      return null;
    }

    // ===== Mode helpers =====
    function isRectMode(m: EditorMode) {
      return m === 'hall_rect' || m === 'booth_rect' || m === 'obstacle_rect';
    }
    function isCircleMode(m: EditorMode) {
      return m === 'booth_circle' || m === 'obstacle_circle';
    }
    function isPolygonMode(m: EditorMode) {
      return m === 'hall_polygon' || m === 'booth_polygon' || m === 'obstacle_polygon';
    }
    function isDrawMode(m: EditorMode) {
      return isRectMode(m) || isCircleMode(m) || m === 'booth_ellipse';
    }

    // ===== POINTER DOWN =====
    function onPointerDown(e: PointerEvent) {
      e.preventDefault();
      canvas!.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      pointerDownInfo = { x: e.clientX, y: e.clientY, time: Date.now() };

      // Pinch
      if (pointers.size >= 2) {
        isDragging = false;
        const pts = Array.from(pointers.values());
        lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        return;
      }

      const d = depsRef.current;
      const m = d.mode;
      const wp = getWorldPos(e);

      // Draw modes (rect, circle, ellipse): start drag
      if (isDrawMode(m)) {
        isDrawing = true;
        drawPoints = [wp];
        return;
      }

      // Polygon mode: click to add point (no drag start)
      if (isPolygonMode(m)) {
        // handled in pointerup as click
        return;
      }

      // Select mode: check hit → drag
      if (m === 'select') {
        const hit = hitTestAll(wp.x, wp.y, d.transformRef.current!.scale);
        if (hit) {
          const pos = getObjPosition(hit);
          if (pos) {
            isDraggingObject = true;
            dragObjKind = hit.kind;
            dragObjId = hit.id;
            dragObjOffset = { x: wp.x - pos.x, y: wp.y - pos.y };
          }
          return;
        }
      }

      // Path connect: handled in pointerup
      if (m === 'path_connect' || m === 'path_node' || m === 'amenity' || m === 'delete') {
        return;
      }

      // Default: map drag
      const t = d.transformRef.current!;
      dragStart = { x: e.clientX - t.x, y: e.clientY - t.y };
      isDragging = true;
    }

    // ===== POINTER MOVE =====
    function onPointerMove(e: PointerEvent) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Pinch zoom
      if (pointers.size === 2) {
        const pts = Array.from(pointers.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        if (lastPinchDist > 0) {
          const rect = canvas!.getBoundingClientRect();
          const cx = (pts[0].x + pts[1].x) / 2 - rect.left;
          const cy = (pts[0].y + pts[1].y) / 2 - rect.top;
          depsRef.current.applyZoom(depsRef.current.transformRef.current!.scale * (dist / lastPinchDist), cx, cy);
        }
        lastPinchDist = dist;
        return;
      }

      const d = depsRef.current;
      const wp = getWorldPos(e);
      const preview = d.previewGraphicsRef.current;

      // Draw mode preview
      if (isDrawing && preview) {
        drawPoints = [drawPoints[0], wp];
        const { drawPreview } = require('./ShapeDrawer');
        drawPreview(preview, d.mode, drawPoints, d.transformRef.current!.scale);
        return;
      }

      // Polygon mode: update last point for live preview
      if (isPolygonMode(d.mode) && polygonPoints.length > 0 && preview) {
        const pts = [...polygonPoints, wp];
        const { drawPreview } = require('./ShapeDrawer');
        drawPreview(preview, d.mode, pts, d.transformRef.current!.scale);
        return;
      }

      // Object drag
      if (isDraggingObject && preview) {
        preview.clear();
        // Simple drag indicator
        preview.lineStyle(2 / d.transformRef.current!.scale, 0x4f46e5, 0.5);
        preview.drawCircle(wp.x - dragObjOffset.x, wp.y - dragObjOffset.y, 6 / d.transformRef.current!.scale);
        return;
      }

      // Map drag
      if (isDragging && e.isPrimary) {
        const t = d.transformRef.current!;
        t.x = e.clientX - dragStart.x;
        t.y = e.clientY - dragStart.y;
        const mc = d.mainContainerRef.current;
        if (mc) mc.position.set(t.x, t.y);
      }
    }

    // ===== POINTER UP =====
    function onPointerUp(e: PointerEvent) {
      canvas!.releasePointerCapture(e.pointerId);
      pointers.delete(e.pointerId);

      const dx = e.clientX - pointerDownInfo.x;
      const dy = e.clientY - pointerDownInfo.y;
      const dt = Date.now() - pointerDownInfo.time;
      const isClick = Math.abs(dx) < CLICK_THRESHOLD && Math.abs(dy) < CLICK_THRESHOLD && dt < CLICK_TIME;

      const d = depsRef.current;
      const m = d.mode;
      const wp = getWorldPos(e);
      const preview = d.previewGraphicsRef.current;

      // Draw mode complete
      if (isDrawing) {
        isDrawing = false;
        if (preview) preview.clear();
        const p0 = drawPoints[0];
        const dist = Math.hypot(wp.x - p0.x, wp.y - p0.y);
        if (dist > 5) {
          if (isRectMode(m)) {
            d.onShapeComplete(m, {
              shape: 'rectangle',
              x: Math.round(Math.min(p0.x, wp.x)),
              y: Math.round(Math.min(p0.y, wp.y)),
              width: Math.round(Math.abs(wp.x - p0.x)),
              height: Math.round(Math.abs(wp.y - p0.y)),
            });
          } else if (isCircleMode(m)) {
            d.onShapeComplete(m, {
              shape: 'circle',
              x: Math.round(p0.x),
              y: Math.round(p0.y),
              radius: Math.round(dist),
            });
          } else if (m === 'booth_ellipse') {
            d.onShapeComplete(m, {
              shape: 'ellipse',
              x: Math.round(p0.x),
              y: Math.round(p0.y),
              radiusX: Math.round(Math.abs(wp.x - p0.x)),
              radiusY: Math.round(Math.abs(wp.y - p0.y)),
            });
          }
        }
        drawPoints = [];
        return;
      }

      // Object drag complete
      if (isDraggingObject) {
        if (preview) preview.clear();
        if (!isClick) {
          d.onObjectMove(dragObjKind, dragObjId,
            Math.round(wp.x - dragObjOffset.x),
            Math.round(wp.y - dragObjOffset.y));
        } else {
          // Click on object → select
          d.onObjectSelect({ kind: dragObjKind as any, id: dragObjId });
        }
        isDraggingObject = false;
        return;
      }

      isDragging = false;

      if (!isClick) {
        if (pointers.size < 2) lastPinchDist = 0;
        return;
      }

      // === Click handling per mode ===

      if (m === 'select') {
        const hit = hitTestAll(wp.x, wp.y, d.transformRef.current!.scale);
        d.onObjectSelect(hit);
        return;
      }

      if (m === 'delete') {
        const hit = hitTestAll(wp.x, wp.y, d.transformRef.current!.scale);
        if (hit) d.onObjectDelete(hit.kind, hit.id);
        return;
      }

      if (m === 'path_node') {
        d.onShapeComplete(m, { shape: 'point', x: Math.round(wp.x), y: Math.round(wp.y) });
        return;
      }

      if (m === 'amenity') {
        d.onShapeComplete(m, { shape: 'point', x: Math.round(wp.x), y: Math.round(wp.y) });
        return;
      }

      if (m === 'path_connect') {
        // Find nearest node
        const scale = d.transformRef.current!.scale;
        for (const n of d.pathNodes) {
          if (hitTestCircle(wp.x, wp.y, n.x, n.y, NODE_HIT_RADIUS / scale)) {
            if (d.connectFromId === null) {
              d.setConnectFromId(n.id);
            } else if (d.connectFromId !== n.id) {
              d.onNodeConnect(d.connectFromId, n.id);
              d.setConnectFromId(null);
            }
            return;
          }
        }
        return;
      }

      // Polygon mode: add point
      if (isPolygonMode(m)) {
        polygonPoints.push({ x: Math.round(wp.x), y: Math.round(wp.y) });
        return;
      }

      if (pointers.size < 2) lastPinchDist = 0;
    }

    // ===== DOUBLE CLICK (polygon complete) =====
    function onDblClick(e: MouseEvent) {
      const d = depsRef.current;
      const m = d.mode;

      if (isPolygonMode(m) && polygonPoints.length >= 3) {
        const preview = d.previewGraphicsRef.current;
        if (preview) preview.clear();
        d.onShapeComplete(m, { shape: 'polygon', points: [...polygonPoints] });
        polygonPoints = [];
      }
    }

    // ===== POINTER CANCEL =====
    function onPointerCancel(e: PointerEvent) {
      pointers.delete(e.pointerId);
      isDragging = false;
      isDrawing = false;
      isDraggingObject = false;
      if (pointers.size < 2) lastPinchDist = 0;
    }

    // ===== WHEEL ZOOM =====
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const rect = canvas!.getBoundingClientRect();
      depsRef.current.applyZoom(
        depsRef.current.transformRef.current!.scale * factor,
        e.clientX - rect.left, e.clientY - rect.top,
      );
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('dblclick', onDblClick);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('dblclick', onDblClick);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // All deps accessed via depsRef — stable setup
}
