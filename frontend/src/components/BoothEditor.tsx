import { useState, useEffect } from 'react';
import { Booth, Company, Category } from '@/types';

interface BoothEditorProps {
  booth?: Booth | null;
  companies: Company[];
  categories: Category[];
  onSave: (data: Partial<Booth>) => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function BoothEditor({
  booth,
  companies,
  categories,
  onSave,
  onCancel,
  loading,
}: BoothEditorProps) {
  const [form, setForm] = useState({
    booth_number: '',
    x: 0,
    y: 0,
    width: 100,
    height: 60,
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
        company_id: booth.company_id ?? undefined,
        category_id: booth.category_id ?? undefined,
        color: booth.color || '#94a3b8',
        is_active: booth.is_active,
      });
    }
  }, [booth]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      ...form,
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
              {c.name}
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
              {c.name}
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
