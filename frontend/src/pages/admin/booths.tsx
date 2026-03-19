import { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Upload,
  Download,
  Grid3X3,
  X,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import BoothEditor from '@/components/BoothEditor';
import { Booth, Company, Category } from '@/types';
import {
  fetchBooths,
  fetchCompanies,
  fetchCategories,
  createBooth,
  updateBooth,
  deleteBooth,
  uploadBoothCSV,
  getCSVTemplateURL,
} from '@/lib/api';

export default function BoothsPage() {
  const [booths, setBooths] = useState<Booth[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Booth | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [b, co, ca] = await Promise.all([
        fetchBooths(),
        fetchCompanies(),
        fetchCategories(),
      ]);
      setBooths(b);
      setCompanies(co);
      setCategories(ca);
    } catch (err) {
      console.error(err);
      setMessage('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(data: Partial<Booth>) {
    setSaving(true);
    setMessage('');
    try {
      if (editing) {
        await updateBooth(editing.id, data);
        setMessage('Booth updated successfully');
      } else {
        await createBooth(data);
        setMessage('Booth created successfully');
      }
      setEditing(null);
      setCreating(false);
      await loadData();
    } catch (err) {
      setMessage('Failed to save booth');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this booth?')) return;
    try {
      await deleteBooth(id);
      setMessage('Booth deleted');
      await loadData();
    } catch (err) {
      setMessage('Failed to delete booth');
      console.error(err);
    }
  }

  async function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage('');
    try {
      const result = await uploadBoothCSV(file);
      setMessage(result.message || `Uploaded ${result.count} booths`);
      await loadData();
    } catch (err) {
      setMessage('CSV upload failed');
      console.error(err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const showForm = creating || editing !== null;

  return (
    <AdminLayout title="Booths">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {!showForm && (
            <button
              onClick={() => {
                setCreating(true);
                setEditing(null);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Booth
            </button>
          )}
          <div className="inline-flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleCSVUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 bg-white text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-300 dark:hover:bg-[#333] transition-colors disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {uploading ? 'Uploading...' : 'Upload CSV'}
            </button>
            <a
              href={getCSVTemplateURL()}
              download
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 bg-white text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-300 dark:hover:bg-[#333] transition-colors"
            >
              <Download className="h-4 w-4" />
              CSV Template
            </a>
          </div>
        </div>

        {message && (
          <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 px-4 py-3 rounded-lg text-sm">
            <span>{message}</span>
            <button onClick={() => setMessage('')}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Editor */}
        {showForm && (
          <div className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-500/40 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {editing ? `Edit Booth ${editing.booth_number}` : 'New Booth'}
            </h2>
            <BoothEditor
              booth={editing}
              companies={companies}
              categories={categories}
              onSave={handleSave}
              onCancel={() => {
                setEditing(null);
                setCreating(false);
              }}
              loading={saving}
            />
          </div>
        )}

        {/* Table */}
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-500/40 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : booths.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <Grid3X3 className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-600 dark:text-gray-300 font-medium">No booths yet</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Create your first booth or upload a CSV file.
              </p>
              {!showForm && (
                <button
                  onClick={() => setCreating(true)}
                  className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors"
                >
                  Add Booth
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-[#1a1a1a]">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                      Booth #
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                      Company
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                      Position
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-500/20">
                  {booths.map((booth) => (
                    <tr
                      key={booth.id}
                      className="hover:bg-gray-50 dark:hover:bg-[#222] transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                        {booth.booth_number}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        {booth.company?.name || '-'}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {booth.category ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: booth.category.color }}
                            />
                            <span className="text-gray-600 dark:text-gray-300">
                              {booth.category.name}
                            </span>
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs hidden lg:table-cell font-mono">
                        ({booth.x}, {booth.y}) {booth.width}x{booth.height}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            booth.is_active
                              ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                              : 'bg-gray-100 text-gray-500 dark:bg-gray-700/20 dark:text-gray-400'
                          }`}
                        >
                          {booth.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditing(booth);
                              setCreating(false);
                            }}
                            className="p-1.5 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:text-indigo-400 dark:hover:bg-indigo-900/20 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(booth.id)}
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
      </div>
    </AdminLayout>
  );
}
