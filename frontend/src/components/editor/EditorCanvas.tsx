/**
 * EditorCanvas.tsx — PIXI canvas (CorridorVisualEditor 초기화 패턴 그대로 사용)
 */
import React, { useRef, useEffect, useCallback, useState, useImperativeHandle, forwardRef } from 'react';
import * as PIXI from 'pixi.js';
import type {
  EditorMode, SelectedObject, ShapeCompleteData,
  EditorBooth, EditorObstacle, EditorHall, PathNode, PathEdge, Amenity,
  PathNodeType, AmenityType,
} from './editorTypes';
import useEditorPointer from './useEditorPointer';

export interface EditorCanvasHandle {
  getTransform: () => { x: number; y: number; scale: number };
}

interface EditorCanvasProps {
  imageUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  mode: EditorMode;
  pathNodeType: PathNodeType;
  amenityType: AmenityType;
  halls: EditorHall[];
  booths: EditorBooth[];
  pathNodes: PathNode[];
  pathEdges: PathEdge[];
  obstacles: EditorObstacle[];
  amenities: Amenity[];
  selectedObject: SelectedObject;
  connectFromId: number | null;
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
  setConnectFromId: (id: number | null) => void;
  renderLayers: (ctx: LayerContext) => void;
}

export interface LayerContext {
  hallGfx: PIXI.Graphics;
  boothGfx: PIXI.Graphics;
  boothLabelContainer: PIXI.Container;
  pathGfx: PIXI.Graphics;
  obstacleGfx: PIXI.Graphics;
  amenityGfx: PIXI.Graphics;
  scale: number;
  selectedObject: SelectedObject;
}

const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(function EditorCanvas(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const mainContainerRef = useRef<PIXI.Container | null>(null);
  const previewGraphicsRef = useRef<PIXI.Graphics | null>(null);
  const transformRef = useRef({ x: 0, y: 0, scale: 0.6 });
  const bgSpriteRef = useRef<PIXI.Sprite | null>(null);

  const hallGfxRef = useRef<PIXI.Graphics | null>(null);
  const boothGfxRef = useRef<PIXI.Graphics | null>(null);
  const boothLabelRef = useRef<PIXI.Container | null>(null);
  const pathGfxRef = useRef<PIXI.Graphics | null>(null);
  const obstacleGfxRef = useRef<PIXI.Graphics | null>(null);
  const amenityGfxRef = useRef<PIXI.Graphics | null>(null);

  const [ready, setReady] = useState(false);

  // ===== PIXI Init (CorridorVisualEditor와 동일 패턴) =====
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.offsetWidth || 800;
    const h = el.offsetHeight || 500;

    const app = new PIXI.Application({
      width: w,
      height: h,
      backgroundColor: 0xf3f4f6,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    appRef.current = app;

    el.appendChild(app.view as HTMLCanvasElement);
    const canvas = app.view as HTMLCanvasElement;
    canvasRef.current = canvas;
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    canvas.style.overscrollBehavior = 'none';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.cursor = 'grab';

    const mc = new PIXI.Container();
    mainContainerRef.current = mc;
    app.stage.addChild(mc);

    // Layer order: hall → obstacle → booth → boothLabel → path → amenity → preview
    const hallGfx = new PIXI.Graphics(); hallGfxRef.current = hallGfx; mc.addChild(hallGfx);
    const obstGfx = new PIXI.Graphics(); obstacleGfxRef.current = obstGfx; mc.addChild(obstGfx);
    const boothGfx = new PIXI.Graphics(); boothGfxRef.current = boothGfx; mc.addChild(boothGfx);
    const boothLabels = new PIXI.Container(); boothLabelRef.current = boothLabels; mc.addChild(boothLabels);
    const pathGfx = new PIXI.Graphics(); pathGfxRef.current = pathGfx; mc.addChild(pathGfx);
    const amenGfx = new PIXI.Graphics(); amenityGfxRef.current = amenGfx; mc.addChild(amenGfx);
    const preview = new PIXI.Graphics(); previewGraphicsRef.current = preview; mc.addChild(preview);

    // Initial transform
    const initialScale = 0.6;
    transformRef.current = { x: 0, y: 0, scale: initialScale };
    mc.scale.set(initialScale);

    // Resize
    const ro = new ResizeObserver(() => {
      const nw = el.offsetWidth || 800, nh = el.offsetHeight || 500;
      app.renderer.resize(nw, nh);
    });
    ro.observe(el);

    setReady(true);

    return () => {
      ro.disconnect();
      app.destroy(true, { children: true });
      appRef.current = null;
    };
  }, []);

  // ===== Background Image (CorridorVisualEditor 패턴) =====
  useEffect(() => {
    if (!ready || !props.imageUrl) return;
    const mc = mainContainerRef.current!;

    if (bgSpriteRef.current) {
      mc.removeChild(bgSpriteRef.current);
      bgSpriteRef.current.destroy();
      bgSpriteRef.current = null;
    }

    console.log('[EditorCanvas] Image:', props.imageUrl, 'sprite size:', props.imageWidth, 'x', props.imageHeight);
    const tex = PIXI.Texture.from(props.imageUrl);
    const sprite = new PIXI.Sprite(tex);
    sprite.width = props.imageWidth;
    sprite.height = props.imageHeight;
    bgSpriteRef.current = sprite;
    mc.addChildAt(sprite, 0);
  }, [ready, props.imageUrl, props.imageWidth, props.imageHeight]);

  // ===== Zoom =====
  const [renderTick, setRenderTick] = useState(0);
  const applyZoom = useCallback((newScale: number, pivotX: number, pivotY: number) => {
    const clamped = Math.max(0.1, Math.min(15, newScale));
    const t = transformRef.current;
    const ratio = clamped / t.scale;
    t.x = pivotX - ratio * (pivotX - t.x);
    t.y = pivotY - ratio * (pivotY - t.y);
    t.scale = clamped;
    const mc = mainContainerRef.current;
    if (mc) {
      mc.position.set(t.x, t.y);
      mc.scale.set(clamped);
    }
    // 줌 변경 후 레이어 재렌더 트리거
    setRenderTick(t => t + 1);
  }, []);

  // ===== Render layers =====
  useEffect(() => {
    if (!ready) return;
    const ctx: LayerContext = {
      hallGfx: hallGfxRef.current!,
      boothGfx: boothGfxRef.current!,
      boothLabelContainer: boothLabelRef.current!,
      pathGfx: pathGfxRef.current!,
      obstacleGfx: obstacleGfxRef.current!,
      amenityGfx: amenityGfxRef.current!,
      scale: transformRef.current.scale,
      selectedObject: props.selectedObject,
    };
    props.renderLayers(ctx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ready, props.renderLayers, props.halls, props.booths, props.pathNodes, props.pathEdges,
    props.obstacles, props.amenities, props.selectedObject, renderTick,
  ]);

  // ===== Pointer events =====
  // 모드별 커서
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (props.mode === 'pan') canvas.style.cursor = 'grab';
    else if (props.mode === 'select') canvas.style.cursor = 'default';
    else if (props.mode === 'delete') canvas.style.cursor = 'crosshair';
    else canvas.style.cursor = 'crosshair';
  }, [props.mode]);

  useEditorPointer({
    canvasRef, mainContainerRef, transformRef, previewGraphicsRef,
    mode: props.mode,
    halls: props.halls,
    booths: props.booths,
    pathNodes: props.pathNodes,
    pathEdges: props.pathEdges,
    obstacles: props.obstacles,
    amenities: props.amenities,
    selectedObject: props.selectedObject,
    onObjectSelect: props.onObjectSelect,
    onShapeComplete: props.onShapeComplete,
    onNodeConnect: props.onNodeConnect,
    onObjectMove: props.onObjectMove,
    onObjectMoveEnd: props.onObjectMoveEnd,
    onObjectResize: props.onObjectResize,
    onObjectResizeEnd: props.onObjectResizeEnd,
    onVertexMove: props.onVertexMove,
    onVertexMoveEnd: props.onVertexMoveEnd,
    onObjectDelete: props.onObjectDelete,
    connectFromId: props.connectFromId,
    setConnectFromId: props.setConnectFromId,
    applyZoom,
  });

  useImperativeHandle(ref, () => ({
    getTransform: () => ({ ...transformRef.current }),
  }));

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden"
    />
  );
});

export default EditorCanvas;
