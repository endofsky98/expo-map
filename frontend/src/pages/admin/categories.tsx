import { useState, useEffect } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Tag,
  X,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Category } from '@/types';
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '@/lib/api';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', color: '#6366f1' });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const data = await fetchCategories();
      setCategories(data);
    } catch (err) {
      console.error(err);
      setMessage('Failed to load categories');
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: '', color: '#6366f1' });
    setShowModal(true);
  }

  function openEdit(category: Category) {
    setEditing(category);
    setForm({ name: category.name, color: category.color });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      if (editing) {
        await updateCategory(editing.id, form);
        setMessage('Category updated');
      } else {
        await createCategory(form);
        setMessage('Category created');
      }
      setShowModal(false);
      await loadData();
    } catch (err) {
      setMessage('Failed to save category');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this category?')) return;
    try {
      await deleteCategory(id);
      setMessage('Category deleted');
      await loadData();
    } catch (err) {
      setMessage('Failed to delete category');
      console.error(err);
    }
  }

  const inputClass =
    'w-full px-4 py-3 rounded-lg border border-gray-200 bg-transparent outline-none transition focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 placeholder:text-gray-400 dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100 dark:focus:ring-indigo-400/30 dark:focus:border-indigo-400 text-sm';

  return (
    <AdminLayout title="Categories">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Category
          </button>
        </div>

        {message && (
          <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 px-4 py-3 rounded-lg text-sm">
            <span>{message}</span>
            <button onClick={() => setMessage('')}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Table */}
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-500/40 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : categories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <Tag className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-600 dark:text-gray-300 font-medium">No categories yet</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Categories help organize booths and companies.
              </p>
              <button
                onClick={openCreate}
                className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors"
              >
                Add Category
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-[#1a1a1a]">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                      Color
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">
                      Hex
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-500/20">
                  {categories.map((category) => (
                    <tr
                      key={category.id}
                      className="hover:bg-gray-50 dark:hover:bg-[#222] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div
                          className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-500/40"
                          style={{ backgroundColor: category.color }}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                        {category.name}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs hidden md:table-cell">
                        {category.color}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => openEdit(category)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:text-indigo-400 dark:hover:bg-indigo-900/20 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(category.id)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setShowModal(false)}
            />
            <div className="relative bg-white dark:bg-[#1e1e1e] rounded-xl shadow-xl border border-gray-200 dark:border-gray-500/40 w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {editing ? 'Edit Category' : 'New Category'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={inputClass}
                    placeholder="Category name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Color *
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={form.color}
                      onChange={(e) => setForm({ ...form, color: e.target.value })}
                      className="h-10 w-14 rounded-lg border border-gray-200 dark:border-gray-500/40 cursor-pointer"
                    />
                    <input
                      type="text"
                      required
                      value={form.color}
                      onChange={(e) => setForm({ ...form, color: e.target.value })}
                      className={inputClass}
                      placeholder="#6366f1"
                    />
                  </div>
                  {/* Color preview */}
                  <div className="mt-2 flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full border border-gray-200 dark:border-gray-500/40"
                      style={{ backgroundColor: form.color }}
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400">Preview</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-5 py-2.5 border border-gray-200 bg-white text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-300 dark:hover:bg-[#333] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
