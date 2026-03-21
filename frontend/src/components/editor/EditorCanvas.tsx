/**
 * EditorCanvas.tsx — PIXI 앱 초기화 + 배경 이미지 + 레이어 조립
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
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const bgSpriteRef = useRef<PIXI.Sprite | null>(null);

  const hallGfxRef = useRef<PIXI.Graphics | null>(null);
  const boothGfxRef = useRef<PIXI.Graphics | null>(null);
  const boothLabelRef = useRef<PIXI.Container | null>(null);
  const pathGfxRef = useRef<PIXI.Graphics | null>(null);
  const obstacleGfxRef = useRef<PIXI.Graphics | null>(null);
  const amenityGfxRef = useRef<PIXI.Graphics | null>(null);

  const [ready, setReady] = useState(false);

  // ===== PIXI Init (rAF로 레이아웃 완료 후 실행) =====
  useEffect(() => {
    const div = containerRef.current;
    if (!div) return;

    let rafId: number;
    let app: PIXI.Application | null = null;
    let ro: ResizeObserver | null = null;

    rafId = requestAnimationFrame(() => {
      const w = div.clientWidth || 800;
      const h = div.clientHeight || 600;
      const dpr = window.devicePixelRatio || 1;

      app = new PIXI.Application({
        width: w, height: h,
        resolution: dpr,
        autoDensity: true,
        backgroundAlpha: 0,
        antialias: true,
      });
      appRef.current = app;
      canvasRef.current = app.view as HTMLCanvasElement;
      (canvasRef.current as HTMLElement).style.cursor = 'grab';
      (canvasRef.current as HTMLElement).style.display = 'block';
      (canvasRef.current as HTMLElement).style.width = '100%';
      (canvasRef.current as HTMLElement).style.height = '100%';
      (canvasRef.current as HTMLElement).style.touchAction = 'none';
      div.appendChild(canvasRef.current as HTMLElement);

      const mc = new PIXI.Container();
      mainContainerRef.current = mc;
      app.stage.addChild(mc);

      // Layer order: bg(0) → hall → obstacle → booth → boothLabel → path → amenity → preview
      const hallGfx = new PIXI.Graphics(); hallGfxRef.current = hallGfx; mc.addChild(hallGfx);
      const obstGfx = new PIXI.Graphics(); obstacleGfxRef.current = obstGfx; mc.addChild(obstGfx);
      const boothGfx = new PIXI.Graphics(); boothGfxRef.current = boothGfx; mc.addChild(boothGfx);
      const boothLabels = new PIXI.Container(); boothLabelRef.current = boothLabels; mc.addChild(boothLabels);
      const pathGfx = new PIXI.Graphics(); pathGfxRef.current = pathGfx; mc.addChild(pathGfx);
      const amenGfx = new PIXI.Graphics(); amenityGfxRef.current = amenGfx; mc.addChild(amenGfx);
      const preview = new PIXI.Graphics(); previewGraphicsRef.current = preview; mc.addChild(preview);

      ro = new ResizeObserver(() => {
        if (!app) return;
        const nw = div.clientWidth, nh = div.clientHeight;
        app.renderer.resize(nw, nh);
      });
      ro.observe(div);

      setReady(true);
    });

    return () => {
      cancelAnimationFrame(rafId);
      ro?.disconnect();
      if (app) {
        app.destroy(true, { children: true });
        appRef.current = null;
      }
    };
  }, []);

  // ===== Background Image =====
  useEffect(() => {
    if (!ready || !props.imageUrl || !props.imageWidth || !props.imageHeight) return;
    const mc = mainContainerRef.current;
    if (!mc) return;

    // Remove old bg sprite
    if (bgSpriteRef.current) {
      mc.removeChild(bgSpriteRef.current);
      bgSpriteRef.current.destroy();
      bgSpriteRef.current = null;
    }

    // PIXI.Texture.from — same pattern as CorridorVisualEditor
    const tex = PIXI.Texture.from(props.imageUrl);
    const sprite = new PIXI.Sprite(tex);
    sprite.width = props.imageWidth;
    sprite.height = props.imageHeight;
    bgSpriteRef.current = sprite;
    mc.addChildAt(sprite, 0); // index 0 = below all layers

    // Fit image to canvas
    const div = containerRef.current!;
    const cw = div.clientWidth || appRef.current?.renderer.width || 800;
    const ch = div.clientHeight || appRef.current?.renderer.height || 600;
    const fitScale = Math.min(cw / props.imageWidth, ch / props.imageHeight) * 0.9;
    const t = transformRef.current;
    t.scale = fitScale;
    t.x = (cw - props.imageWidth * fitScale) / 2;
    t.y = (ch - props.imageHeight * fitScale) / 2;
    mc.scale.set(fitScale);
    mc.position.set(t.x, t.y);
  }, [ready, props.imageUrl, props.imageWidth, props.imageHeight]);

  // ===== Zoom =====
  const applyZoom = useCallback((newScale: number, pivotX: number, pivotY: number) => {
    const s = Math.max(0.05, Math.min(10, newScale));
    const t = transformRef.current;
    const mc = mainContainerRef.current;
    if (!mc) return;
    const wx = (pivotX - t.x) / t.scale;
    const wy = (pivotY - t.y) / t.scale;
    t.scale = s;
    t.x = pivotX - wx * s;
    t.y = pivotY - wy * s;
    mc.scale.set(s);
    mc.position.set(t.x, t.y);
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
  }, [
    ready, props.halls, props.booths, props.pathNodes, props.pathEdges,
    props.obstacles, props.amenities, props.selectedObject,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    transformRef.current.scale,
  ]);

  // ===== Pointer events =====
  useEditorPointer({
    canvasRef, mainContainerRef, transformRef, previewGraphicsRef,
    mode: props.mode,
    halls: props.halls,
    booths: props.booths,
    pathNodes: props.pathNodes,
    pathEdges: props.pathEdges,
    obstacles: props.obstacles,
    amenities: props.amenities,
    onObjectSelect: props.onObjectSelect,
    onShapeComplete: props.onShapeComplete,
    onNodeConnect: props.onNodeConnect,
    onObjectMove: props.onObjectMove,
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
      className="w-full h-full bg-white relative overflow-hidden"
      style={{ touchAction: 'none' }}
    />
  );
});

export default EditorCanvas;
