/**
 * useEditorPointer.ts — 에디터 포인터 이벤트 훅
 * 이벤트 바인딩 + 모드별 분기. 세부 로직은 외부 모듈 참조.
 */
import { useRef, useEffect } from 'react';
import * as PIXI from 'pixi.js';
import type {
  EditorMode, SelectedObject, ShapeCompleteData, Point,
  EditorBooth, EditorObstacle, EditorHall, PathNode, PathEdge, Amenity,
} from './editorTypes';
import { hitTestAll, getObjPosition } from './editorHitTest';
import { hitTestCircle } from './hitTest';
import { drawPreview } from './drawPreview';
import { isRectMode, isCircleMode, isPolygonMode, isDrawMode } from './modeHelpers';
import { hitTestHandles, applyHandleDrag, hitTestVertexHandles, type ResizeHandle, type ResizeOrigin } from './resizeHandles';

const CLICK_THRESHOLD = 5;
const CLICK_TIME = 300;
const NODE_HIT_RADIUS = 12;

export interface PointerDeps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  mainContainerRef: React.RefObject<PIXI.Container | null>;
  transformRef: React.RefObject<{ x: number; y: number; scale: number }>;
  previewGraphicsRef: React.RefObject<PIXI.Graphics | null>;
  mode: EditorMode;
  halls: EditorHall[];
  booths: EditorBooth[];
  pathNodes: PathNode[];
  pathEdges: PathEdge[];
  obstacles: EditorObstacle[];
  amenities: Amenity[];
  selectedObject: SelectedObject;
  onObjectSelect: (obj: SelectedObject) => void;
  onShapeComplete: (mode: EditorMode, data: ShapeCompleteData) => void;
  onNodeConnect: (fromId: number, toId: number) => void;
  onObjectMove: (kind: string, id: number, x: number, y: number) => void;
  onObjectMoveEnd?: (kind: string, id: number, x: number, y: number) => void;
  onObjectResize?: (kind: string, id: number, x: number, y: number, w: number, h: number) => void;
  onObjectResizeEnd?: (kind: string, id: number, x: number, y: number, w: number, h: number) => void;
  onVertexMove?: (kind: string, id: number, vertexIdx: number, x: number, y: number) => void;
  onVertexMoveEnd?: (kind: string, id: number, vertexIdx: number, x: number, y: number) => void;
  onObjectDelete: (kind: string, id: number) => void;
  connectFromId: number | null;
  setConnectFromId: (id: number | null) => void;
  applyZoom: (newScale: number, pivotX: number, pivotY: number) => void;
}

function screenToWorld(sx: number, sy: number, t: { x: number; y: number; scale: number }): Point {
  return { x: (sx - t.x) / t.scale, y: (sy - t.y) / t.scale };
}

/** 선택된 오브젝트의 사각형 bounds 반환 (리사이즈 가능한 경우만) */
function getSelectedRect(
  sel: SelectedObject,
  data: { booths: EditorBooth[]; obstacles: EditorObstacle[]; halls: EditorHall[] },
): { kind: string; id: number; x: number; y: number; w: number; h: number } | null {
  if (!sel) return null;
  if (sel.kind === 'booth') {
    const b = data.booths.find(bb => bb.id === sel.id);
    if (b && b.shape === 'rectangle') return { kind: 'booth', id: b.id, x: b.x, y: b.y, w: b.width, h: b.height };
  }
  if (sel.kind === 'obstacle') {
    const o = data.obstacles.find(oo => oo.id === sel.id);
    if (o && o.shape !== 'circle' && o.shape !== 'polygon' && o.width != null && o.height != null)
      return { kind: 'obstacle', id: o.id, x: o.x, y: o.y, w: o.width, h: o.height };
  }
  if (sel.kind === 'hall') {
    const h = data.halls.find(hh => hh.id === sel.id);
    if (h && (h.shape ?? 'rectangle') === 'rectangle' && h.area_x != null && h.area_y != null && h.area_width != null && h.area_height != null)
      return { kind: 'hall', id: h.id, x: h.area_x!, y: h.area_y!, w: h.area_width!, h: h.area_height! };
  }
  return null;
}

/** 선택된 오브젝트가 다각형이면 points 반환 */
function getSelectedPolygon(
  sel: SelectedObject,
  data: { booths: EditorBooth[]; obstacles: EditorObstacle[]; halls: EditorHall[] },
): { kind: string; id: number; points: Point[] } | null {
  if (!sel) return null;
  const parse = (pts: any): Point[] => typeof pts === 'string' ? JSON.parse(pts) : pts;
  if (sel.kind === 'booth') {
    const b = data.booths.find(bb => bb.id === sel.id);
    if (b?.shape === 'polygon' && b.points?.length) return { kind: 'booth', id: b.id, points: parse(b.points) };
  }
  if (sel.kind === 'obstacle') {
    const o = data.obstacles.find(oo => oo.id === sel.id);
    if (o?.shape === 'polygon' && o.points?.length) return { kind: 'obstacle', id: o.id, points: parse(o.points) };
  }
  if (sel.kind === 'hall') {
    const h = data.halls.find(hh => hh.id === sel.id);
    if (h?.shape === 'polygon' && h.points?.length) return { kind: 'hall', id: h.id, points: parse(h.points) };
  }
  return null;
}

export default function useEditorPointer(deps: PointerDeps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => {
    const canvas = deps.canvasRef.current;
    if (!canvas) return;

    let isDragging = false;
    let isPanning = false;
    let dragStart = { x: 0, y: 0 };
    let downInfo = { x: 0, y: 0, time: 0 };
    const pointers = new Map<number, Point>();
    let lastPinchDist = 0;
    let drawPoints: Point[] = [];
    let isDrawing = false;
    let isDraggingObj = false;
    let dragObj = { kind: '', id: 0, ox: 0, oy: 0 };
    let polygonPts: Point[] = [];

    // 리사이즈 상태
    let isResizing = false;
    let resizeHandle: ResizeHandle = 'se';
    let resizeObjKind = '';
    let resizeObjId = 0;
    let resizeOrigin: ResizeOrigin = { x: 0, y: 0, w: 0, h: 0 };
    let resizeDownWorld = { x: 0, y: 0 };

    // 꼭짓점 드래그 상태
    let isDraggingVertex = false;
    let vertexObjKind = '';
    let vertexObjId = 0;
    let vertexIdx = -1;

    function wp(e: PointerEvent): Point {
      const r = canvas!.getBoundingClientRect();
      return screenToWorld(e.clientX - r.left, e.clientY - r.top, depsRef.current.transformRef.current!);
    }

    function getData() {
      const d = depsRef.current;
      return { halls: d.halls, booths: d.booths, pathNodes: d.pathNodes, pathEdges: d.pathEdges, obstacles: d.obstacles, amenities: d.amenities };
    }

    // ===== POINTER DOWN =====
    function onPointerDown(e: PointerEvent) {
      e.preventDefault();
      canvas!.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      downInfo = { x: e.clientX, y: e.clientY, time: Date.now() };

      if (pointers.size >= 2) {
        isDragging = false;
        const pts = Array.from(pointers.values());
        lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        return;
      }

      const d = depsRef.current;
      const m = d.mode;
      const w = wp(e);

      if (m === 'pan') {
        // 이동 모드: 팬만 — 바로 드래그 시작
        const t = d.transformRef.current!;
        dragStart = { x: e.clientX - t.x, y: e.clientY - t.y };
        isDragging = true;
        isPanning = true;
        return;
      }
      if (isDrawMode(m)) { isDrawing = true; drawPoints = [w]; return; }
      if (isPolygonMode(m)) return; // click 처리는 pointerup에서

      if (m === 'select') {
        const scale = d.transformRef.current!.scale;
        const data = getData();

        // 다각형 꼭짓점 핸들 히트테스트
        const selPoly = getSelectedPolygon(d.selectedObject, data);
        if (selPoly) {
          const vi = hitTestVertexHandles(w.x, w.y, selPoly.points, scale);
          if (vi >= 0) {
            isDraggingVertex = true;
            vertexObjKind = selPoly.kind;
            vertexObjId = selPoly.id;
            vertexIdx = vi;
            return;
          }
        }

        // 사각형 리사이즈 핸들 히트테스트 (선택된 오브젝트에만)
        const selRect = getSelectedRect(d.selectedObject, data);
        if (selRect) {
          const h = hitTestHandles(w.x, w.y, selRect.x, selRect.y, selRect.w, selRect.h, scale);
          if (h) {
            isResizing = true;
            resizeHandle = h;
            resizeObjKind = selRect.kind;
            resizeObjId = selRect.id;
            resizeOrigin = { x: selRect.x, y: selRect.y, w: selRect.w, h: selRect.h };
            resizeDownWorld = { x: w.x, y: w.y };
            return;
          }
        }

        // 오브젝트 드래그/선택 로직
        const hit = hitTestAll(w.x, w.y, scale, data);
        if (hit) {
          const pos = getObjPosition(hit, data);
          if (pos) {
            isDraggingObj = true;
            dragObj = { kind: hit.kind, id: hit.id, ox: w.x - pos.x, oy: w.y - pos.y };
          }
          return;
        }
      }

      if (m === 'path_connect' || m === 'path_node' || m === 'amenity' || m === 'delete') return;

      const t = d.transformRef.current!;
      dragStart = { x: e.clientX - t.x, y: e.clientY - t.y };
      isDragging = true;
    }

    // ===== POINTER MOVE =====
    function onPointerMove(e: PointerEvent) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 2) {
        const pts = Array.from(pointers.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        if (lastPinchDist > 0) {
          const r = canvas!.getBoundingClientRect();
          depsRef.current.applyZoom(
            depsRef.current.transformRef.current!.scale * (dist / lastPinchDist),
            (pts[0].x + pts[1].x) / 2 - r.left, (pts[0].y + pts[1].y) / 2 - r.top,
          );
        }
        lastPinchDist = dist;
        return;
      }

      const d = depsRef.current;
      const w = wp(e);
      const pg = d.previewGraphicsRef.current;

      if (isDrawing && pg) {
        drawPoints = [drawPoints[0], w];
        drawPreview(pg, d.mode, drawPoints, d.transformRef.current!.scale);
        return;
      }

      if (isPolygonMode(d.mode) && polygonPts.length > 0 && pg) {
        drawPreview(pg, d.mode, [...polygonPts, w], d.transformRef.current!.scale);
        return;
      }

      // 꼭짓점 드래그 실시간 반영
      if (isDraggingVertex) {
        d.onVertexMove?.(vertexObjKind, vertexObjId, vertexIdx, Math.round(w.x), Math.round(w.y));
        return;
      }

      // 리사이즈 실시간 반영
      if (isResizing) {
        const dx = w.x - resizeDownWorld.x;
        const dy = w.y - resizeDownWorld.y;
        const result = applyHandleDrag(resizeHandle, resizeOrigin, dx, dy);
        d.onObjectResize?.(resizeObjKind, resizeObjId, result.x, result.y, result.w, result.h);
        return;
      }

      // 오브젝트 드래그 실시간 반영 (preview circle 제거, 실제 state 갱신)
      if (isDraggingObj) {
        d.onObjectMove(dragObj.kind, dragObj.id, Math.round(w.x - dragObj.ox), Math.round(w.y - dragObj.oy));
        return;
      }

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

      const dx = e.clientX - downInfo.x;
      const dy = e.clientY - downInfo.y;
      const isClick = Math.abs(dx) < CLICK_THRESHOLD && Math.abs(dy) < CLICK_THRESHOLD && (Date.now() - downInfo.time) < CLICK_TIME;
      const d = depsRef.current;
      const m = d.mode;
      const w = wp(e);
      const pg = d.previewGraphicsRef.current;

      // 꼭짓점 드래그 완성
      if (isDraggingVertex) {
        isDraggingVertex = false;
        d.onVertexMoveEnd?.(vertexObjKind, vertexObjId, vertexIdx, Math.round(w.x), Math.round(w.y));
        vertexIdx = -1;
        return;
      }

      // 리사이즈 완성
      if (isResizing) {
        isResizing = false;
        const ddx = w.x - resizeDownWorld.x;
        const ddy = w.y - resizeDownWorld.y;
        const result = applyHandleDrag(resizeHandle, resizeOrigin, ddx, ddy);
        d.onObjectResizeEnd?.(resizeObjKind, resizeObjId, result.x, result.y, result.w, result.h);
        return;
      }

      // 드래그 완성 (rect/circle/ellipse)
      if (isDrawing) {
        isDrawing = false;
        if (pg) pg.clear();
        const p0 = drawPoints[0];
        const dist = Math.hypot(w.x - p0.x, w.y - p0.y);
        if (dist > 5) {
          if (isRectMode(m)) {
            d.onShapeComplete(m, { shape: 'rectangle', x: Math.round(Math.min(p0.x, w.x)), y: Math.round(Math.min(p0.y, w.y)), width: Math.round(Math.abs(w.x - p0.x)), height: Math.round(Math.abs(w.y - p0.y)) });
          } else if (isCircleMode(m)) {
            d.onShapeComplete(m, { shape: 'circle', x: Math.round(p0.x), y: Math.round(p0.y), radius: Math.round(dist) });
          } else if (m === 'booth_ellipse') {
            d.onShapeComplete(m, { shape: 'ellipse', x: Math.round(p0.x), y: Math.round(p0.y), radiusX: Math.round(Math.abs(w.x - p0.x)), radiusY: Math.round(Math.abs(w.y - p0.y)) });
          }
        }
        drawPoints = [];
        return;
      }

      // 오브젝트 드래그 완성
      if (isDraggingObj) {
        if (!isClick) {
          d.onObjectMoveEnd?.(dragObj.kind, dragObj.id, Math.round(w.x - dragObj.ox), Math.round(w.y - dragObj.oy));
        } else {
          d.onObjectSelect({ kind: dragObj.kind as any, id: dragObj.id });
        }
        isDraggingObj = false;
        return;
      }

      isDragging = false;
      isPanning = false;
      if (!isClick) { if (pointers.size < 2) lastPinchDist = 0; return; }

      // 클릭 처리
      const scale = d.transformRef.current!.scale;

      if (m === 'pan') return; // 이동 모드: 클릭해도 선택 안 함
      if (m === 'select') { d.onObjectSelect(hitTestAll(w.x, w.y, scale, getData())); return; }
      if (m === 'delete') { const h = hitTestAll(w.x, w.y, scale, getData()); if (h) d.onObjectDelete(h.kind, h.id); return; }
      if (m === 'path_node' || m === 'amenity') { d.onShapeComplete(m, { shape: 'point', x: Math.round(w.x), y: Math.round(w.y) }); return; }

      if (m === 'path_connect') {
        for (const n of d.pathNodes) {
          if (hitTestCircle(w.x, w.y, n.x, n.y, NODE_HIT_RADIUS / scale)) {
            if (d.connectFromId === null) d.setConnectFromId(n.id);
            else if (d.connectFromId !== n.id) { d.onNodeConnect(d.connectFromId, n.id); d.setConnectFromId(null); }
            return;
          }
        }
        return;
      }

      if (isPolygonMode(m)) { polygonPts.push({ x: Math.round(w.x), y: Math.round(w.y) }); return; }
      if (pointers.size < 2) lastPinchDist = 0;
    }

    // ===== DOUBLE CLICK (다각형 완성) =====
    function onDblClick() {
      const d = depsRef.current;
      if (isPolygonMode(d.mode) && polygonPts.length >= 3) {
        const pg = d.previewGraphicsRef.current;
        if (pg) pg.clear();
        d.onShapeComplete(d.mode, { shape: 'polygon', points: [...polygonPts] });
        polygonPts = [];
      }
    }

    function onPointerCancel(e: PointerEvent) {
      pointers.delete(e.pointerId);
      isDragging = false; isDrawing = false; isDraggingObj = false; isResizing = false; isDraggingVertex = false;
      if (pointers.size < 2) lastPinchDist = 0;
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const f = e.deltaY > 0 ? 0.9 : 1.1;
      const r = canvas!.getBoundingClientRect();
      depsRef.current.applyZoom(depsRef.current.transformRef.current!.scale * f, e.clientX - r.left, e.clientY - r.top);
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
  }, []); // eslint-disable-line — all deps via depsRef
}
