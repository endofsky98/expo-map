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
  onObjectSelect: (obj: SelectedObject) => void;
  onShapeComplete: (mode: EditorMode, data: ShapeCompleteData) => void;
  onNodeConnect: (fromId: number, toId: number) => void;
  onObjectMove: (kind: string, id: number, x: number, y: number) => void;
  onObjectDelete: (kind: string, id: number) => void;
  connectFromId: number | null;
  setConnectFromId: (id: number | null) => void;
  applyZoom: (newScale: number, pivotX: number, pivotY: number) => void;
}

function screenToWorld(sx: number, sy: number, t: { x: number; y: number; scale: number }): Point {
  return { x: (sx - t.x) / t.scale, y: (sy - t.y) / t.scale };
}

export default function useEditorPointer(deps: PointerDeps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => {
    const canvas = deps.canvasRef.current;
    if (!canvas) return;

    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let downInfo = { x: 0, y: 0, time: 0 };
    const pointers = new Map<number, Point>();
    let lastPinchDist = 0;
    let drawPoints: Point[] = [];
    let isDrawing = false;
    let isDraggingObj = false;
    let dragObj = { kind: '', id: 0, ox: 0, oy: 0 };
    let polygonPts: Point[] = [];

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

      if (isDrawMode(m)) { isDrawing = true; drawPoints = [w]; return; }
      if (isPolygonMode(m)) return; // click 처리는 pointerup에서

      if (m === 'select') {
        const hit = hitTestAll(w.x, w.y, d.transformRef.current!.scale, getData());
        if (hit) {
          const pos = getObjPosition(hit, getData());
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

      if (isDraggingObj && pg) {
        pg.clear();
        const s = d.transformRef.current!.scale;
        pg.lineStyle(2 / s, 0x4f46e5, 0.5);
        pg.drawCircle(w.x - dragObj.ox, w.y - dragObj.oy, 6 / s);
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
        if (pg) pg.clear();
        if (!isClick) {
          d.onObjectMove(dragObj.kind, dragObj.id, Math.round(w.x - dragObj.ox), Math.round(w.y - dragObj.oy));
        } else {
          d.onObjectSelect({ kind: dragObj.kind as any, id: dragObj.id });
        }
        isDraggingObj = false;
        return;
      }

      isDragging = false;
      if (!isClick) { if (pointers.size < 2) lastPinchDist = 0; return; }

      // 클릭 처리
      const scale = d.transformRef.current!.scale;

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
      isDragging = false; isDrawing = false; isDraggingObj = false;
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
