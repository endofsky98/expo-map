import React, { useState, useEffect } from 'react';
import type { PathNode, PathEdge, PathNodeType } from '../editorTypes';

interface PathPanelProps {
  selectedObject: { kind: 'path_node'; id: number } | { kind: 'path_edge'; id: number };
  pathNodes: PathNode[];
  pathEdges: PathEdge[];
  floors: { id: number; name: string }[];
  currentFloorId: number | null;
  onSaveNode: (id: number, data: Partial<PathNode>) => void;
  onLinkNodes: (nodeId: number, targetNodeId: number) => void;
  onUnlinkNode: (nodeId: number) => void;
  onDeleteNode: (id: number) => void;
  onDeleteEdge: (id: number) => void;
  onToggleEdge: (id: number, isOpen: boolean) => void;
}

const NODE_TYPES: PathNodeType[] = ['entrance', 'exit', 'waypoint', 'stairs', 'escalator', 'elevator'];
const CROSS_FLOOR_TYPES: PathNodeType[] = ['stairs', 'escalator', 'elevator'];

function calcDistance(a: PathNode, b: PathNode): number {
  return Math.round(Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2) * 10) / 10;
}

// ── Node editor ─────────────────────────────────────────────────────────────

interface NodeFormState {
  type: PathNodeType;
  x: number;
  y: number;
  name: string;
  linkFloorId: number | '';
}

function NodeEditor({
  node,
  floors,
  currentFloorId,
  onSaveNode,
  onLinkNodes,
  onUnlinkNode,
  onDeleteNode,
  pathNodes,
}: {
  node: PathNode;
  floors: { id: number; name: string }[];
  currentFloorId: number | null;
  onSaveNode: (id: number, data: Partial<PathNode>) => void;
  onLinkNodes: (nodeId: number, targetNodeId: number) => void;
  onUnlinkNode: (nodeId: number) => void;
  onDeleteNode: (id: number) => void;
  pathNodes: PathNode[];
}) {
  const [form, setForm] = useState<NodeFormState>({
    type: node.type,
    x: node.x,
    y: node.y,
    name: node.name ?? '',
    linkFloorId: '',
  });
  const [targetFloorNodes, setTargetFloorNodes] = useState<PathNode[]>([]);
  const [selectedTargetNodeId, setSelectedTargetNodeId] = useState<number | ''>('');
  const [loadingTargetNodes, setLoadingTargetNodes] = useState(false);

  useEffect(() => {
    setForm({ type: node.type, x: node.x, y: node.y, name: node.name ?? '', linkFloorId: '' });
    setTargetFloorNodes([]);
    setSelectedTargetNodeId('');
  }, [node.id]);

  const isCrossFloor = CROSS_FLOOR_TYPES.includes(form.type);
  const linkedNode = node.linked_node_id != null
    ? pathNodes.find(n => n.id === node.linked_node_id)
    : undefined;

  function handleSave() {
    onSaveNode(node.id, {
      type: form.type,
      x: form.x,
      y: form.y,
      name: form.name || undefined,
    });
  }

  // 대상 층 선택 시 해당 층의 같은 타입 노드 로드
  async function handleFloorSelect(floorId: number | '') {
    setForm(f => ({ ...f, linkFloorId: floorId }));
    setSelectedTargetNodeId('');
    if (floorId === '') { setTargetFloorNodes([]); return; }
    setLoadingTargetNodes(true);
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8008';
      const res = await fetch(`${API_BASE}/api/path-nodes?floor_id=${floorId}`);
      const nodes: PathNode[] = await res.json();
      // 같은 타입만 필터 + 자기 자신 제외
      const candidates = nodes.filter(n => n.type === form.type && n.id !== node.id);
      setTargetFloorNodes(candidates);
    } catch { setTargetFloorNodes([]); }
    setLoadingTargetNodes(false);
  }

  function handleLink() {
    if (selectedTargetNodeId === '') return;
    onLinkNodes(node.id, selectedTargetNodeId as number);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Type */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Type</label>
        <select
          className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 border border-gray-600"
          value={form.type}
          onChange={e => setForm(f => ({ ...f, type: e.target.value as PathNodeType }))}
        >
          {NODE_TYPES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Position */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-gray-400 mb-1">X</label>
          <input
            type="number"
            className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 border border-gray-600"
            value={form.x}
            onChange={e => setForm(f => ({ ...f, x: parseFloat(e.target.value) || 0 }))}
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-400 mb-1">Y</label>
          <input
            type="number"
            className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 border border-gray-600"
            value={form.y}
            onChange={e => setForm(f => ({ ...f, y: parseFloat(e.target.value) || 0 }))}
          />
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Name (optional)</label>
        <input
          type="text"
          className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 border border-gray-600"
          placeholder="e.g. Main Entrance"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        />
      </div>

      {/* Linked node info */}
      {linkedNode && (
        <div className="bg-gray-700 rounded px-3 py-2 text-sm">
          <span className="text-gray-400">연결됨: 노드 </span>
          <span className="text-indigo-300 font-medium">#{linkedNode.id}</span>
          {linkedNode.name && <span className="text-gray-300"> ({linkedNode.name})</span>}
          <span className="text-gray-400"> · {floors.find(f => f.id === linkedNode.floor_id)?.name || `floor ${linkedNode.floor_id}`}</span>
          <button
            className="ml-2 text-xs text-red-400 hover:text-red-300 underline"
            onClick={() => onUnlinkNode(node.id)}
          >
            연결 해제
          </button>
        </div>
      )}

      {/* Cross-floor link */}
      {isCrossFloor && !linkedNode && (
        <div className="border border-gray-600 rounded p-3 flex flex-col gap-2">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">층간 연결</p>
          <select
            className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 border border-gray-600"
            value={form.linkFloorId}
            onChange={e => handleFloorSelect(e.target.value ? parseInt(e.target.value) : '')}
          >
            <option value="">대상 층 선택…</option>
            {floors.filter(fl => fl.id !== currentFloorId).map(fl => (
              <option key={fl.id} value={fl.id}>{fl.name}</option>
            ))}
          </select>
          {loadingTargetNodes && <p className="text-xs text-gray-500">로딩중...</p>}
          {targetFloorNodes.length > 0 && (
            <select
              className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 border border-gray-600"
              value={selectedTargetNodeId}
              onChange={e => setSelectedTargetNodeId(e.target.value ? parseInt(e.target.value) : '')}
            >
              <option value="">대상 노드 선택…</option>
              {targetFloorNodes.map(n => (
                <option key={n.id} value={n.id}>
                  #{n.id} {n.type}{n.name ? ` (${n.name})` : ''} — ({Math.round(n.x)}, {Math.round(n.y)})
                </option>
              ))}
            </select>
          )}
          {form.linkFloorId !== '' && !loadingTargetNodes && targetFloorNodes.length === 0 && (
            <p className="text-xs text-yellow-400">해당 층에 같은 타입({form.type}) 노드가 없습니다</p>
          )}
          <button
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded py-1.5 disabled:opacity-40"
            disabled={selectedTargetNodeId === ''}
            onClick={handleLink}
          >
            연결하기
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded py-1.5"
          onClick={handleSave}
        >
          Save
        </button>
        <button
          className="flex-1 bg-red-700 hover:bg-red-600 text-white text-sm rounded py-1.5"
          onClick={() => onDeleteNode(node.id)}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ── Edge editor ──────────────────────────────────────────────────────────────

function EdgeEditor({
  edge,
  pathNodes,
  onDeleteEdge,
  onToggleEdge,
}: {
  edge: PathEdge;
  pathNodes: PathNode[];
  onDeleteEdge: (id: number) => void;
  onToggleEdge: (id: number, isOpen: boolean) => void;
}) {
  const fromNode = pathNodes.find(n => n.id === edge.from_node_id);
  const toNode = pathNodes.find(n => n.id === edge.to_node_id);
  const distance = fromNode && toNode ? calcDistance(fromNode, toNode) : edge.distance;

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-gray-700 rounded px-3 py-2 text-sm grid grid-cols-2 gap-y-1">
        <span className="text-gray-400">From</span>
        <span className="text-white">#{edge.from_node_id}</span>
        <span className="text-gray-400">To</span>
        <span className="text-white">#{edge.to_node_id}</span>
        <span className="text-gray-400">Distance</span>
        <span className="text-white">{distance} px</span>
      </div>

      {/* is_open toggle */}
      <div className="flex items-center justify-between bg-gray-700 rounded px-3 py-2">
        <span className="text-sm text-gray-300">Open path</span>
        <button
          className={`relative w-10 h-5 rounded-full transition-colors ${edge.is_open ? 'bg-green-500' : 'bg-gray-500'}`}
          onClick={() => onToggleEdge(edge.id, !edge.is_open)}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${edge.is_open ? 'translate-x-5' : 'translate-x-0.5'}`}
          />
        </button>
      </div>

      <button
        className="w-full bg-red-700 hover:bg-red-600 text-white text-sm rounded py-1.5"
        onClick={() => onDeleteEdge(edge.id)}
      >
        Delete
      </button>
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export function PathPanel({
  selectedObject,
  pathNodes,
  pathEdges,
  floors,
  currentFloorId,
  onSaveNode,
  onLinkNodes,
  onUnlinkNode,
  onDeleteNode,
  onDeleteEdge,
  onToggleEdge,
}: PathPanelProps) {
  if (selectedObject.kind === 'path_node') {
    const node = pathNodes.find(n => n.id === selectedObject.id);
    if (!node) return <div className="p-4 text-sm text-gray-400">Node not found.</div>;
    return (
      <div className="p-4 bg-gray-800 text-white">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">
          Path Node <span className="text-indigo-300">#{node.id}</span>
        </p>
        <NodeEditor
          node={node}
          floors={floors}
          currentFloorId={currentFloorId}
          onSaveNode={onSaveNode}
          onLinkNodes={onLinkNodes}
          onUnlinkNode={onUnlinkNode}
          onDeleteNode={onDeleteNode}
          pathNodes={pathNodes}
        />
      </div>
    );
  }

  // path_edge
  const edge = pathEdges.find(e => e.id === selectedObject.id);
  if (!edge) return <div className="p-4 text-sm text-gray-400">Edge not found.</div>;
  return (
    <div className="p-4 bg-gray-800 text-white">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">
        Path Edge <span className="text-indigo-300">#{edge.id}</span>
      </p>
      <EdgeEditor
        edge={edge}
        pathNodes={pathNodes}
        onDeleteEdge={onDeleteEdge}
        onToggleEdge={onToggleEdge}
      />
    </div>
  );
}
