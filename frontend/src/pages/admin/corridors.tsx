import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  Trash2, MousePointer, Link2, CirclePlus, PenLine, Square, Construction, MapPin,
  Move, Maximize2, X, Save, AlertTriangle,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import {
  fetchFloors, fetchHalls, fetchCorridorNodes, fetchCorridorEdges,
  createCorridorNode, updateCorridorNode, deleteCorridorNode,
  createCorridorEdge, deleteCorridorEdge,
  fetchBooths, createBooth, updateBooth, deleteBooth,
  fetchObstacles, createObstacle, updateObstacle, deleteObstacle,
  fetchFacilities, createFacility, updateFacility, deleteFacility,
  fetchCurrentImage,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Floor, Hall, CorridorNode, CorridorEdge, Booth, Obstacle, Facility, MapImage } from '@/types';
import type { EditorMode, SelectedObject } from '@/components/CorridorVisualEditor';

const CorridorVisualEditor = dynamic(() => import('@/components/CorridorVisualEditor'), { ssr: false });

// ===== Info Panel Components =====

function NodeInfo({ node, edges, nodes, floors, ln, onDelete, onUpdate, onEdgeDelete, onShowLinkModal }: {
  node: CorridorNode;
  edges: CorridorEdge[];
  nodes: CorridorNode[];
  floors: Floor[];
  ln: (v: string | Record<string, string>) => string;
  onDelete: () => void;
  onUpdate: (data: Partial<CorridorNode>) => void;
  onEdgeDelete: (id: number) => void;
  onShowLinkModal: () => void;
}) {
  const connEdges = edges.filter(e => e.from_node_id === node.id || e.to_node_id === node.id);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Node #{node.id}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{node.node_type}</span>
        <span className="text-[10px] font-mono text-gray-500">({node.x}, {node.y})</span>
        <span className="text-[10px] text-gray-400">{floors.find(f => f.id === node.floor_id) ? ln(floors.find(f => f.id === node.floor_id)!.name) : ''}</span>
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        <select
          value={node.node_type}
          onChange={e => onUpdate({ node_type: e.target.value })}
          className="px-1.5 py-0.5 text-[10px] rounded border border-gray-200 dark:border-gray-600 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none"
        >
          <option value="intersection">intersection</option>
          <option value="booth_entry">booth_entry</option>
          <option value="entrance">entrance</option>
          <option value="facility_entry">facility_entry</option>
        </select>
        {node.connected_node_id ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400">
            ↔ #{node.connected_node_id}
          </span>
        ) : (
          <button onClick={onShowLinkModal} className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400">
            Cross-floor link
          </button>
        )}
        <span className="text-[10px] text-gray-400">Edges: {connEdges.length}</span>
        <button onClick={onDelete} className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400">
          <Trash2 className="h-3 w-3 inline mr-0.5" />Delete
        </button>
      </div>
      {connEdges.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {connEdges.map(e => {
            const otherId = e.from_node_id === node.id ? e.to_node_id : e.from_node_id;
            return (
              <span key={e.id} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex items-center gap-0.5">
                →#{otherId} ({Math.round(e.distance)}px)
                <button onClick={() => onEdgeDelete(e.id)} className="text-gray-400 hover:text-red-500"><X className="h-2.5 w-2.5" /></button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BoothInfo({ booth, onDelete, onUpdate }: {
  booth: Booth;
  onDelete: () => void;
  onUpdate: (data: Partial<Booth>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editNum, setEditNum] = useState(booth.booth_number);
  const [editW, setEditW] = useState(booth.width);
  const [editH, setEditH] = useState(booth.height);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-green-600 dark:text-green-400">Booth #{booth.id}</span>
        {!editing ? (
          <>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300">{booth.booth_number}</span>
            <span className="text-[10px] font-mono text-gray-500">({booth.x}, {booth.y})</span>
            <span className="text-[10px] text-gray-400">{booth.width}×{booth.height}</span>
          </>
        ) : (
          <>
            <input value={editNum} onChange={e => setEditNum(e.target.value)}
              className="px-1 py-0.5 text-[10px] w-16 rounded border border-gray-200 dark:border-gray-600 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none" />
            <input type="number" value={editW} onChange={e => setEditW(Number(e.target.value))}
              className="px-1 py-0.5 text-[10px] w-12 rounded border border-gray-200 dark:border-gray-600 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none" placeholder="W" />
            <span className="text-[10px] text-gray-400">×</span>
            <input type="number" value={editH} onChange={e => setEditH(Number(e.target.value))}
              className="px-1 py-0.5 text-[10px] w-12 rounded border border-gray-200 dark:border-gray-600 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none" placeholder="H" />
          </>
        )}
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {booth.company && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300">{typeof booth.company.name === 'string' ? booth.company.name : Object.values(booth.company.name)[0]}</span>}
        {!editing ? (
          <button onClick={() => setEditing(true)} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-300">
            Edit
          </button>
        ) : (
          <>
            <button onClick={() => { onUpdate({ booth_number: editNum, width: editW, height: editH }); setEditing(false); }}
              className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400">
              <Save className="h-3 w-3 inline mr-0.5" />Save
            </button>
            <button onClick={() => setEditing(false)} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-500">Cancel</button>
          </>
        )}
        <button onClick={onDelete} className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400">
          <Trash2 className="h-3 w-3 inline mr-0.5" />Delete
        </button>
      </div>
    </div>
  );
}

function ObstacleInfo({ obstacle, onDelete, onUpdate }: {
  obstacle: Obstacle;
  onDelete: () => void;
  onUpdate: (data: Partial<Obstacle>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editW, setEditW] = useState(obstacle.width || 40);
  const [editH, setEditH] = useState(obstacle.height || 40);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-red-600 dark:text-red-400">Obstacle #{obstacle.id}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300">{obstacle.shape}</span>
        <span className="text-[10px] font-mono text-gray-500">({obstacle.x}, {obstacle.y})</span>
        {!editing ? (
          <span className="text-[10px] text-gray-400">
            {obstacle.shape === 'circle' ? `r=${obstacle.radius}` : `${obstacle.width || 40}×${obstacle.height || 40}`}
          </span>
        ) : (
          <>
            <input type="number" value={editW} onChange={e => setEditW(Number(e.target.value))}
              className="px-1 py-0.5 text-[10px] w-12 rounded border border-gray-200 dark:border-gray-600 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none" />
            <span className="text-[10px] text-gray-400">×</span>
            <input type="number" value={editH} onChange={e => setEditH(Number(e.target.value))}
              className="px-1 py-0.5 text-[10px] w-12 rounded border border-gray-200 dark:border-gray-600 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none" />
          </>
        )}
      </div>
      <div className="flex items-center gap-1">
        {!editing ? (
          <button onClick={() => setEditing(true)} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-300">
            Edit
          </button>
        ) : (
          <>
            <button onClick={() => { onUpdate({ width: editW, height: editH }); setEditing(false); }}
              className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400">
              <Save className="h-3 w-3 inline mr-0.5" />Save
            </button>
            <button onClick={() => setEditing(false)} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-500">Cancel</button>
          </>
        )}
        <button onClick={onDelete} className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400">
          <Trash2 className="h-3 w-3 inline mr-0.5" />Delete
        </button>
      </div>
    </div>
  );
}

function FacilityInfo({ facility, onDelete, onUpdate }: {
  facility: Facility;
  onDelete: () => void;
  onUpdate: (data: Partial<Facility>) => void;
}) {
  const facilityTypes = ['restroom', 'elevator', 'stairs', 'entrance', 'info', 'emergency_exit'];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Facility #{facility.id}</span>
        <select
          value={facility.type}
          onChange={e => onUpdate({ type: e.target.value })}
          className="px-1.5 py-0.5 text-[10px] rounded border border-gray-200 dark:border-gray-600 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none"
        >
          {facilityTypes.map(ft => <option key={ft} value={ft}>{ft.replace('_', ' ')}</option>)}
        </select>
        <span className="text-[10px] font-mono text-gray-500">({facility.x}, {facility.y})</span>
        <span className={`text-[10px] px-1 rounded ${facility.is_active ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' : 'bg-gray-100 text-gray-400'}`}>
          {facility.is_active ? 'active' : 'inactive'}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onUpdate({ is_active: !facility.is_active })}
          className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-300"
        >
          {facility.is_active ? 'Deactivate' : 'Activate'}
        </button>
        <button onClick={onDelete} className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400">
          <Trash2 className="h-3 w-3 inline mr-0.5" />Delete
        </button>
      </div>
    </div>
  );
}

function EdgeInfo({ edge, nodes, onDelete }: {
  edge: CorridorEdge;
  nodes: CorridorNode[];
  onDelete: () => void;
}) {
  const from = nodes.find(n => n.id === edge.from_node_id);
  const to = nodes.find(n => n.id === edge.to_node_id);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-bold text-green-600 dark:text-green-400">Edge #{edge.id}</span>
      <span className="text-[10px] text-gray-500">
        #{edge.from_node_id} → #{edge.to_node_id}
      </span>
      <span className="text-[10px] font-mono text-gray-400">{Math.round(edge.distance)}px</span>
      <span className={`text-[10px] px-1 rounded ${edge.is_open ? 'bg-green-50 text-green-600 dark:bg-green-900/20' : 'bg-red-50 text-red-600 dark:bg-red-900/20'}`}>
        {edge.is_open ? 'open' : 'closed'}
      </span>
      <button onClick={onDelete} className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400">
        <Trash2 className="h-3 w-3 inline mr-0.5" />Delete
      </button>
    </div>
  );
}


// ===== Main Page =====

export default function CorridorsPage() {
  const { t, ln } = useI18n();
  const [floors, setFloors] = useState<Floor[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [allNodes, setAllNodes] = useState<CorridorNode[]>([]);
  const [allEdges, setAllEdges] = useState<CorridorEdge[]>([]);
  const [booths, setBooths] = useState<Booth[]>([]);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [currentImage, setCurrentImage] = useState<MapImage | null>(null);
  const [selectedFloorId, setSelectedFloorId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Editor state
  const [mode, setMode] = useState<EditorMode>('select');
  const [newNodeType, setNewNodeType] = useState('intersection');
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [connectFromId, setConnectFromId] = useState<number | null>(null);
  const [facilityType, setFacilityType] = useState('restroom');

  // Unified selection
  const [selectedObject, setSelectedObject] = useState<SelectedObject>(null);

  // Cross-floor link modal
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkTargetNodeId, setLinkTargetNodeId] = useState<string>('');

  useEffect(() => { loadInitial(); }, []);

  async function loadInitial() {
    setLoading(true);
    const [f, h] = await Promise.all([fetchFloors(), fetchHalls()]);
    setFloors(f);
    setHalls(h);
    if (f.length > 0) setSelectedFloorId(f[0].id);
    setLoading(false);
  }

  const loadFloorData = useCallback(async () => {
    if (!selectedFloorId) return;
    const [n, e, b, o, f, img] = await Promise.all([
      fetchCorridorNodes(),
      fetchCorridorEdges(),
      fetchBooths(selectedFloorId),
      fetchObstacles(selectedFloorId),
      fetchFacilities(selectedFloorId),
      fetchCurrentImage(selectedFloorId).catch(() => null),
    ]);
    setAllNodes(n);
    setAllEdges(e);
    setBooths(b);
    setObstacles(o);
    setFacilities(f);
    setCurrentImage(img);
  }, [selectedFloorId]);

  useEffect(() => { loadFloorData(); }, [loadFloorData]);

  // Filter nodes/edges for current floor
  const floorNodes = allNodes.filter(n => n.floor_id === selectedFloorId);
  const floorNodeIds = new Set(floorNodes.map(n => n.id));
  const floorEdges = allEdges.filter(e => floorNodeIds.has(e.from_node_id) || floorNodeIds.has(e.to_node_id));

  // ===== Handlers =====

  function handleObjectSelect(obj: SelectedObject) {
    setSelectedObject(obj);
    if (obj?.type === 'node') setSelectedNodeId(obj.id);
    else setSelectedNodeId(null);
  }

  async function handleNodeAdd(x: number, y: number) {
    const hallId = halls.find(h => h.floor_id === selectedFloorId)?.id;
    await createCorridorNode({ x, y, floor_id: selectedFloorId!, hall_id: hallId, node_type: newNodeType });
    await loadFloorData();
  }

  async function handleNodeMove(nodeId: number, x: number, y: number) {
    await updateCorridorNode(nodeId, { x, y });
    await loadFloorData();
  }

  async function handleEdgeCreate(fromId: number, toId: number) {
    const from = allNodes.find(n => n.id === fromId);
    const to = allNodes.find(n => n.id === toId);
    if (!from || !to) return;
    const dist = Math.round(Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2));
    await createCorridorEdge({ from_node_id: fromId, to_node_id: toId, distance: dist, is_open: true });
    setConnectFromId(null);
    await loadFloorData();
  }

  async function handleNodeDelete(nodeId: number) {
    if (!confirm('Delete this node and its edges?')) return;
    await deleteCorridorNode(nodeId);
    if (selectedObject?.type === 'node' && selectedObject.id === nodeId) setSelectedObject(null);
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    await loadFloorData();
  }

  async function handleEdgeDelete(edgeId: number) {
    if (!confirm('Delete this edge?')) return;
    await deleteCorridorEdge(edgeId);
    if (selectedObject?.type === 'edge' && selectedObject.id === edgeId) setSelectedObject(null);
    await loadFloorData();
  }

  async function handleNodeUpdate(nodeId: number, data: Partial<CorridorNode>) {
    await updateCorridorNode(nodeId, data);
    await loadFloorData();
  }

  // --- draw_corridor ---
  async function handleCorridorDraw(sx: number, sy: number, ex: number, ey: number) {
    const hallId = halls.find(h => h.floor_id === selectedFloorId)?.id;
    const SNAP_DIST = 15;

    function snapOrCreate(px: number, py: number) {
      for (const n of floorNodes) {
        if (Math.hypot(n.x - px, n.y - py) <= SNAP_DIST) return { id: n.id, x: n.x, y: n.y, existing: true };
      }
      return { id: 0, x: px, y: py, existing: false };
    }

    function lineIntersection(
      x1: number, y1: number, x2: number, y2: number,
      x3: number, y3: number, x4: number, y4: number,
    ): { x: number; y: number; t: number } | null {
      const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (Math.abs(denom) < 1e-10) return null;
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
      const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
      if (t < 0.01 || t > 0.99 || u < 0.01 || u > 0.99) return null;
      return { x: Math.round(x1 + t * (x2 - x1)), y: Math.round(y1 + t * (y2 - y1)), t };
    }

    const intersections: { x: number; y: number; t: number; edge: CorridorEdge }[] = [];
    for (const edge of floorEdges) {
      const fn = floorNodes.find(n => n.id === edge.from_node_id);
      const tn = floorNodes.find(n => n.id === edge.to_node_id);
      if (!fn || !tn) continue;
      const hit = lineIntersection(sx, sy, ex, ey, fn.x, fn.y, tn.x, tn.y);
      if (hit) intersections.push({ ...hit, edge });
    }
    intersections.sort((a, b) => a.t - b.t);

    const startSnap = snapOrCreate(sx, sy);
    const endSnap = snapOrCreate(ex, ey);

    let startNodeId = startSnap.id;
    if (!startSnap.existing) {
      const n = await createCorridorNode({ x: startSnap.x, y: startSnap.y, floor_id: selectedFloorId!, hall_id: hallId, node_type: 'intersection' });
      startNodeId = n.id;
    }

    const midNodeIds: number[] = [];
    for (const hit of intersections) {
      const n = await createCorridorNode({ x: hit.x, y: hit.y, floor_id: selectedFloorId!, hall_id: hallId, node_type: 'intersection' });
      midNodeIds.push(n.id);
      const fn = floorNodes.find(nd => nd.id === hit.edge.from_node_id)!;
      const tn = floorNodes.find(nd => nd.id === hit.edge.to_node_id)!;
      await deleteCorridorEdge(hit.edge.id);
      await createCorridorEdge({ from_node_id: fn.id, to_node_id: n.id, distance: Math.round(Math.hypot(hit.x - fn.x, hit.y - fn.y)), is_open: true });
      await createCorridorEdge({ from_node_id: n.id, to_node_id: tn.id, distance: Math.round(Math.hypot(tn.x - hit.x, tn.y - hit.y)), is_open: true });
    }

    let endNodeId = endSnap.id;
    if (!endSnap.existing) {
      const n = await createCorridorNode({ x: endSnap.x, y: endSnap.y, floor_id: selectedFloorId!, hall_id: hallId, node_type: 'intersection' });
      endNodeId = n.id;
    }

    const chain = [startNodeId, ...midNodeIds, endNodeId];
    const coordMap: Record<number, { x: number; y: number }> = {};
    coordMap[startNodeId] = { x: startSnap.x, y: startSnap.y };
    coordMap[endNodeId] = { x: endSnap.x, y: endSnap.y };
    for (let i = 0; i < intersections.length; i++) {
      coordMap[midNodeIds[i]] = { x: intersections[i].x, y: intersections[i].y };
    }
    for (let i = 0; i < chain.length - 1; i++) {
      const a = coordMap[chain[i]];
      const b = coordMap[chain[i + 1]];
      await createCorridorEdge({ from_node_id: chain[i], to_node_id: chain[i + 1], distance: Math.round(Math.hypot(b.x - a.x, b.y - a.y)), is_open: true });
    }
    await loadFloorData();
  }

  // --- Booth ---
  async function handleBoothCreate(x: number, y: number, w: number, h: number) {
    await createBooth({ floor_id: selectedFloorId!, booth_number: `B-${String(booths.length + 1).padStart(3, '0')}`, x, y, width: w, height: h });
    await loadFloorData();
  }
  async function handleBoothMove(id: number, x: number, y: number) { await updateBooth(id, { x, y }); await loadFloorData(); }
  async function handleBoothDelete(id: number) { await deleteBooth(id); if (selectedObject?.type === 'booth' && selectedObject.id === id) setSelectedObject(null); await loadFloorData(); }
  async function handleBoothUpdate(id: number, data: Partial<Booth>) { await updateBooth(id, data); await loadFloorData(); }

  // --- Obstacle ---
  async function handleObstacleCreate(x: number, y: number, w: number, h: number) {
    await createObstacle({ floor_id: selectedFloorId!, shape: 'rectangle', x, y, width: w, height: h });
    await loadFloorData();
  }
  async function handleObstacleMove(id: number, x: number, y: number) { await updateObstacle(id, { x, y }); await loadFloorData(); }
  async function handleObstacleDelete(id: number) { await deleteObstacle(id); if (selectedObject?.type === 'obstacle' && selectedObject.id === id) setSelectedObject(null); await loadFloorData(); }
  async function handleObstacleUpdate(id: number, data: Partial<Obstacle>) { await updateObstacle(id, data); await loadFloorData(); }

  // --- Facility ---
  async function handleFacilityCreate(x: number, y: number, type: string) { await createFacility({ floor_id: selectedFloorId!, type, x, y, is_active: true }); await loadFloorData(); }
  async function handleFacilityMove(id: number, x: number, y: number) { await updateFacility(id, { x, y }); await loadFloorData(); }
  async function handleFacilityDelete(id: number) { await deleteFacility(id); if (selectedObject?.type === 'facility' && selectedObject.id === id) setSelectedObject(null); await loadFloorData(); }
  async function handleFacilityUpdate(id: number, data: Partial<Facility>) { await updateFacility(id, data); await loadFloorData(); }

  // --- Cross-floor link ---
  async function handleSetCrossFloorLink() {
    if (selectedObject?.type !== 'node' || !linkTargetNodeId) return;
    const targetId = parseInt(linkTargetNodeId, 10);
    if (isNaN(targetId)) return;
    await updateCorridorNode(selectedObject.id, { connected_node_id: targetId });
    await updateCorridorNode(targetId, { connected_node_id: selectedObject.id });
    setShowLinkModal(false);
    setLinkTargetNodeId('');
    await loadFloorData();
  }

  async function handleRemoveCrossFloorLink() {
    if (selectedObject?.type !== 'node') return;
    const node = allNodes.find(n => n.id === selectedObject.id);
    if (!node?.connected_node_id) return;
    const otherId = node.connected_node_id;
    await updateCorridorNode(selectedObject.id, { connected_node_id: undefined });
    await updateCorridorNode(otherId, { connected_node_id: undefined });
    await loadFloorData();
  }

  // ===== Mode buttons =====
  const modeButtons: { mode: EditorMode; icon: typeof MousePointer; title: string }[] = [
    { mode: 'select', icon: MousePointer, title: 'Select' },
    { mode: 'draw_corridor', icon: PenLine, title: 'Draw Corridor' },
    { mode: 'draw_booth', icon: Square, title: 'Draw Booth' },
    { mode: 'draw_obstacle', icon: Construction, title: 'Draw Obstacle' },
    { mode: 'place_facility', icon: MapPin, title: 'Place Facility' },
    { mode: 'add_node', icon: CirclePlus, title: 'Add Node' },
    { mode: 'connect', icon: Link2, title: 'Connect Nodes' },
    { mode: 'delete', icon: Trash2, title: 'Delete' },
  ];

  // ===== Render =====
  if (loading) return <AdminLayout title="Map Editor"><div className="flex items-center justify-center h-64">Loading...</div></AdminLayout>;

  const selectedNode = selectedObject?.type === 'node' ? floorNodes.find(n => n.id === selectedObject.id) : null;
  const selectedBooth = selectedObject?.type === 'booth' ? booths.find(b => b.id === selectedObject.id) : null;
  const selectedObstacle = selectedObject?.type === 'obstacle' ? obstacles.find(o => o.id === selectedObject.id) : null;
  const selectedFacility = selectedObject?.type === 'facility' ? facilities.find(f => f.id === selectedObject.id) : null;
  const selectedEdge = selectedObject?.type === 'edge' ? floorEdges.find(e => e.id === selectedObject.id) : null;

  return (
    <AdminLayout title="Map Editor">
      <div className="h-[calc(100vh-64px)] flex flex-col">
        {/* Row 1: floor selector + stats */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <select
            value={selectedFloorId ?? ''}
            onChange={e => { setSelectedFloorId(Number(e.target.value)); setSelectedObject(null); }}
            className="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#2a2a2a] dark:text-gray-200 outline-none"
          >
            {floors.map(f => (
              <option key={f.id} value={f.id}>{ln(f.name)}</option>
            ))}
          </select>
          <span className="text-[10px] text-gray-400">
            Nodes: {floorNodes.length} | Edges: {floorEdges.length} | Booths: {booths.length} | Obstacles: {obstacles.length} | Facilities: {facilities.length}
          </span>
        </div>

        {/* Row 2: info bar */}
        <div className="border-b border-gray-200 dark:border-gray-700 px-3 py-1.5 min-h-[44px] flex items-center overflow-x-auto">
          {selectedObject === null && (
            <span className="text-[10px] text-gray-400">클릭하여 선택 | Select mode</span>
          )}
          {selectedNode && (
            <NodeInfo
              node={selectedNode}
              edges={floorEdges}
              nodes={floorNodes}
              floors={floors}
              ln={ln}
              onDelete={() => handleNodeDelete(selectedNode.id)}
              onUpdate={(data) => handleNodeUpdate(selectedNode.id, data)}
              onEdgeDelete={handleEdgeDelete}
              onShowLinkModal={() => setShowLinkModal(true)}
            />
          )}
          {selectedBooth && (
            <BoothInfo
              booth={selectedBooth}
              onDelete={() => handleBoothDelete(selectedBooth.id)}
              onUpdate={(data) => handleBoothUpdate(selectedBooth.id, data)}
            />
          )}
          {selectedObstacle && (
            <ObstacleInfo
              obstacle={selectedObstacle}
              onDelete={() => handleObstacleDelete(selectedObstacle.id)}
              onUpdate={(data) => handleObstacleUpdate(selectedObstacle.id, data)}
            />
          )}
          {selectedFacility && (
            <FacilityInfo
              facility={selectedFacility}
              onDelete={() => handleFacilityDelete(selectedFacility.id)}
              onUpdate={(data) => handleFacilityUpdate(selectedFacility.id, data)}
            />
          )}
          {selectedEdge && (
            <EdgeInfo
              edge={selectedEdge}
              nodes={floorNodes}
              onDelete={() => handleEdgeDelete(selectedEdge.id)}
            />
          )}
        </div>

        {/* Row 3: main area */}
        <div className="flex flex-1 min-h-0">
          {/* Left sidebar: mode buttons */}
          <div className="flex flex-col gap-1 p-1.5 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] w-10">
            {modeButtons.map(btn => (
              <button
                key={btn.mode}
                onClick={() => { setMode(btn.mode); if (btn.mode !== 'connect') setConnectFromId(null); }}
                title={btn.title}
                className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                  mode === btn.mode
                    ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400'
                    : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                <btn.icon className="h-4 w-4" />
              </button>
            ))}
            {mode === 'place_facility' && (
              <select
                value={facilityType}
                onChange={e => setFacilityType(e.target.value)}
                className="mt-1 w-7 text-[8px] rounded border border-gray-200 dark:border-gray-600 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none"
                title="Facility type"
              >
                <option value="restroom">🚻</option>
                <option value="elevator">🛗</option>
                <option value="stairs">🪜</option>
                <option value="entrance">🚪</option>
                <option value="info">ℹ️</option>
                <option value="emergency_exit">🚨</option>
              </select>
            )}
            {mode === 'add_node' && (
              <select
                value={newNodeType}
                onChange={e => setNewNodeType(e.target.value)}
                className="mt-1 w-7 text-[8px] rounded border border-gray-200 dark:border-gray-600 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none"
                title="Node type"
              >
                <option value="intersection">I</option>
                <option value="booth_entry">B</option>
                <option value="entrance">E</option>
                <option value="facility_entry">F</option>
              </select>
            )}
            {mode === 'connect' && connectFromId && (
              <span className="mt-1 text-[8px] text-center text-indigo-500 font-mono">#{connectFromId}</span>
            )}
          </div>

          {/* Map canvas */}
          <div className="flex-1 min-w-0">
            <CorridorVisualEditor
              nodes={floorNodes}
              edges={floorEdges}
              booths={booths}
              obstacles={obstacles}
              facilities={facilities}
              currentImage={currentImage}
              floorId={selectedFloorId!}
              mode={mode}
              newNodeType={newNodeType}
              selectedNodeId={selectedNodeId}
              connectFromId={connectFromId}
              onNodeAdd={handleNodeAdd}
              onNodeSelect={setSelectedNodeId}
              onNodeMove={handleNodeMove}
              onConnectStart={setConnectFromId}
              onEdgeCreate={handleEdgeCreate}
              onNodeDelete={handleNodeDelete}
              onEdgeDelete={handleEdgeDelete}
              selectedObject={selectedObject}
              onObjectSelect={handleObjectSelect}
              facilityType={facilityType}
              onCorridorDraw={handleCorridorDraw}
              onBoothCreate={handleBoothCreate}
              onBoothMove={handleBoothMove}
              onBoothDelete={handleBoothDelete}
              onObstacleCreate={handleObstacleCreate}
              onObstacleMove={handleObstacleMove}
              onObstacleDelete={handleObstacleDelete}
              onFacilityCreate={handleFacilityCreate}
              onFacilityMove={handleFacilityMove}
              onFacilityDelete={handleFacilityDelete}
            />
          </div>
        </div>
      </div>

      {/* Cross-floor link modal */}
      {showLinkModal && selectedObject?.type === 'node' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-[#2a2a2a] rounded-lg shadow-xl p-4 w-80">
            <h3 className="text-sm font-bold mb-3 dark:text-gray-200">Cross-floor Link</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Node #{selectedObject.id} → Target node ID:
            </p>
            <input
              type="number"
              value={linkTargetNodeId}
              onChange={e => setLinkTargetNodeId(e.target.value)}
              placeholder="Target node ID"
              className="w-full px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-600 dark:bg-[#1a1a1a] dark:text-gray-200 outline-none mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSetCrossFloorLink}
                disabled={!linkTargetNodeId}
                className="flex-1 px-3 py-1.5 text-xs rounded bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-40"
              >
                Link
              </button>
              {allNodes.find(n => n.id === selectedObject.id)?.connected_node_id && (
                <button
                  onClick={handleRemoveCrossFloorLink}
                  className="px-3 py-1.5 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400"
                >
                  Remove
                </button>
              )}
              <button
                onClick={() => { setShowLinkModal(false); setLinkTargetNodeId(''); }}
                className="px-3 py-1.5 text-xs rounded bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}