import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Trash2, MousePointer, Link2, CirclePlus, AlertTriangle } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import {
  fetchFloors, fetchHalls, fetchCorridorNodes, fetchCorridorEdges,
  createCorridorNode, updateCorridorNode, deleteCorridorNode,
  createCorridorEdge, deleteCorridorEdge,
  fetchBooths, fetchObstacles, fetchCurrentImage,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Floor, Hall, CorridorNode, CorridorEdge, Booth, Obstacle, MapImage } from '@/types';
import type { EditorMode } from '@/components/CorridorVisualEditor';

const CorridorVisualEditor = dynamic(() => import('@/components/CorridorVisualEditor'), { ssr: false });

export default function CorridorsPage() {
  const { t, ln } = useI18n();
  const [floors, setFloors] = useState<Floor[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [allNodes, setAllNodes] = useState<CorridorNode[]>([]);
  const [allEdges, setAllEdges] = useState<CorridorEdge[]>([]);
  const [booths, setBooths] = useState<Booth[]>([]);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [currentImage, setCurrentImage] = useState<MapImage | null>(null);
  const [selectedFloorId, setSelectedFloorId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Editor state
  const [mode, setMode] = useState<EditorMode>('select');
  const [newNodeType, setNewNodeType] = useState('intersection');
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [connectFromId, setConnectFromId] = useState<number | null>(null);

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
    const [n, e, b, o, img] = await Promise.all([
      fetchCorridorNodes(), // load all nodes for cross-floor linking
      fetchCorridorEdges(),
      fetchBooths(selectedFloorId),
      fetchObstacles(selectedFloorId),
      fetchCurrentImage(selectedFloorId).catch(() => null),
    ]);
    setAllNodes(n);
    setAllEdges(e);
    setBooths(b);
    setObstacles(o);
    setCurrentImage(img);
  }, [selectedFloorId]);

  useEffect(() => { loadFloorData(); }, [loadFloorData]);

  // Filter nodes/edges for current floor
  const floorNodes = allNodes.filter((n) => n.floor_id === selectedFloorId);
  const floorNodeIds = new Set(floorNodes.map((n) => n.id));
  const floorEdges = allEdges.filter((e) => floorNodeIds.has(e.from_node_id) || floorNodeIds.has(e.to_node_id));

  const selectedNode = floorNodes.find((n) => n.id === selectedNodeId) || null;

  // Handlers
  async function handleNodeAdd(x: number, y: number) {
    const hallId = halls.find((h) => h.floor_id === selectedFloorId)?.id;
    await createCorridorNode({
      x, y,
      floor_id: selectedFloorId!,
      hall_id: hallId,
      node_type: newNodeType,
    });
    await loadFloorData();
  }

  async function handleNodeMove(nodeId: number, x: number, y: number) {
    await updateCorridorNode(nodeId, { x, y });
    await loadFloorData();
  }

  async function handleEdgeCreate(fromId: number, toId: number) {
    const from = allNodes.find((n) => n.id === fromId);
    const to = allNodes.find((n) => n.id === toId);
    if (!from || !to) return;
    const dist = Math.round(Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2));
    await createCorridorEdge({ from_node_id: fromId, to_node_id: toId, distance: dist, is_open: true });
    setConnectFromId(null);
    await loadFloorData();
  }

  async function handleNodeDelete(nodeId: number) {
    if (!confirm('Delete this node and its edges?')) return;
    await deleteCorridorNode(nodeId);
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    await loadFloorData();
  }

  async function handleEdgeDelete(edgeId: number) {
    if (!confirm('Delete this edge?')) return;
    await deleteCorridorEdge(edgeId);
    await loadFloorData();
  }

  async function handleSetCrossFloorLink() {
    if (!selectedNode || !linkTargetNodeId) return;
    const targetId = Number(linkTargetNodeId);
    await updateCorridorNode(selectedNode.id, { connected_node_id: targetId });
    // Also set reverse link on target node
    const targetNode = await fetchCorridorNodes().then((ns) => ns.find((n) => n.id === targetId));
    if (targetNode && !targetNode.connected_node_id) {
      await updateCorridorNode(targetId, { connected_node_id: selectedNode.id });
    }
    setShowLinkModal(false);
    setLinkTargetNodeId('');
    await loadFloorData();
  }

  async function handleRemoveCrossFloorLink() {
    if (!selectedNode) return;
    const linkedId = selectedNode.connected_node_id;
    await updateCorridorNode(selectedNode.id, { connected_node_id: null as unknown as number });
    if (linkedId) {
      await updateCorridorNode(linkedId, { connected_node_id: null as unknown as number });
    }
    await loadFloorData();
  }

  // Get nodes from other floors for cross-floor linking
  const otherFloorNodes = allNodes.filter((n) => n.floor_id !== selectedFloorId);

  const modeButtons: { mode: EditorMode; icon: typeof MousePointer; label: string }[] = [
    { mode: 'select', icon: MousePointer, label: 'Select / Move' },
    { mode: 'add_node', icon: CirclePlus, label: 'Add Node' },
    { mode: 'connect', icon: Link2, label: 'Connect Nodes' },
    { mode: 'delete', icon: Trash2, label: 'Delete' },
  ];

  return (
    <AdminLayout title={t('nav.corridors')}>
      <div className="max-w-full mx-auto space-y-4">
        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Floor selector */}
          <select
            value={selectedFloorId ?? ''}
            onChange={(e) => {
              setSelectedFloorId(Number(e.target.value));
              setSelectedNodeId(null);
              setConnectFromId(null);
            }}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none"
          >
            {floors.map((f) => <option key={f.id} value={f.id}>{ln(f.name)}</option>)}
          </select>

          <div className="w-px h-6 bg-gray-200 dark:bg-gray-600" />

          {/* Mode buttons */}
          {modeButtons.map((btn) => {
            const Icon = btn.icon;
            const active = mode === btn.mode;
            return (
              <button
                key={btn.mode}
                onClick={() => { setMode(btn.mode); setConnectFromId(null); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 dark:bg-[#1e1e1e] dark:text-gray-300 dark:border-gray-500/40 dark:hover:bg-[#2a2a2a]'
                }`}
                title={btn.label}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{btn.label}</span>
              </button>
            );
          })}

          {/* Node type (for add mode) */}
          {mode === 'add_node' && (
            <select
              value={newNodeType}
              onChange={(e) => setNewNodeType(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none"
            >
              <option value="intersection">intersection</option>
              <option value="booth_entry">booth_entry</option>
              <option value="entrance">entrance</option>
              <option value="facility_entry">facility_entry</option>
            </select>
          )}

          <div className="ml-auto text-xs text-gray-400 dark:text-gray-500">
            Nodes: {floorNodes.length} | Edges: {floorEdges.length}
          </div>
        </div>

        {/* Connect mode hint */}
        {mode === 'connect' && connectFromId && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            Connecting from node #{connectFromId}. Click another node to create an edge, or change mode to cancel.
          </div>
        )}

        {/* Visual Editor + Side Panel */}
        <div className="flex gap-4">
          {/* Canvas */}
          <div className="flex-1 bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-500/40 overflow-hidden" style={{ height: '65vh', minHeight: 400 }}>
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="h-6 w-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <CorridorVisualEditor
                nodes={floorNodes}
                edges={floorEdges}
                booths={booths}
                obstacles={obstacles}
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
              />
            )}
          </div>

          {/* Side Panel: selected node info */}
          <div className="w-72 shrink-0 space-y-4">
            {selectedNode ? (
              <>
                <div className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-500/40 p-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Node #{selectedNode.id}</h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Type</span>
                      <span className="text-gray-900 dark:text-gray-200 font-medium">{selectedNode.node_type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Position</span>
                      <span className="text-gray-900 dark:text-gray-200 font-mono">({selectedNode.x}, {selectedNode.y})</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Floor</span>
                      <span className="text-gray-900 dark:text-gray-200">{floors.find((f) => f.id === selectedNode.floor_id) ? ln(floors.find((f) => f.id === selectedNode.floor_id)!.name) : '-'}</span>
                    </div>

                    {/* Connected edges */}
                    <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                      <span className="text-gray-500 font-medium">Connected Edges</span>
                      <div className="mt-1 space-y-1">
                        {floorEdges.filter((e) => e.from_node_id === selectedNode.id || e.to_node_id === selectedNode.id).map((e) => {
                          const otherId = e.from_node_id === selectedNode.id ? e.to_node_id : e.from_node_id;
                          return (
                            <div key={e.id} className="flex items-center justify-between">
                              <span className="text-gray-600 dark:text-gray-400">→ #{otherId} ({Math.round(e.distance)}px)</span>
                              <button onClick={() => handleEdgeDelete(e.id)} className="text-gray-400 hover:text-red-500">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cross-floor connection */}
                <div className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-500/40 p-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Cross-Floor Link</h3>
                  {selectedNode.connected_node_id ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="w-2 h-2 rounded-full bg-orange-500" />
                        <span className="text-gray-600 dark:text-gray-300">
                          Linked to node #{selectedNode.connected_node_id}
                        </span>
                      </div>
                      <button
                        onClick={handleRemoveCrossFloorLink}
                        className="w-full px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
                      >
                        Remove Link
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowLinkModal(true)}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:hover:bg-orange-900/30"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      Set Cross-Floor Link
                    </button>
                  )}
                </div>

                {/* Delete node */}
                <button
                  onClick={() => handleNodeDelete(selectedNode.id)}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Node #{selectedNode.id}
                </button>
              </>
            ) : (
              <div className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-500/40 p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
                  Select a node to view details and manage cross-floor connections.
                </p>
              </div>
            )}

            {/* Quick add form */}
            <div className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-500/40 p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Quick Stats</h3>
              <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                <p>Total nodes (this floor): {floorNodes.length}</p>
                <p>Total edges (this floor): {floorEdges.length}</p>
                <p>Cross-floor links: {floorNodes.filter((n) => n.connected_node_id).length}</p>
                <p>Collision edges: {floorEdges.filter((e) => {
                  const from = floorNodes.find((n) => n.id === e.from_node_id);
                  const to = floorNodes.find((n) => n.id === e.to_node_id);
                  if (!from || !to) return false;
                  for (const b of booths) {
                    for (const tt of [0, 0.25, 0.5, 0.75, 1]) {
                      const px = from.x + tt * (to.x - from.x);
                      const py = from.y + tt * (to.y - from.y);
                      if (px >= b.x && px <= b.x + b.width && py >= b.y && py <= b.y + b.height) return true;
                    }
                  }
                  return false;
                }).length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Cross-floor link modal */}
        {showLinkModal && selectedNode && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowLinkModal(false)}>
            <div className="bg-white dark:bg-[#1e1e1e] rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Set Cross-Floor Link</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Link node #{selectedNode.id} ({selectedNode.node_type}) on {floors.find((f) => f.id === selectedNode.floor_id) ? ln(floors.find((f) => f.id === selectedNode.floor_id)!.name) : ''} to a node on another floor.
                This enables pathfinding across floors via stairs/elevators.
              </p>
              <select
                value={linkTargetNodeId}
                onChange={(e) => setLinkTargetNodeId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none"
              >
                <option value="">Select target node...</option>
                {floors.filter((f) => f.id !== selectedFloorId).map((floor) => (
                  <optgroup key={floor.id} label={ln(floor.name) || `Floor ${floor.id}`}>
                    {otherFloorNodes.filter((n) => n.floor_id === floor.id).map((n) => (
                      <option key={n.id} value={n.id}>
                        #{n.id} ({n.node_type}) at ({n.x}, {n.y})
                        {n.connected_node_id ? ` [already linked to #${n.connected_node_id}]` : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleSetCrossFloorLink}
                  disabled={!linkTargetNodeId}
                  className="flex-1 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 disabled:opacity-50"
                >
                  {t('admin.save')}
                </button>
                <button onClick={() => setShowLinkModal(false)} className="px-4 py-2 text-sm text-gray-500">
                  {t('admin.cancel')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
