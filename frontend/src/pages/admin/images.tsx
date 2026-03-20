import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload,
  Trash2,
  Check,
  ImageIcon,
  X,
  Star,
  Settings2,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { MapImage } from '@/types';
import { useI18n } from '@/lib/i18n';
import { fetchImages, fetchFloors, uploadImage, setCurrentImage, deleteImage, reconfigureImage, updateImageFloor, fetchSetting, updateSetting } from '@/lib/api';
import { Floor } from '@/types';

export default function ImagesPage() {
  const { t } = useI18n();
  const [images, setImages] = useState<MapImage[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploadFloorId, setUploadFloorId] = useState<number | ''>('');
  const [uploadZoomStep, setUploadZoomStep] = useState(512);
  const [prefetchRange, setPrefetchRange] = useState(2);
  const [prefetchSaving, setPrefetchSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadImages();
    loadPrefetchRange();
  }, []);

  async function loadPrefetchRange() {
    try {
      const setting = await fetchSetting('prefetch_range');
      const val = parseInt(setting.value, 10);
      if (!isNaN(val) && val >= 1 && val <= 5) {
        setPrefetchRange(val);
      }
    } catch { /* use default */ }
  }

  async function handlePrefetchSave() {
    setPrefetchSaving(true);
    try {
      await updateSetting('prefetch_range', String(prefetchRange));
      setMessage('Prefetch range updated');
    } catch {
      setMessage('Failed to update prefetch range');
    } finally {
      setPrefetchSaving(false);
    }
  }

  async function loadImages() {
    setLoading(true);
    try {
      const [data, floorData] = await Promise.all([fetchImages(), fetchFloors()]);
      setImages(data);
      setFloors(floorData);
    } catch (err) {
      console.error(err);
      setMessage('Failed to load images');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setMessage('');
    try {
      await uploadImage(file, uploadFloorId || undefined, undefined, uploadZoomStep);
      setMessage('Image uploaded successfully');
      await loadImages();
    } catch (err) {
      setMessage('Upload failed');
      console.error(err);
    } finally {
      setUploading(false);
    }
  }

  async function handleReconfigure(id: number, currentStep: number) {
    const input = prompt(`${t('admin.zoomStep')} (current: ${currentStep})`, String(currentStep));
    if (!input) return;
    const val = Number(input);
    if (isNaN(val) || val < 100) { setMessage('Invalid zoom step'); return; }
    try {
      await reconfigureImage(id, val);
      setMessage('Zoom levels reconfigured');
      await loadImages();
    } catch (err) {
      setMessage('Reconfigure failed');
      console.error(err);
    }
  }

  async function handleSetCurrent(id: number) {
    try {
      await setCurrentImage(id);
      setMessage('Current image updated');
      await loadImages();
    } catch (err) {
      setMessage('Failed to set current image');
      console.error(err);
    }
  }

  async function handleUpdateFloor(id: number, floorId: number | null) {
    try {
      await updateImageFloor(id, floorId);
      setMessage('Floor updated');
      await loadImages();
    } catch (err) {
      setMessage('Failed to update floor');
      console.error(err);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this image?')) return;
    try {
      await deleteImage(id);
      setMessage('Image deleted');
      await loadImages();
    } catch (err) {
      setMessage('Failed to delete image');
      console.error(err);
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleUpload(file);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentImg = images.find((img) => img.is_current);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8008';

  function resolveUrl(path: string) {
    if (!path) return '';
    return path.startsWith('http') ? path : `${apiBase}${path}`;
  }

  return (
    <AdminLayout title={t('nav.images')}>
      <div className="max-w-5xl mx-auto space-y-6">
        {message && (
          <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 px-4 py-3 rounded-lg text-sm">
            <span>{message}</span>
            <button onClick={() => setMessage('')}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Upload settings */}
        <div className="flex items-center gap-3 flex-wrap">
          <select value={uploadFloorId} onChange={(e) => setUploadFloorId(e.target.value ? Number(e.target.value) : '')} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none">
            <option value="">{t('filter.all')} {t('admin.floor')}</option>
            {floors.map((f) => <option key={f.id} value={f.id}>{typeof f.name === 'string' ? f.name : (f.name as Record<string,string>).ko || (f.name as Record<string,string>).en}</option>)}
          </select>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500 dark:text-gray-400">{t('admin.zoomStep')}:</label>
            <input type="number" value={uploadZoomStep} onChange={(e) => setUploadZoomStep(Number(e.target.value))} className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 text-sm dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none" min={100} step={100} />
          </div>
        </div>

        {/* Tile prefetch range setting */}
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-500/40 p-6">
          <div className="flex items-center gap-2 mb-3">
            <Settings2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Tile Prefetch Range
            </h2>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Number of tiles to preload around the viewport in each direction (1-5). Higher values reduce loading gaps when panning but increase data usage.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={prefetchRange}
              onChange={(e) => setPrefetchRange(Number(e.target.value))}
              className="flex-1 accent-indigo-600"
            />
            <span className="w-8 text-center text-sm font-mono font-semibold text-gray-800 dark:text-gray-200">
              {prefetchRange}
            </span>
            <button
              onClick={handlePrefetchSave}
              disabled={prefetchSaving}
              className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors disabled:opacity-50"
            >
              {prefetchSaving ? '...' : 'Save'}
            </button>
          </div>
        </div>

        {/* Upload area */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
            dragActive
              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/10'
              : 'border-gray-200 dark:border-gray-500/40 hover:border-indigo-300 dark:hover:border-indigo-500/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileInput}
            className="hidden"
          />
          <Upload
            className={`h-10 w-10 mx-auto mb-3 ${
              dragActive ? 'text-indigo-500' : 'text-gray-400 dark:text-gray-500'
            }`}
          />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {uploading ? t('admin.loading') : t('admin.upload.drop')}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('admin.upload.formats')}
          </p>
        </div>

        {/* Current image preview */}
        {currentImg && (
          <div className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-500/40 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Star className="h-4 w-4 text-amber-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('admin.upload.current')}
              </h2>
            </div>
            <div className="rounded-lg overflow-hidden bg-gray-100 dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-500/40">
              <img
                src={resolveUrl(currentImg.low_path)}
                alt={currentImg.original_filename}
                className="w-full max-h-80 object-contain"
              />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              {currentImg.original_filename}
            </p>
          </div>
        )}

        {/* All images */}
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-500/40 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            {t('admin.upload.allImages')}
          </h2>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center py-12">
              <ImageIcon className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-600 dark:text-gray-300 font-medium">{t('admin.noData')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {images.map((img) => (
                <div
                  key={img.id}
                  className={`rounded-xl border overflow-hidden group transition-shadow hover:shadow-md ${
                    img.is_current
                      ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                      : 'border-gray-200 dark:border-gray-500/40'
                  }`}
                >
                  <div className="aspect-video bg-gray-100 dark:bg-[#2a2a2a] relative overflow-hidden">
                    <img
                      src={resolveUrl(img.low_path)}
                      alt={img.original_filename}
                      className="w-full h-full object-cover"
                    />
                    {img.is_current && (
                      <div className="absolute top-2 left-2 bg-indigo-600 text-white text-xs font-medium px-2 py-0.5 rounded-md">
                        {t('admin.upload.current')}
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                      {img.original_filename}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {img.width}x{img.height} &middot; zoom step: {img.zoom_step_pixels || 512}px
                    </p>
                    {/* 층 지정 */}
                    <div className="flex items-center gap-2 mt-2">
                      <select
                        value={img.floor_id ?? ''}
                        onChange={(e) => handleUpdateFloor(img.id, e.target.value ? Number(e.target.value) : null)}
                        className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-200 outline-none"
                      >
                        <option value="">{t('filter.all')} {t('admin.floor')}</option>
                        {floors.map((f) => (
                          <option key={f.id} value={f.id}>
                            {typeof f.name === 'string' ? f.name : (f.name as Record<string,string>).ko || (f.name as Record<string,string>).en}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {!img.is_current && (
                        <button
                          onClick={() => handleSetCurrent(img.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-md hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors"
                        >
                          <Check className="h-3 w-3" />
                          {t('admin.upload.setCurrent')}
                        </button>
                      )}
                      <button
                        onClick={() => handleReconfigure(img.id, img.zoom_step_pixels || 512)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-md hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 dark:border-gray-500/40 dark:text-gray-400 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-400 transition-colors"
                      >
                        {t('admin.reconfigure')}
                      </button>
                      <button
                        onClick={() => handleDelete(img.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-md hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:border-gray-500/40 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                        {t('admin.delete')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
