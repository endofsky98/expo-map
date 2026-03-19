import { useState, useEffect } from 'react';
import { Booth, Company, Category, Floor, Hall } from '@/types';
import { useI18n } from '@/lib/i18n';

interface BoothEditorProps {
  booth?: Booth | null;
  companies: Company[];
  categories: Category[];
  floors: Floor[];
  halls: Hall[];
  selectedFloorId?: number | null;
  selectedHallId?: number | null;
  onSave: (data: Partial<Booth>) => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function BoothEditor({
  booth,
  companies,
  categories,
  floors,
  halls,
  selectedFloorId,
  selectedHallId,
  onSave,
  onCancel,
  loading,
}: BoothEditorProps) {
  const { ln } = useI18n();
  const [form, setForm] = useState({
    booth_number: '',
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    floor_id: undefined as number | undefined,
    hall_id: undefined as number | undefined,
    company_id: undefined as number | undefined,
    category_id: undefined as number | undefined,
    color: '#94a3b8',
    is_active: true,
  });

  useEffect(() => {
    if (booth) {
      setForm({
        booth_number: booth.booth_number,
        x: booth.x,
        y: booth.y,
        width: booth.width,
        height: booth.height,
        floor_id: booth.floor_id ?? undefined,
        hall_id: booth.hall_id ?? undefined,
        company_id: booth.company_id ?? undefined,
        category_id: booth.category_id ?? undefined,
        color: booth.color || '#94a3b8',
        is_active: booth.is_active,
      });
    } else {
      setForm((prev) => ({
        ...prev,
        floor_id: selectedFloorId ?? undefined,
        hall_id: selectedHallId ?? undefined,
      }));
    }
  }, [booth, selectedFloorId, selectedHallId]);

  const filteredHalls = halls.filter((h) => h.floor_id === form.floor_id);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      ...form,
      floor_id: form.floor_id || undefined,
      hall_id: form.hall_id || undefined,
      company_id: form.company_id || undefined,
      category_id: form.category_id || undefined,
    });
  }

  const inputClass =
    'w-full px-4 py-3 rounded-lg border border-gray-200 bg-transparent outline-none transition focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 placeholder:text-gray-400 dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 dark:focus:ring-indigo-400/30 dark:focus:border-indigo-400 text-sm';

  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Booth Number *</label>
        <input
          type="text"
          required
          value={form.booth_number}
          onChange={(e) => setForm({ ...form, booth_number: e.target.value })}
          className={inputClass}
          placeholder="e.g. A101"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>X</label>
          <input
            type="number"
            value={form.x}
            onChange={(e) => setForm({ ...form, x: Number(e.target.value) })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Y</label>
          <input
            type="number"
            value={form.y}
            onChange={(e) => setForm({ ...form, y: Number(e.target.value) })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Width</label>
          <input
            type="number"
            value={form.width}
            onChange={(e) => setForm({ ...form, width: Number(e.target.value) })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Height</label>
          <input
            type="number"
            value={form.height}
            onChange={(e) => setForm({ ...form, height: Number(e.target.value) })}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Floor *</label>
          <select
            value={form.floor_id ?? ''}
            onChange={(e) => {
              const fid = e.target.value ? Number(e.target.value) : undefined;
              setForm({ ...form, floor_id: fid, hall_id: undefined });
            }}
            className={inputClass}
          >
            <option value="">-- Select --</option>
            {floors.map((f) => (
              <option key={f.id} value={f.id}>{ln(f.name)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Hall</label>
          <select
            value={form.hall_id ?? ''}
            onChange={(e) =>
              setForm({ ...form, hall_id: e.target.value ? Number(e.target.value) : undefined })
            }
            className={inputClass}
          >
            <option value="">-- None --</option>
            {filteredHalls.map((h) => (
              <option key={h.id} value={h.id}>{ln(h.name)}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Company</label>
        <select
          value={form.company_id ?? ''}
          onChange={(e) =>
            setForm({ ...form, company_id: e.target.value ? Number(e.target.value) : undefined })
          }
          className={inputClass}
        >
          <option value="">-- None --</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {ln(c.name)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Category</label>
        <select
          value={form.category_id ?? ''}
          onChange={(e) =>
            setForm({ ...form, category_id: e.target.value ? Number(e.target.value) : undefined })
          }
          className={inputClass}
        >
          <option value="">-- None --</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {ln(c.name)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Color</label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            className="h-10 w-14 rounded-lg border border-gray-200 dark:border-gray-500/40 cursor-pointer"
          />
          <input
            type="text"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            className={inputClass}
            placeholder="#94a3b8"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setForm({ ...form, is_active: !form.is_active })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            form.is_active ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              form.is_active ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
        <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors disabled:opacity-50"
        >
          {loading ? 'Saving...' : booth ? 'Update Booth' : 'Create Booth'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-2.5 border border-gray-200 bg-white text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-300 dark:hover:bg-[#333] transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
