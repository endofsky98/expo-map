import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { fetchFloors, fetchHalls, fetchCorridorNodes, fetchCorridorEdges, createCorridorNode, deleteCorridorNode, createCorridorEdge, deleteCorridorEdge } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Floor, Hall, CorridorNode, CorridorEdge } from '@/types';

export default function CorridorsPage() {
  const { t, ln } = useI18n();
  const [floors, setFloors] = useState<Floor[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [nodes, setNodes] = useState<CorridorNode[]>([]);
  const [edges, setEdges] = useState<CorridorEdge[]>([]);
  const [filterFloor, setFilterFloor] = useState<number | ''>('');
  const [filterHall, setFilterHall] = useState<number | ''>('');
  const [loading, setLoading] = useState(true);
  const [showNodeForm, setShowNodeForm] = useState(false);
  const [showEdgeForm, setShowEdgeForm] = useState(false);
  const [nodeForm, setNodeForm] = useState({ x: 0, y: 0, floor_id: 0, hall_id: 0, node_type: 'intersection' });
  const [edgeForm, setEdgeForm] = useState({ from_node_id: 0, to_node_id: 0, distance: 0 });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [f, h, n, e] = await Promise.all([fetchFloors(), fetchHalls(), fetchCorridorNodes(), fetchCorridorEdges()]);
    setFloors(f);
    setHalls(h);
    setNodes(n);
    setEdges(e);
    setLoading(false);
  }

  const filteredNodes = nodes.filter((n) => {
    if (filterFloor && n.floor_id !== filterFloor) return false;
    if (filterHall && n.hall_id !== filterHall) return false;
    return true;
  });

  async function handleCreateNode() {
    await createCorridorNode(nodeForm);
    setShowNodeForm(false);
    loadData();
  }

  async function handleDeleteNode(id: number) {
    if (!confirm('Delete node and its edges?')) return;
    await deleteCorridorNode(id);
    loadData();
  }

  async function handleCreateEdge() {
    await createCorridorEdge({ ...edgeForm, is_open: true });
    setShowEdgeForm(false);
    loadData();
  }

  async function handleDeleteEdge(id: number) {
    if (!confirm('Delete edge?')) return;
    await deleteCorridorEdge(id);
    loadData();
  }

  return (
    <AdminLayout title={t('nav.corridors')}>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <select value={filterFloor} onChange={(e) => { setFilterFloor(e.target.value ? Number(e.target.value) : ''); setFilterHall(''); }} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none">
            <option value="">{t('filter.all')} {t('admin.floor')}</option>
            {floors.map((f) => <option key={f.id} value={f.id}>{ln(f.name)}</option>)}
          </select>
          <select value={filterHall} onChange={(e) => setFilterHall(e.target.value ? Number(e.target.value) : '')} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none">
            <option value="">{t('filter.all')} {t('admin.hall')}</option>
            {halls.filter((h) => !filterFloor || h.floor_id === filterFloor).map((h) => <option key={h.id} value={h.id}>{ln(h.name)}</option>)}
          </select>
        </div>

        {/* Nodes */}
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-500/40 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Corridor Nodes ({filteredNodes.length})</h2>
            <button onClick={() => { setNodeForm({ x: 0, y: 0, floor_id: floors[0]?.id || 0, hall_id: halls[0]?.id || 0, node_type: 'intersection' }); setShowNodeForm(true); }} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">
              <Plus className="h-3.5 w-3.5" />Add Node
            </button>
          </div>
          {loading ? <p className="text-sm text-gray-500">{t('admin.loading')}</p> : (
            <div className="max-h-64 overflow-y-auto space-y-1">
              {filteredNodes.map((n) => (
                <div key={n.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 dark:hover:bg-[#222] text-sm">
                  <span className="text-gray-600 dark:text-gray-300">
                    #{n.id} ({n.x}, {n.y}) <span className="text-xs text-gray-400">{n.node_type}</span>
                    {n.connected_node_id && <span className="text-xs text-indigo-500 ml-1">→ #{n.connected_node_id}</span>}
                  </span>
                  <button onClick={() => handleDeleteNode(n.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Edges */}
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-500/40 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Corridor Edges ({edges.length})</h2>
            <button onClick={() => { setEdgeForm({ from_node_id: 0, to_node_id: 0, distance: 100 }); setShowEdgeForm(true); }} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">
              <Plus className="h-3.5 w-3.5" />Add Edge
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {edges.map((e) => (
              <div key={e.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 dark:hover:bg-[#222] text-sm">
                <span className="text-gray-600 dark:text-gray-300">
                  #{e.from_node_id} → #{e.to_node_id} <span className="text-xs text-gray-400">({Math.round(e.distance)}px){!e.is_open && ' [closed]'}</span>
                </span>
                <button onClick={() => handleDeleteEdge(e.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </div>

        {/* Node Form */}
        {showNodeForm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowNodeForm(false)}>
            <div className="bg-white dark:bg-[#1e1e1e] rounded-xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Add Node</h3>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input type="number" value={nodeForm.x} onChange={(e) => setNodeForm({ ...nodeForm, x: Number(e.target.value) })} placeholder="X" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                  <input type="number" value={nodeForm.y} onChange={(e) => setNodeForm({ ...nodeForm, y: Number(e.target.value) })} placeholder="Y" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                </div>
                <select value={nodeForm.floor_id} onChange={(e) => setNodeForm({ ...nodeForm, floor_id: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none">
                  {floors.map((f) => <option key={f.id} value={f.id}>{ln(f.name)}</option>)}
                </select>
                <select value={nodeForm.hall_id} onChange={(e) => setNodeForm({ ...nodeForm, hall_id: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none">
                  {halls.filter((h) => h.floor_id === nodeForm.floor_id).map((h) => <option key={h.id} value={h.id}>{ln(h.name)}</option>)}
                </select>
                <select value={nodeForm.node_type} onChange={(e) => setNodeForm({ ...nodeForm, node_type: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none">
                  <option value="intersection">intersection</option>
                  <option value="booth_entry">booth_entry</option>
                  <option value="entrance">entrance</option>
                  <option value="facility_entry">facility_entry</option>
                </select>
                <div className="flex gap-2">
                  <button onClick={handleCreateNode} className="flex-1 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">{t('admin.save')}</button>
                  <button onClick={() => setShowNodeForm(false)} className="px-4 py-2 text-sm text-gray-500">{t('admin.cancel')}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edge Form */}
        {showEdgeForm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowEdgeForm(false)}>
            <div className="bg-white dark:bg-[#1e1e1e] rounded-xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Add Edge</h3>
              <div className="space-y-3">
                <input type="number" value={edgeForm.from_node_id} onChange={(e) => setEdgeForm({ ...edgeForm, from_node_id: Number(e.target.value) })} placeholder="From Node ID" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                <input type="number" value={edgeForm.to_node_id} onChange={(e) => setEdgeForm({ ...edgeForm, to_node_id: Number(e.target.value) })} placeholder="To Node ID" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                <input type="number" value={edgeForm.distance} onChange={(e) => setEdgeForm({ ...edgeForm, distance: Number(e.target.value) })} placeholder="Distance" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                <div className="flex gap-2">
                  <button onClick={handleCreateEdge} className="flex-1 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">{t('admin.save')}</button>
                  <button onClick={() => setShowEdgeForm(false)} className="px-4 py-2 text-sm text-gray-500">{t('admin.cancel')}</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
