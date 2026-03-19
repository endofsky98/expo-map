import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { fetchFloors, fetchHalls, createFloor, updateFloor, deleteFloor, createHall, updateHall, deleteHall } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Floor, Hall } from '@/types';

export default function FloorsPage() {
  const { t, ln } = useI18n();
  const [floors, setFloors] = useState<Floor[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [loading, setLoading] = useState(true);
  const [editFloor, setEditFloor] = useState<Floor | null>(null);
  const [editHall, setEditHall] = useState<Hall | null>(null);
  const [showFloorForm, setShowFloorForm] = useState(false);
  const [showHallForm, setShowHallForm] = useState(false);
  const [formName, setFormName] = useState({ ko: '', en: '' });
  const [formOrder, setFormOrder] = useState(0);
  const [formFloorId, setFormFloorId] = useState<number>(0);
  const [formArea, setFormArea] = useState({ x: 0, y: 0, width: 0, height: 0 });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [f, h] = await Promise.all([fetchFloors(), fetchHalls()]);
      setFloors(f);
      setHalls(h);
    } finally { setLoading(false); }
  }

  function openFloorForm(floor?: Floor) {
    if (floor) {
      setEditFloor(floor);
      const name = typeof floor.name === 'string' ? JSON.parse(floor.name) : floor.name;
      setFormName({ ko: name?.ko || '', en: name?.en || '' });
      setFormOrder(floor.order);
    } else {
      setEditFloor(null);
      setFormName({ ko: '', en: '' });
      setFormOrder(floors.length + 1);
    }
    setShowFloorForm(true);
  }

  function openHallForm(hall?: Hall, floorId?: number) {
    if (hall) {
      setEditHall(hall);
      const name = typeof hall.name === 'string' ? JSON.parse(hall.name) : hall.name;
      setFormName({ ko: name?.ko || '', en: name?.en || '' });
      setFormOrder(hall.order);
      setFormFloorId(hall.floor_id);
      setFormArea({ x: hall.area_x || 0, y: hall.area_y || 0, width: hall.area_width || 0, height: hall.area_height || 0 });
    } else {
      setEditHall(null);
      setFormName({ ko: '', en: '' });
      setFormOrder(0);
      setFormFloorId(floorId || floors[0]?.id || 0);
      setFormArea({ x: 0, y: 0, width: 0, height: 0 });
    }
    setShowHallForm(true);
  }

  async function saveFloor() {
    if (editFloor) {
      await updateFloor(editFloor.id, { name: formName, order: formOrder });
    } else {
      await createFloor({ name: formName, order: formOrder });
    }
    setShowFloorForm(false);
    loadData();
  }

  async function saveHall() {
    const hallData: Record<string, unknown> = { name: formName, order: formOrder, floor_id: formFloorId };
    if (formArea.width > 0 && formArea.height > 0) {
      hallData.area_x = formArea.x;
      hallData.area_y = formArea.y;
      hallData.area_width = formArea.width;
      hallData.area_height = formArea.height;
    }
    if (editHall) {
      await updateHall(editHall.id, hallData);
    } else {
      await createHall(hallData);
    }
    setShowHallForm(false);
    loadData();
  }

  async function handleDeleteFloor(id: number) {
    if (!confirm('Delete this floor and all its halls?')) return;
    await deleteFloor(id);
    loadData();
  }

  async function handleDeleteHall(id: number) {
    if (!confirm('Delete this hall?')) return;
    await deleteHall(id);
    loadData();
  }

  return (
    <AdminLayout title={t('nav.floors')}>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Floors */}
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-500/40 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('admin.floor')}</h2>
            <button onClick={() => openFloorForm()} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors">
              <Plus className="h-3.5 w-3.5" />{t('admin.addFloor')}
            </button>
          </div>
          {loading ? <p className="text-sm text-gray-500">{t('admin.loading')}</p> : floors.length === 0 ? <p className="text-sm text-gray-500">{t('admin.noData')}</p> : (
            <div className="space-y-3">
              {floors.map((floor) => {
                const floorHalls = halls.filter((h) => h.floor_id === floor.id);
                return (
                  <div key={floor.id} className="border border-gray-100 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-medium text-gray-900 dark:text-gray-100">{ln(floor.name)}</span>
                        <span className="ml-2 text-xs text-gray-400">#{floor.order}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openFloorForm(floor)} className="p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"><Edit2 className="h-3.5 w-3.5" /></button>
                        <button onClick={() => handleDeleteFloor(floor.id)} className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                    <div className="ml-4 space-y-1">
                      {floorHalls.map((hall) => (
                        <div key={hall.id} className="flex items-center justify-between py-1">
                          <span className="text-sm text-gray-600 dark:text-gray-300">
                            {ln(hall.name)} <span className="text-xs text-gray-400">#{hall.order}</span>
                            {hall.area_width ? <span className="text-xs text-indigo-400 ml-2">area: ({hall.area_x},{hall.area_y}) {hall.area_width}x{hall.area_height}</span> : null}
                          </span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => openHallForm(hall)} className="p-1 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"><Edit2 className="h-3 w-3" /></button>
                            <button onClick={() => handleDeleteHall(hall.id)} className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"><Trash2 className="h-3 w-3" /></button>
                          </div>
                        </div>
                      ))}
                      <button onClick={() => openHallForm(undefined, floor.id)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-1">+ {t('admin.addHall')}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Floor Form Modal */}
        {showFloorForm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowFloorForm(false)}>
            <div className="bg-white dark:bg-[#1e1e1e] rounded-xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">{editFloor ? t('admin.edit') : t('admin.addFloor')}</h3>
              <div className="space-y-3">
                <input value={formName.ko} onChange={(e) => setFormName({ ...formName, ko: e.target.value })} placeholder="한국어 이름" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                <input value={formName.en} onChange={(e) => setFormName({ ...formName, en: e.target.value })} placeholder="English name" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                <input type="number" value={formOrder} onChange={(e) => setFormOrder(Number(e.target.value))} placeholder={t('admin.order')} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                <div className="flex gap-2">
                  <button onClick={saveFloor} className="flex-1 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">{t('admin.save')}</button>
                  <button onClick={() => setShowFloorForm(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">{t('admin.cancel')}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Hall Form Modal */}
        {showHallForm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowHallForm(false)}>
            <div className="bg-white dark:bg-[#1e1e1e] rounded-xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">{editHall ? t('admin.edit') : t('admin.addHall')}</h3>
              <div className="space-y-3">
                <select value={formFloorId} onChange={(e) => setFormFloorId(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none">
                  {floors.map((f) => <option key={f.id} value={f.id}>{ln(f.name)}</option>)}
                </select>
                <input value={formName.ko} onChange={(e) => setFormName({ ...formName, ko: e.target.value })} placeholder="한국어 이름" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                <input value={formName.en} onChange={(e) => setFormName({ ...formName, en: e.target.value })} placeholder="English name" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                <input type="number" value={formOrder} onChange={(e) => setFormOrder(Number(e.target.value))} placeholder={t('admin.order')} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 pt-1">{t('admin.hallArea')}</p>
                <div className="flex gap-2">
                  <input type="number" value={formArea.x} onChange={(e) => setFormArea({ ...formArea, x: Number(e.target.value) })} placeholder="X" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                  <input type="number" value={formArea.y} onChange={(e) => setFormArea({ ...formArea, y: Number(e.target.value) })} placeholder="Y" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                </div>
                <div className="flex gap-2">
                  <input type="number" value={formArea.width} onChange={(e) => setFormArea({ ...formArea, width: Number(e.target.value) })} placeholder="Width" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                  <input type="number" value={formArea.height} onChange={(e) => setFormArea({ ...formArea, height: Number(e.target.value) })} placeholder="Height" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                </div>
                <div className="flex gap-2">
                  <button onClick={saveHall} className="flex-1 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">{t('admin.save')}</button>
                  <button onClick={() => setShowHallForm(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">{t('admin.cancel')}</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
