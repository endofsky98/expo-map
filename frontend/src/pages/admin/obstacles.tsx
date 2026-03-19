import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { fetchFloors, fetchObstacles, createObstacle, updateObstacle, deleteObstacle } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Floor, Obstacle } from '@/types';

export default function ObstaclesPage() {
  const { t, ln } = useI18n();
  const [floors, setFloors] = useState<Floor[]>([]);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [filterFloor, setFilterFloor] = useState<number | ''>('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ floor_id: 0, shape: 'rectangle', x: 0, y: 0, width: 40, height: 40, radius: 15 });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [f, o] = await Promise.all([fetchFloors(), fetchObstacles()]);
    setFloors(f);
    setObstacles(o);
    setLoading(false);
  }

  const filtered = obstacles.filter((o) => !filterFloor || o.floor_id === filterFloor);

  function openForm(obs?: Obstacle) {
    if (obs) {
      setEditId(obs.id);
      setForm({ floor_id: obs.floor_id, shape: obs.shape, x: obs.x, y: obs.y, width: obs.width || 40, height: obs.height || 40, radius: obs.radius || 15 });
    } else {
      setEditId(null);
      setForm({ floor_id: floors[0]?.id || 0, shape: 'rectangle', x: 0, y: 0, width: 40, height: 40, radius: 15 });
    }
    setShowForm(true);
  }

  async function handleSave() {
    const data: Partial<Obstacle> = {
      floor_id: form.floor_id,
      shape: form.shape as 'rectangle' | 'circle',
      x: form.x,
      y: form.y,
    };
    if (form.shape === 'rectangle') {
      data.width = form.width;
      data.height = form.height;
      data.radius = undefined;
    } else {
      data.radius = form.radius;
      data.width = undefined;
      data.height = undefined;
    }
    if (editId) {
      await updateObstacle(editId, data);
    } else {
      await createObstacle(data);
    }
    setShowForm(false);
    loadData();
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this obstacle?')) return;
    await deleteObstacle(id);
    loadData();
  }

  return (
    <AdminLayout title={t('nav.obstacles')}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <select value={filterFloor} onChange={(e) => setFilterFloor(e.target.value ? Number(e.target.value) : '')} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none">
            <option value="">{t('filter.all')} {t('admin.floor')}</option>
            {floors.map((f) => <option key={f.id} value={f.id}>{ln(f.name)}</option>)}
          </select>
          <button onClick={() => openForm()} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">
            <Plus className="h-3.5 w-3.5" />{t('admin.addObstacle')}
          </button>
        </div>

        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-500/40 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('admin.obstacle')} ({filtered.length})</h2>
          {loading ? <p className="text-sm text-gray-500">{t('admin.loading')}</p> : filtered.length === 0 ? <p className="text-sm text-gray-500">{t('admin.noData')}</p> : (
            <div className="space-y-1">
              {filtered.map((obs) => (
                <div key={obs.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-[#222]">
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-medium">#{obs.id}</span>
                    <span className="ml-2 text-gray-500">{obs.shape}</span>
                    <span className="ml-2">({obs.x}, {obs.y})</span>
                    {obs.shape === 'rectangle' && <span className="ml-2 text-xs text-gray-400">{obs.width}x{obs.height}</span>}
                    {obs.shape === 'circle' && <span className="ml-2 text-xs text-gray-400">r={obs.radius}</span>}
                    <span className="ml-2 text-xs text-gray-400">{t('admin.floor')} #{obs.floor_id}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openForm(obs)} className="p-1.5 text-gray-400 hover:text-indigo-600"><Edit2 className="h-3.5 w-3.5" /></button>
                    <button onClick={() => handleDelete(obs.id)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showForm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
            <div className="bg-white dark:bg-[#1e1e1e] rounded-xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">{editId ? t('admin.edit') : t('admin.addObstacle')}</h3>
              <div className="space-y-3">
                <select value={form.floor_id} onChange={(e) => setForm({ ...form, floor_id: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none">
                  {floors.map((f) => <option key={f.id} value={f.id}>{ln(f.name)}</option>)}
                </select>
                <select value={form.shape} onChange={(e) => setForm({ ...form, shape: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none">
                  <option value="rectangle">Rectangle</option>
                  <option value="circle">Circle</option>
                </select>
                <div className="flex gap-2">
                  <input type="number" value={form.x} onChange={(e) => setForm({ ...form, x: Number(e.target.value) })} placeholder="X" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                  <input type="number" value={form.y} onChange={(e) => setForm({ ...form, y: Number(e.target.value) })} placeholder="Y" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                </div>
                {form.shape === 'rectangle' ? (
                  <div className="flex gap-2">
                    <input type="number" value={form.width} onChange={(e) => setForm({ ...form, width: Number(e.target.value) })} placeholder="Width" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                    <input type="number" value={form.height} onChange={(e) => setForm({ ...form, height: Number(e.target.value) })} placeholder="Height" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                  </div>
                ) : (
                  <input type="number" value={form.radius} onChange={(e) => setForm({ ...form, radius: Number(e.target.value) })} placeholder="Radius" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                )}
                <div className="flex gap-2">
                  <button onClick={handleSave} className="flex-1 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">{t('admin.save')}</button>
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-500">{t('admin.cancel')}</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
