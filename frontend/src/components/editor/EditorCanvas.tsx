/**
 * EditorCanvas.tsx — PIXI 앱 초기화 + 배경 이미지 + 레이어 조립
 * 에디터 메인 캔버스. 배경 맵 이미지 위에 레이어별 Graphics를 쌓음.
 */
import React, { useRef, useEffect, useCallback, useState, useImperativeHandle, forwardRef } from 'react';
import * as PIXI from 'pixi.js';
import type {
  EditorMode, SelectedObject, ShapeCompleteData, Point,
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
  // Mode
  mode: EditorMode;
  pathNodeType: PathNodeType;
  amenityType: AmenityType;
  // Data
  halls: EditorHall[];
  booths: EditorBooth[];
  pathNodes: PathNode[];
  pathEdges: PathEdge[];
  obstacles: EditorObstacle[];
  amenities: Amenity[];
  selectedObject: SelectedObject;
  connectFromId: number | null;
  // Callbacks
  onObjectSelect: (obj: SelectedObject) => void;
  onShapeComplete: (mode: EditorMode, data: ShapeCompleteData) => void;
  onNodeConnect: (fromId: number, toId: number) => void;
  onObjectMove: (kind: string, id: number, x: number, y: number) => void;
  onObjectDelete: (kind: string, id: number) => void;
  setConnectFromId: (id: number | null) => void;
  // Layer renderers (injected from page)
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

  // Layer graphics refs
  const hallGfxRef = useRef<PIXI.Graphics | null>(null);
  const boothGfxRef = useRef<PIXI.Graphics | null>(null);
  const boothLabelRef = useRef<PIXI.Container | null>(null);
  const pathGfxRef = useRef<PIXI.Graphics | null>(null);
  const obstacleGfxRef = useRef<PIXI.Graphics | null>(null);
  const amenityGfxRef = useRef<PIXI.Graphics | null>(null);

  const [ready, setReady] = useState(false);

  // ===== PIXI Init =====
  useEffect(() => {
    const div = containerRef.current;
    if (!div) return;
    const w = div.clientWidth;
    const h = div.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    const app = new PIXI.Application({
      width: w, height: h,
      resolution: dpr,
      autoDensity: true,
      backgroundAlpha: 0,
      antialias: true,
    });
    appRef.current = app;
    canvasRef.current = app.view as HTMLCanvasElement;
    (canvasRef.current as HTMLElement).style.cursor = 'grab';
    div.appendChild(canvasRef.current as HTMLElement);

    const mc = new PIXI.Container();
    mainContainerRef.current = mc;
    app.stage.addChild(mc);

    // Layer order: bg → hall → obstacle → booth → boothLabel → path → amenity → preview
    const hallGfx = new PIXI.Graphics(); hallGfxRef.current = hallGfx; mc.addChild(hallGfx);
    const obstGfx = new PIXI.Graphics(); obstacleGfxRef.current = obstGfx; mc.addChild(obstGfx);
    const boothGfx = new PIXI.Graphics(); boothGfxRef.current = boothGfx; mc.addChild(boothGfx);
    const boothLabels = new PIXI.Container(); boothLabelRef.current = boothLabels; mc.addChild(boothLabels);
    const pathGfx = new PIXI.Graphics(); pathGfxRef.current = pathGfx; mc.addChild(pathGfx);
    const amenGfx = new PIXI.Graphics(); amenityGfxRef.current = amenGfx; mc.addChild(amenGfx);
    const preview = new PIXI.Graphics(); previewGraphicsRef.current = preview; mc.addChild(preview);

    setReady(true);

    // Resize
    const ro = new ResizeObserver(() => {
      const nw = div.clientWidth, nh = div.clientHeight;
      app.renderer.resize(nw, nh);
    });
    ro.observe(div);

    return () => {
      ro.disconnect();
      app.destroy(true, { children: true });
      appRef.current = null;
    };
  }, []);

  // ===== Background Image =====
  useEffect(() => {
    if (!ready || !props.imageUrl) return;
    const mc = mainContainerRef.current!;

    // Remove old bg
    if (bgSpriteRef.current) {
      mc.removeChild(bgSpriteRef.current);
      bgSpriteRef.current.destroy();
      bgSpriteRef.current = null;
    }

    const tex = PIXI.Texture.from(props.imageUrl);
    const sprite = new PIXI.Sprite(tex);
    sprite.width = props.imageWidth;
    sprite.height = props.imageHeight;
    bgSpriteRef.current = sprite;
    mc.addChildAt(sprite, 0); // behind all layers

    // Fit to canvas
    const div = containerRef.current!;
    const fitScale = Math.min(div.clientWidth / props.imageWidth, div.clientHeight / props.imageHeight) * 0.9;
    const t = transformRef.current;
    t.scale = fitScale;
    t.x = (div.clientWidth - props.imageWidth * fitScale) / 2;
    t.y = (div.clientHeight - props.imageHeight * fitScale) / 2;
    mc.scale.set(fitScale);
    mc.position.set(t.x, t.y);
  }, [ready, props.imageUrl, props.imageWidth, props.imageHeight]);

  // ===== Zoom =====
  const applyZoom = useCallback((newScale: number, pivotX: number, pivotY: number) => {
    const minScale = 0.1;
    const maxScale = 10;
    const s = Math.max(minScale, Math.min(maxScale, newScale));
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
      className="flex-1 bg-white relative overflow-hidden"
      style={{ touchAction: 'none' }}
    />
  );
});

export default EditorCanvas;
