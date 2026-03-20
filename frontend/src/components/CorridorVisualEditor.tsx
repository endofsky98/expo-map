import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { Booth, CorridorNode, CorridorEdge, Obstacle, MapImage, ZoomLevel } from '@/types';

export type EditorMode = 'select' | 'add_node' | 'connect' | 'delete';

interface CorridorVisualEditorProps {
  nodes: CorridorNode[];
  edges: CorridorEdge[];
  booths: Booth[];
  obstacles: Obstacle[];
  currentImage: MapImage | null;
  floorId: number;
  mode: EditorMode;
  newNodeType: string;
  selectedNodeId: number | null;
  connectFromId: number | null;
  onNodeAdd: (x: number, y: number) => void;
  onNodeSelect: (nodeId: number | null) => void;
  onNodeMove: (nodeId: number, x: number, y: number) => void;
  onConnectStart: (nodeId: number) => void;
  onEdgeCreate: (fromId: number, toId: number) => void;
  onNodeDelete: (nodeId: number) => void;
  onEdgeDelete: (edgeId: number) => void;
}

const NODE_COLORS: Record<string, number> = {
  intersection: 0x6366f1,
  booth_entry: 0x22c55e,
  entrance: 0xf59e0b,
  facility_entry: 0x3b82f6,
};

const NODE_COLORS_STR: Record<string, string> = {
  intersection: '#6366f1',
  booth_entry: '#22c55e',
  entrance: '#f59e0b',
  facility_entry: '#3b82f6',
};

const NODE_RADIUS = 8;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4.0;
const CLICK_THRESHOLD = 5;
const CLICK_TIME_THRESHOLD = 300;

function parseZoomLevels(img: MapImage): ZoomLevel[] {
  if (!img.zoom_levels) return [];
  if (typeof img.zoom_levels === 'string') {
    try { return JSON.parse(img.zoom_levels); } catch { return []; }
  }
  return img.zoom_levels;
}

function segmentIntersectsRect(x1: number, y1: number, x2: number, y2: number, rx: number, ry: number, rw: number, rh: number): boolean {
  for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    const px = x1 + t * (x2 - x1);
    const py = y1 + t * (y2 - y1);
    if (px >= rx && px <= rx + rw && py >= ry && py <= ry + rh) return true;
  }
  return false;
}

function segmentIntersectsCircle(x1: number, y1: number, x2: number, y2: number, cx: number, cy: number, r: number): boolean {
  for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    const px = x1 + t * (x2 - x1);
    const py = y1 + t * (y2 - y1);
    if (Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) < r) return true;
  }
  return false;
}

function pointToSegmentDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export default function CorridorVisualEditor({
  nodes,
  edges,
  booths,
  obstacles,
  currentImage,
  floorId,
  mode,
  newNodeType,
  selectedNodeId,
  connectFromId,
  onNodeAdd,
  onNodeSelect,
  onNodeMove,
  onConnectStart,
  onEdgeCreate,
  onNodeDelete,
  onEdgeDelete,
}: CorridorVisualEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiApp = useRef<PIXI.Application | null>(null);
  const mainContainerRef = useRef<PIXI.Container | null>(null);
  const transformRef = useRef({ x: 0, y: 0, scale: 0.6 });
  const canvasDimsRef = useRef({ width: 800, height: 500 });
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const [scale, setScale] = useState(0.6);

  // Layers
  const bgLayerRef = useRef<PIXI.Container>(new PIXI.Container());
  const boothLayerRef = useRef<PIXI.Container>(new PIXI.Container());
  const obstacleLayerRef = useRef<PIXI.Container>(new PIXI.Container());
  const edgeLayerRef = useRef<PIXI.Container>(new PIXI.Container());
  const nodeLayerRef = useRef<PIXI.Container>(new PIXI.Container());

  // Node containers map for drag lookup
  const nodeContainersRef = useRef<Map<number, PIXI.Container>>(new Map());

  // Callback refs to avoid stale closures
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const selectedNodeIdRef = useRef(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;
  const connectFromIdRef = useRef(connectFromId);
  connectFromIdRef.current = connectFromId;
  const onNodeAddRef = useRef(onNodeAdd);
  onNodeAddRef.current = onNodeAdd;
  const onNodeSelectRef = useRef(onNodeSelect);
  onNodeSelectRef.current = onNodeSelect;
  const onNodeMoveRef = useRef(onNodeMove);
  onNodeMoveRef.current = onNodeMove;
  const onConnectStartRef = useRef(onConnectStart);
  onConnectStartRef.current = onConnectStart;
  const onEdgeCreateRef = useRef(onEdgeCreate);
  onEdgeCreateRef.current = onEdgeCreate;
  const onNodeDeleteRef = useRef(onNodeDelete);
  onNodeDeleteRef.current = onNodeDelete;
  const onEdgeDeleteRef = useRef(onEdgeDelete);
  onEdgeDeleteRef.current = onEdgeDelete;

  // Data refs for pointer handler access
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  const imgWidth = currentImage?.width || 800;
  const imgHeight = currentImage?.height || 600;

  const nodeMap = useMemo(() => {
    const m: Record<number, CorridorNode> = {};
    nodes.forEach((n) => { m[n.id] = n; });
    return m;
  }, [nodes]);

  const nodeMapRef = useRef(nodeMap);
  nodeMapRef.current = nodeMap;

  const checkEdgeCollision = useCallback((fromNode: CorridorNode, toNode: CorridorNode): boolean => {
    for (const b of booths) {
      if (segmentIntersectsRect(fromNode.x, fromNode.y, toNode.x, toNode.y, b.x, b.y, b.width, b.height)) return true;
    }
    for (const o of obstacles) {
      if (o.shape === 'circle' && o.radius) {
        if (segmentIntersectsCircle(fromNode.x, fromNode.y, toNode.x, toNode.y, o.x, o.y, o.radius)) return true;
      } else if (o.width && o.height) {
        if (segmentIntersectsRect(fromNode.x, fromNode.y, toNode.x, toNode.y, o.x, o.y, o.width, o.height)) return true;
      }
    }
    return false;
  }, [booths, obstacles]);

  function applyZoom(newScale: number, pivotX: number, pivotY: number) {
    const t = transformRef.current;
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newScale));
    const ratio = clamped / t.scale;
    t.x = pivotX - ratio * (pivotX - t.x);
    t.y = pivotY - ratio * (pivotY - t.y);
    t.scale = clamped;
    const mc = mainContainerRef.current;
    if (mc) {
      mc.position.set(t.x, t.y);
      mc.scale.set(clamped);
    }
    setScale(clamped);
  }

  // ===== Initialize PIXI Application =====
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const w = el.offsetWidth || 800;
    const h = el.offsetHeight || 500;
    canvasDimsRef.current = { width: w, height: h };

    const app = new PIXI.Application({
      width: w,
      height: h,
      backgroundColor: 0xf3f4f6,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    el.appendChild(app.view as HTMLCanvasElement);

    const canvas = app.view as HTMLCanvasElement;
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    canvas.style.overscrollBehavior = 'none';
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    // Main container (replaces pixi-viewport)
    const mainContainer = new PIXI.Container();
    app.stage.addChild(mainContainer);
    mainContainer.addChild(bgLayerRef.current);
    mainContainer.addChild(boothLayerRef.current);
    mainContainer.addChild(obstacleLayerRef.current);
    mainContainer.addChild(edgeLayerRef.current);
    mainContainer.addChild(nodeLayerRef.current);
    mainContainerRef.current = mainContainer;

    // Set initial scale
    const initialScale = 0.6;
    transformRef.current = { x: 0, y: 0, scale: initialScale };
    mainContainer.scale.set(initialScale);

    // ===== Pointer events =====
    let isDragging = false;
    let isNodeDragging = false;
    let draggedNodeId: number | null = null;
    let draggedContainer: PIXI.Container | null = null;
    let dragStart = { x: 0, y: 0 };
    let pointerDownInfo = { x: 0, y: 0, time: 0 };
    let hitNodeIdOnDown: number | null = null;
    const pointers = new Map<number, { x: number; y: number }>();
    let lastPinchDist = 0;

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      pointerDownInfo = { x: e.clientX, y: e.clientY, time: Date.now() };
      hitNodeIdOnDown = null;

      if (pointers.size >= 2) {
        isDragging = false;
        isNodeDragging = false;
        const pts = Array.from(pointers.values());
        lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        return;
      }

      // Hit test nodes
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const t = transformRef.current;
      const wx = (sx - t.x) / t.scale;
      const wy = (sy - t.y) / t.scale;
      const hitR = (NODE_RADIUS / t.scale) * 2;

      for (const node of nodesRef.current) {
        const dx = wx - node.x;
        const dy = wy - node.y;
        if (dx * dx + dy * dy <= hitR * hitR) {
          hitNodeIdOnDown = node.id;
          if (modeRef.current === 'select') {
            isNodeDragging = true;
            draggedNodeId = node.id;
            draggedContainer = nodeContainersRef.current.get(node.id) || null;
          }
          return; // Don't start map drag when hitting a node
        }
      }

      // No node hit — start map drag
      dragStart = { x: e.clientX - t.x, y: e.clientY - t.y };
      isDragging = true;
    });

    canvas.addEventListener('pointermove', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 2) {
        const pts = Array.from(pointers.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        if (lastPinchDist > 0) {
          const rect = canvas.getBoundingClientRect();
          const cx = (pts[0].x + pts[1].x) / 2 - rect.left;
          const cy = (pts[0].y + pts[1].y) / 2 - rect.top;
          const newScale = transformRef.current.scale * (dist / lastPinchDist);
          applyZoom(newScale, cx, cy);
        }
        lastPinchDist = dist;
        return;
      }

      if (isNodeDragging && draggedContainer) {
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const t = transformRef.current;
        const wx = (sx - t.x) / t.scale;
        const wy = (sy - t.y) / t.scale;
        draggedContainer.x = wx;
        draggedContainer.y = wy;
        return;
      }

      if (isDragging && e.isPrimary) {
        const t = transformRef.current;
        t.x = e.clientX - dragStart.x;
        t.y = e.clientY - dragStart.y;
        mainContainer.position.set(t.x, t.y);
      }
    });

    canvas.addEventListener('pointerup', (e) => {
      canvas.releasePointerCapture(e.pointerId);
      pointers.delete(e.pointerId);

      const dx = e.clientX - pointerDownInfo.x;
      const dy = e.clientY - pointerDownInfo.y;
      const dt = Date.now() - pointerDownInfo.time;
      const isClick = Math.abs(dx) < CLICK_THRESHOLD && Math.abs(dy) < CLICK_THRESHOLD && dt < CLICK_TIME_THRESHOLD;

      if (isNodeDragging) {
        isNodeDragging = false;
        if (isClick && draggedNodeId !== null) {
          // Node click in select mode
          onNodeSelectRef.current(draggedNodeId);
        } else if (draggedContainer && draggedNodeId !== null) {
          // Node drag completed
          onNodeMoveRef.current(draggedNodeId, Math.round(draggedContainer.x), Math.round(draggedContainer.y));
        }
        draggedNodeId = null;
        draggedContainer = null;
        hitNodeIdOnDown = null;
        return;
      }

      isDragging = false;

      if (isClick) {
        if (hitNodeIdOnDown !== null) {
          // Clicked on a node (non-select mode)
          handleNodeClick(hitNodeIdOnDown);
        } else {
          handleEmptyClick(e);
        }
      }
      hitNodeIdOnDown = null;
      if (pointers.size < 2) lastPinchDist = 0;
    });

    canvas.addEventListener('pointercancel', (e) => {
      pointers.delete(e.pointerId);
      isDragging = false;
      isNodeDragging = false;
      draggedNodeId = null;
      draggedContainer = null;
      hitNodeIdOnDown = null;
      if (pointers.size < 2) lastPinchDist = 0;
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const rect = canvas.getBoundingClientRect();
      applyZoom(transformRef.current.scale * factor, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    function handleNodeClick(nodeId: number) {
      const m = modeRef.current;
      if (m === 'select') {
        onNodeSelectRef.current(nodeId);
      } else if (m === 'connect') {
        if (connectFromIdRef.current === null) {
          onConnectStartRef.current(nodeId);
        } else if (connectFromIdRef.current !== nodeId) {
          onEdgeCreateRef.current(connectFromIdRef.current, nodeId);
        }
      } else if (m === 'delete') {
        onNodeDeleteRef.current(nodeId);
      }
    }

    function handleEmptyClick(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const t = transformRef.current;
      const wx = (sx - t.x) / t.scale;
      const wy = (sy - t.y) / t.scale;
      const sc = t.scale;
      const m = modeRef.current;

      // Check edges for delete mode
      if (m === 'delete') {
        const edgesData = edgesRef.current;
        const nm = nodeMapRef.current;
        for (const edge of edgesData) {
          const from = nm[edge.from_node_id];
          const to = nm[edge.to_node_id];
          if (!from || !to) continue;
          const dist = pointToSegmentDist(wx, wy, from.x, from.y, to.x, to.y);
          if (dist < 10 / sc) {
            onEdgeDeleteRef.current(edge.id);
            return;
          }
        }
      }

      if (m === 'add_node') {
        onNodeAddRef.current(Math.round(wx), Math.round(wy));
      } else if (m === 'select') {
        onNodeSelectRef.current(null);
      }
    }

    pixiApp.current = app;
    setDimensions({ width: w, height: h });

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: rw, height: rh } = entry.contentRect;
        if (rw > 0 && rh > 0) {
          app.renderer.resize(rw, rh);
          canvasDimsRef.current = { width: rw, height: rh };
          setDimensions({ width: rw, height: rh });
        }
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      app.destroy(true);
      pixiApp.current = null;
      mainContainerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Background image =====
  useEffect(() => {
    const layer = bgLayerRef.current;
    layer.removeChildren();
    if (!currentImage) {
      const g = new PIXI.Graphics();
      g.beginFill(0xf3f4f6);
      g.drawRect(0, 0, imgWidth, imgHeight);
      g.endFill();
      layer.addChild(g);
      return;
    }
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8008';
    const zoomLevels = parseZoomLevels(currentImage);
    let imageUrl = '';
    if (zoomLevels.length > 0) {
      imageUrl = zoomLevels[Math.min(2, zoomLevels.length - 1)].path;
    } else {
      imageUrl = currentImage.medium_path;
    }
    if (imageUrl && !imageUrl.startsWith('http')) imageUrl = `${apiBase}${imageUrl}`;

    const tex = PIXI.Texture.from(imageUrl, { resourceOptions: { crossorigin: 'anonymous' } });
    const sprite = new PIXI.Sprite(tex);
    sprite.width = imgWidth;
    sprite.height = imgHeight;
    layer.addChild(sprite);
  }, [currentImage, imgWidth, imgHeight]);

  // ===== Booths (reference overlay) =====
  useEffect(() => {
    const layer = boothLayerRef.current;
    layer.removeChildren();
    layer.interactiveChildren = false;
    const sc = transformRef.current.scale;

    for (const b of booths) {
      const g = new PIXI.Graphics();
      g.lineStyle(1 / sc, 0x6366f1, 0.25);
      g.beginFill(0x6366f1, 0.13);
      g.drawRect(b.x, b.y, b.width, b.height);
      g.endFill();
      layer.addChild(g);

      const text = new PIXI.Text(b.booth_number, {
        fontSize: 8 / sc,
        fontFamily: 'Inter, sans-serif',
        fill: '#6366f1',
      });
      text.x = b.x + 2 / sc;
      text.y = b.y + 2 / sc;
      layer.addChild(text);
    }
  }, [booths]);

  // ===== Obstacles =====
  useEffect(() => {
    const layer = obstacleLayerRef.current;
    layer.removeChildren();
    layer.interactiveChildren = false;
    const sc = transformRef.current.scale;

    for (const obs of obstacles) {
      const g = new PIXI.Graphics();
      if (obs.shape === 'circle' && obs.radius) {
        g.lineStyle(1 / sc, 0xef4444);
        g.beginFill(0xef4444, 0.19);
        g.drawCircle(obs.x, obs.y, obs.radius);
        g.endFill();
      } else {
        g.lineStyle(1 / sc, 0xef4444);
        g.beginFill(0xef4444, 0.19);
        g.drawRect(obs.x, obs.y, obs.width || 40, obs.height || 40);
        g.endFill();
      }
      layer.addChild(g);
    }
  }, [obstacles]);

  // ===== Edges =====
  useEffect(() => {
    const layer = edgeLayerRef.current;
    layer.removeChildren();
    const sc = transformRef.current.scale;

    for (const edge of edges) {
      const from = nodeMap[edge.from_node_id];
      const to = nodeMap[edge.to_node_id];
      if (!from || !to) continue;

      const hasCollision = checkEdgeCollision(from, to);
      const isSelected = selectedNodeId === edge.from_node_id || selectedNodeId === edge.to_node_id;
      const color = hasCollision ? 0xef4444 : !edge.is_open ? 0x9ca3af : isSelected ? 0x4f46e5 : 0x22c55e;
      const lineWidth = (isSelected ? 3 : 2) / sc;

      const line = new PIXI.Graphics();
      line.lineStyle(lineWidth, color);
      line.moveTo(from.x, from.y);
      line.lineTo(to.x, to.y);
      layer.addChild(line);
    }

    // Connect preview line
    if (connectFromId !== null && nodeMap[connectFromId]) {
      const fromNode = nodeMap[connectFromId];
      const preview = new PIXI.Graphics();
      preview.lineStyle(2 / sc, 0x6366f1, 0.5);
      preview.moveTo(fromNode.x, fromNode.y);
      preview.lineTo(fromNode.x + 1, fromNode.y + 1);
      layer.addChild(preview);
    }
  }, [edges, nodeMap, selectedNodeId, connectFromId, checkEdgeCollision]);

  // ===== Nodes =====
  useEffect(() => {
    const layer = nodeLayerRef.current;
    layer.removeChildren();
    nodeContainersRef.current.clear();
    const sc = transformRef.current.scale;
    const r = NODE_RADIUS / sc;

    for (const node of nodes) {
      const isSelected = node.id === selectedNodeId;
      const isConnectSource = node.id === connectFromId;
      const color = NODE_COLORS[node.node_type] || 0x6b7280;
      const colorStr = NODE_COLORS_STR[node.node_type] || '#6b7280';
      const hasCrossFloor = !!node.connected_node_id;

      const container = new PIXI.Container();
      container.x = node.x;
      container.y = node.y;

      // Outer ring for selected/connect source
      if (isSelected || isConnectSource) {
        const ring = new PIXI.Graphics();
        ring.lineStyle(2 / sc, isConnectSource ? 0xf59e0b : 0x4f46e5);
        ring.drawCircle(0, 0, r * 1.8);
        container.addChild(ring);
      }

      // Cross-floor indicator
      if (hasCrossFloor) {
        const crossRing = new PIXI.Graphics();
        crossRing.lineStyle(1.5 / sc, 0xf97316);
        crossRing.drawCircle(0, 0, r * 1.5);
        container.addChild(crossRing);
      }

      // Node circle
      const circle = new PIXI.Graphics();
      circle.lineStyle(1.5 / sc, 0xffffff);
      circle.beginFill(color, 0.95);
      circle.drawCircle(0, 0, r);
      circle.endFill();
      container.addChild(circle);

      // Label
      const label = new PIXI.Text(`#${node.id}`, {
        fontSize: Math.max(6, 8 / sc),
        fontFamily: 'Inter, sans-serif',
        fontWeight: 'bold',
        fill: colorStr,
      });
      label.x = r + 2 / sc;
      label.y = -r / 2;
      container.addChild(label);

      nodeContainersRef.current.set(node.id, container);
      layer.addChild(container);
    }
  }, [nodes, selectedNodeId, connectFromId, nodeMap]);

  const cursorStyle = mode === 'add_node' ? 'crosshair' : mode === 'delete' ? 'pointer' : mode === 'connect' ? 'cell' : 'default';

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ cursor: cursorStyle, touchAction: 'none', overscrollBehavior: 'none' }}>
      {/* Legend */}
      <div className="absolute bottom-2 left-2 bg-white/90 dark:bg-[#1e1e1e]/90 backdrop-blur-sm rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2 text-[10px] space-y-1">
        {Object.entries(NODE_COLORS_STR).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-gray-600 dark:text-gray-300">{type}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full border-2 border-orange-500" />
          <span className="text-gray-600 dark:text-gray-300">cross-floor</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-0 border-t-2 border-red-500 border-dashed" />
          <span className="text-gray-600 dark:text-gray-300">collision</span>
        </div>
      </div>

      {/* Zoom indicator */}
      <div className="absolute top-2 right-2 bg-white/90 dark:bg-[#1e1e1e]/90 backdrop-blur-sm rounded px-2 py-1 text-[10px] text-gray-500 font-mono border border-gray-200 dark:border-gray-600">
        {Math.round(scale * 100)}%
      </div>
    </div>
  );
}
