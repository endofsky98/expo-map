import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Stage, Layer, Rect, Circle, Line, Text, Group, Image as KonvaImage } from 'react-konva';
import Konva from 'konva';
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

const NODE_COLORS: Record<string, string> = {
  intersection: '#6366f1',
  booth_entry: '#22c55e',
  entrance: '#f59e0b',
  facility_entry: '#3b82f6',
};

const NODE_RADIUS = 8;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4.0;

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
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const [scale, setScale] = useState(0.6);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [dragNodeId, setDragNodeId] = useState<number | null>(null);

  useEffect(() => {
    function updateSize() {
      if (containerRef.current) {
        setDimensions({ width: containerRef.current.offsetWidth, height: containerRef.current.offsetHeight });
      }
    }
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Load background image
  useEffect(() => {
    if (!currentImage) { setBgImage(null); return; }
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8008';
    const zoomLevels = parseZoomLevels(currentImage);
    let imageUrl = '';
    if (zoomLevels.length > 0) {
      imageUrl = zoomLevels[Math.min(2, zoomLevels.length - 1)].path;
    } else {
      imageUrl = currentImage.medium_path;
    }
    if (imageUrl && !imageUrl.startsWith('http')) imageUrl = `${apiBase}${imageUrl}`;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => setBgImage(img);
  }, [currentImage]);

  const imgWidth = currentImage?.width || (bgImage?.naturalWidth ?? 800);
  const imgHeight = currentImage?.height || (bgImage?.naturalHeight ?? 600);

  const nodeMap = useMemo(() => {
    const m: Record<number, CorridorNode> = {};
    nodes.forEach((n) => { m[n.id] = n; });
    return m;
  }, [nodes]);

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

  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const factor = 1.1;
    let newScale = direction > 0 ? oldScale * factor : oldScale / factor;
    newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newScale));
    setScale(newScale);
    setPosition({ x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale });
  }

  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>) {
    // Only handle clicks on the stage background (not on nodes/edges)
    if (e.target !== stageRef.current && e.target.getParent()?.name() !== 'background') return;

    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    // Convert to map coordinates
    const mapX = (pointer.x - position.x) / scale;
    const mapY = (pointer.y - position.y) / scale;

    if (mode === 'add_node') {
      onNodeAdd(Math.round(mapX), Math.round(mapY));
    } else if (mode === 'select') {
      onNodeSelect(null);
    }
  }

  function handleNodeClick(nodeId: number, e: { cancelBubble: boolean }) {
    e.cancelBubble = true;
    if (mode === 'select') {
      onNodeSelect(nodeId);
    } else if (mode === 'connect') {
      if (connectFromId === null) {
        onConnectStart(nodeId);
      } else if (connectFromId !== nodeId) {
        onEdgeCreate(connectFromId, nodeId);
      }
    } else if (mode === 'delete') {
      onNodeDelete(nodeId);
    }
  }

  function handleEdgeClick(edgeId: number, e: { cancelBubble: boolean }) {
    e.cancelBubble = true;
    if (mode === 'delete') {
      onEdgeDelete(edgeId);
    }
  }

  function handleNodeDragEnd(nodeId: number, e: Konva.KonvaEventObject<DragEvent>) {
    if (mode !== 'select') return;
    const node = e.target;
    onNodeMove(nodeId, Math.round(node.x()), Math.round(node.y()));
    setDragNodeId(null);
  }

  const cursorStyle = mode === 'add_node' ? 'crosshair' : mode === 'delete' ? 'pointer' : mode === 'connect' ? 'cell' : 'default';

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ cursor: cursorStyle }}>
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        draggable={mode === 'select' && dragNodeId === null}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onDragEnd={() => {
          const stage = stageRef.current;
          if (stage && dragNodeId === null) setPosition(stage.position());
        }}
        onDragMove={() => {
          const stage = stageRef.current;
          if (stage && dragNodeId === null) setPosition(stage.position());
        }}
      >
        {/* Background */}
        <Layer name="background">
          {bgImage && (
            <KonvaImage image={bgImage} x={0} y={0} width={imgWidth} height={imgHeight} />
          )}
          {!bgImage && (
            <Rect x={0} y={0} width={imgWidth} height={imgHeight} fill="#f3f4f6" />
          )}
        </Layer>

        {/* Booths (semi-transparent reference) */}
        <Layer listening={false}>
          {booths.map((b) => (
            <Group key={`booth-${b.id}`}>
              <Rect
                x={b.x} y={b.y} width={b.width} height={b.height}
                fill="#6366f120" stroke="#6366f140" strokeWidth={1 / scale}
              />
              <Text
                x={b.x + 2 / scale} y={b.y + 2 / scale}
                text={b.booth_number} fontSize={8 / scale} fill="#6366f1"
                fontFamily="Inter, sans-serif" listening={false}
              />
            </Group>
          ))}
        </Layer>

        {/* Obstacles */}
        <Layer listening={false}>
          {obstacles.map((obs) => {
            if (obs.shape === 'circle' && obs.radius) {
              return (
                <Circle key={`obs-${obs.id}`} x={obs.x} y={obs.y} radius={obs.radius}
                  fill="#ef444430" stroke="#ef4444" strokeWidth={1 / scale} />
              );
            }
            return (
              <Rect key={`obs-${obs.id}`} x={obs.x} y={obs.y}
                width={obs.width || 40} height={obs.height || 40}
                fill="#ef444430" stroke="#ef4444" strokeWidth={1 / scale} />
            );
          })}
        </Layer>

        {/* Edges */}
        <Layer>
          {edges.map((edge) => {
            const from = nodeMap[edge.from_node_id];
            const to = nodeMap[edge.to_node_id];
            if (!from || !to) return null;
            const hasCollision = checkEdgeCollision(from, to);
            const isSelected = selectedNodeId === edge.from_node_id || selectedNodeId === edge.to_node_id;
            return (
              <Line
                key={`edge-${edge.id}`}
                points={[from.x, from.y, to.x, to.y]}
                stroke={hasCollision ? '#ef4444' : !edge.is_open ? '#9ca3af' : isSelected ? '#4f46e5' : '#22c55e'}
                strokeWidth={(isSelected ? 3 : 2) / scale}
                dash={hasCollision ? [6 / scale, 3 / scale] : !edge.is_open ? [4 / scale, 4 / scale] : undefined}
                hitStrokeWidth={10 / scale}
                onClick={(e) => handleEdgeClick(edge.id, e)}
                onTap={(e) => handleEdgeClick(edge.id, e)}
              />
            );
          })}
          {/* Connect preview line */}
          {connectFromId !== null && nodeMap[connectFromId] && (
            <Line
              points={[nodeMap[connectFromId].x, nodeMap[connectFromId].y, nodeMap[connectFromId].x + 1, nodeMap[connectFromId].y + 1]}
              stroke="#6366f180" strokeWidth={2 / scale} dash={[4 / scale, 4 / scale]}
              listening={false}
            />
          )}
        </Layer>

        {/* Nodes */}
        <Layer>
          {nodes.map((node) => {
            const isSelected = node.id === selectedNodeId;
            const isConnectSource = node.id === connectFromId;
            const color = NODE_COLORS[node.node_type] || '#6b7280';
            const hasCrossFloor = !!node.connected_node_id;
            const r = NODE_RADIUS / scale;

            return (
              <Group
                key={`node-${node.id}`}
                x={node.x}
                y={node.y}
                draggable={mode === 'select'}
                onDragStart={() => setDragNodeId(node.id)}
                onDragEnd={(e) => handleNodeDragEnd(node.id, e)}
                onClick={(e) => handleNodeClick(node.id, e)}
                onTap={(e) => handleNodeClick(node.id, e)}
              >
                {/* Outer ring for selected/connect source */}
                {(isSelected || isConnectSource) && (
                  <Circle radius={r * 1.8} fill="transparent"
                    stroke={isConnectSource ? '#f59e0b' : '#4f46e5'}
                    strokeWidth={2 / scale}
                    dash={isConnectSource ? [3 / scale, 2 / scale] : undefined}
                    listening={false} />
                )}
                {/* Cross-floor indicator */}
                {hasCrossFloor && (
                  <Circle radius={r * 1.5} fill="transparent"
                    stroke="#f97316" strokeWidth={1.5 / scale}
                    listening={false} />
                )}
                {/* Node circle */}
                <Circle radius={r} fill={color}
                  stroke="white" strokeWidth={1.5 / scale}
                  opacity={0.95} />
                {/* Node type label */}
                <Text
                  x={r + 2 / scale} y={-r / 2}
                  text={`#${node.id}`}
                  fontSize={Math.max(6, 8 / scale)} fill={color}
                  fontFamily="Inter, sans-serif" fontStyle="bold"
                  listening={false} />
              </Group>
            );
          })}
        </Layer>
      </Stage>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 bg-white/90 dark:bg-[#1e1e1e]/90 backdrop-blur-sm rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2 text-[10px] space-y-1">
        {Object.entries(NODE_COLORS).map(([type, color]) => (
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
