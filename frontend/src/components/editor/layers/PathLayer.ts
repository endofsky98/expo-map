import * as PIXI from 'pixi.js';
import type { PathNode, PathEdge, SelectedObject, DrawStyle } from '../editorTypes';
import { drawPathNode, drawPathEdge } from '../ShapeDrawer';

interface PathLayerProps {
  graphics: PIXI.Graphics;
  pathNodes: PathNode[];
  pathEdges: PathEdge[];
  scale: number;
  selectedObject: SelectedObject;
  connectFromId: number | null; // highlight the "from" node during connect mode
}

export function renderPathLayer(props: PathLayerProps) {
  const { graphics: g, pathNodes, pathEdges, scale, selectedObject, connectFromId } = props;
  g.clear();

  // Build node map for edge rendering
  const nodeMap: Record<number, PathNode> = {};
  for (const n of pathNodes) nodeMap[n.id] = n;

  // Edges first (behind nodes)
  for (const edge of pathEdges) {
    const from = nodeMap[edge.from_node_id];
    const to = nodeMap[edge.to_node_id];
    if (!from || !to) continue;
    const selected = selectedObject?.kind === 'path_edge' && selectedObject.id === edge.id;
    const style: DrawStyle = {
      lineColor: selected ? 0x4f46e5 : (edge.is_open ? 0x22c55e : 0xef4444),
      lineWidth: 2,
      fillColor: 0,
      fillAlpha: 0,
      selected,
    };
    drawPathEdge(g, from, to, style, scale);
  }

  // Nodes
  for (const n of pathNodes) {
    const selected =
      (selectedObject?.kind === 'path_node' && selectedObject.id === n.id) ||
      connectFromId === n.id;
    drawPathNode(g, n.x, n.y, n.type, selected, scale);
  }
}
