import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { fetchFloors, fetchHalls, fetchFacilities, createFacility, deleteFacility } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Floor, Hall, Facility } from '@/types';

const FACILITY_TYPES = ['restroom', 'emergency_exit', 'stairs', 'elevator', 'escalator'];

export default function FacilitiesPage() {
  const { t, ln } = useI18n();
  const [floors, setFloors] = useState<Floor[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [filterFloor, setFilterFloor] = useState<number | ''>('');
  const [filterHall, setFilterHall] = useState<number | ''>('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'restroom', subtype: '', x: 0, y: 0, floor_id: 0, hall_id: 0, name_ko: '', name_en: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [f, h, fac] = await Promise.all([fetchFloors(), fetchHalls(), fetchFacilities()]);
    setFloors(f);
    setHalls(h);
    setFacilities(fac);
    setLoading(false);
  }

  const filtered = facilities.filter((f) => {
    if (filterFloor && f.floor_id !== filterFloor) return false;
    if (filterHall && f.hall_id !== filterHall) return false;
    return true;
  });

  async function handleCreate() {
    await createFacility({
      type: form.type,
      subtype: form.subtype || undefined,
      x: form.x,
      y: form.y,
      floor_id: form.floor_id || undefined,
      hall_id: form.hall_id || undefined,
      name: { ko: form.name_ko, en: form.name_en },
    });
    setShowForm(false);
    loadData();
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete?')) return;
    await deleteFacility(id);
    loadData();
  }

  return (
    <AdminLayout title={t('nav.facilities')}>
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <select value={filterFloor} onChange={(e) => { setFilterFloor(e.target.value ? Number(e.target.value) : ''); setFilterHall(''); }} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none">
            <option value="">{t('filter.all')} {t('admin.floor')}</option>
            {floors.map((f) => <option key={f.id} value={f.id}>{ln(f.name)}</option>)}
          </select>
          <select value={filterHall} onChange={(e) => setFilterHall(e.target.value ? Number(e.target.value) : '')} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none">
            <option value="">{t('filter.all')} {t('admin.hall')}</option>
            {halls.filter((h) => !filterFloor || h.floor_id === filterFloor).map((h) => <option key={h.id} value={h.id}>{ln(h.name)}</option>)}
          </select>
          <button onClick={() => { setForm({ type: 'restroom', subtype: '', x: 0, y: 0, floor_id: floors[0]?.id || 0, hall_id: halls[0]?.id || 0, name_ko: '', name_en: '' }); setShowForm(true); }} className="ml-auto flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">
            <Plus className="h-3.5 w-3.5" />{t('admin.addFacility')}
          </button>
        </div>

        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-500/40 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-[#1a1a1a]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">{t('admin.type')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">{t('admin.name')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">{t('admin.floor')} / {t('admin.hall')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">{t('admin.position')}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">{t('admin.loading')}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">{t('admin.noData')}</td></tr>
              ) : filtered.map((fac) => (
                <tr key={fac.id} className="hover:bg-gray-50 dark:hover:bg-[#222]">
                  <td className="px-4 py-3 text-gray-500">{fac.id}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{t(`facility.${fac.type}`)}{fac.subtype ? ` (${fac.subtype})` : ''}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{ln(fac.name)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {floors.find((f) => f.id === fac.floor_id) ? ln(floors.find((f) => f.id === fac.floor_id)!.name) : '-'} / {halls.find((h) => h.id === fac.hall_id) ? ln(halls.find((h) => h.id === fac.hall_id)!.name) : '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fac.x}, {fac.y}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(fac.id)} className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showForm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
            <div className="bg-white dark:bg-[#1e1e1e] rounded-xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">{t('admin.addFacility')}</h3>
              <div className="space-y-3">
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none">
                  {FACILITY_TYPES.map((ft) => <option key={ft} value={ft}>{t(`facility.${ft}`)}</option>)}
                </select>
                <input value={form.subtype} onChange={(e) => setForm({ ...form, subtype: e.target.value })} placeholder={t('admin.subtype')} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                <select value={form.floor_id} onChange={(e) => setForm({ ...form, floor_id: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none">
                  {floors.map((f) => <option key={f.id} value={f.id}>{ln(f.name)}</option>)}
                </select>
                <select value={form.hall_id} onChange={(e) => setForm({ ...form, hall_id: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none">
                  {halls.filter((h) => h.floor_id === form.floor_id).map((h) => <option key={h.id} value={h.id}>{ln(h.name)}</option>)}
                </select>
                <div className="flex gap-2">
                  <input type="number" value={form.x} onChange={(e) => setForm({ ...form, x: Number(e.target.value) })} placeholder="X" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                  <input type="number" value={form.y} onChange={(e) => setForm({ ...form, y: Number(e.target.value) })} placeholder="Y" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                </div>
                <input value={form.name_ko} onChange={(e) => setForm({ ...form, name_ko: e.target.value })} placeholder="한국어 이름" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                <input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} placeholder="English name" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 outline-none" />
                <div className="flex gap-2">
                  <button onClick={handleCreate} className="flex-1 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400">{t('admin.save')}</button>
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">{t('admin.cancel')}</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
