import React, { useState, useEffect } from 'react';
import type { EditorBooth } from '../editorTypes';

interface BoothPanelProps {
  booth: EditorBooth;
  categories: { id: number; name: string }[];
  onSave: (id: number, data: Partial<EditorBooth>) => void;
  onDelete: (id: number) => void;
}

interface FormState {
  booth_number: string;
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  radius_x: number;
  radius_y: number;
  company_name: string;
  category_id: number | null;
  is_active: boolean;
}

function initForm(booth: EditorBooth): FormState {
  return {
    booth_number: booth.booth_number ?? '',
    x: booth.x ?? 0,
    y: booth.y ?? 0,
    width: booth.width ?? 0,
    height: booth.height ?? 0,
    radius: booth.radius ?? 0,
    radius_x: booth.radius_x ?? 0,
    radius_y: booth.radius_y ?? 0,
    company_name: booth.company_name ?? '',
    category_id: booth.category_id ?? null,
    is_active: booth.is_active ?? true,
  };
}

export function BoothPanel({ booth, categories, onSave, onDelete }: BoothPanelProps) {
  const [form, setForm] = useState<FormState>(() => initForm(booth));

  useEffect(() => {
    setForm(initForm(booth));
  }, [booth.id]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    const data: Partial<EditorBooth> = {
      booth_number: form.booth_number,
      x: form.x,
      y: form.y,
      company_name: form.company_name || undefined,
      category_id: form.category_id ?? undefined,
      is_active: form.is_active,
    };

    if (booth.shape === 'rectangle') {
      data.width = form.width;
      data.height = form.height;
    } else if (booth.shape === 'circle') {
      data.radius = form.radius;
    } else if (booth.shape === 'ellipse') {
      data.radius_x = form.radius_x;
      data.radius_y = form.radius_y;
    }

    onSave(booth.id, data);
  }

  function handleDelete() {
    if (window.confirm(`부스 "${booth.booth_number}"를 삭제하시겠습니까?`)) {
      onDelete(booth.id);
    }
  }

  const inputCls = 'w-full bg-gray-700 text-white rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500';
  const labelCls = 'block text-xs text-gray-400 mb-1';
  const fieldCls = 'mb-3';

  return (
    <div className="bg-gray-800 text-white p-4 rounded-lg w-64 flex flex-col gap-1 overflow-y-auto max-h-full">
      <h3 className="text-sm font-semibold text-gray-200 mb-3 border-b border-gray-700 pb-2">
        부스 편집
      </h3>

      {/* Booth Number */}
      <div className={fieldCls}>
        <label className={labelCls}>부스 번호</label>
        <input
          type="text"
          className={inputCls}
          value={form.booth_number}
          onChange={(e) => setField('booth_number', e.target.value)}
        />
      </div>

      {/* Shape (read-only) */}
      <div className={fieldCls}>
        <label className={labelCls}>도형 유형</label>
        <div className="text-sm text-gray-300 bg-gray-700 rounded px-2 py-1 capitalize">
          {booth.shape ?? 'rectangle'}
        </div>
      </div>

      {/* Position */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className={labelCls}>X</label>
          <input
            type="number"
            className={inputCls}
            value={form.x}
            onChange={(e) => setField('x', Number(e.target.value))}
          />
        </div>
        <div>
          <label className={labelCls}>Y</label>
          <input
            type="number"
            className={inputCls}
            value={form.y}
            onChange={(e) => setField('y', Number(e.target.value))}
          />
        </div>
      </div>

      {/* Rectangle: Width / Height */}
      {(!booth.shape || booth.shape === 'rectangle') && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className={labelCls}>너비</label>
            <input
              type="number"
              className={inputCls}
              value={form.width}
              onChange={(e) => setField('width', Number(e.target.value))}
            />
          </div>
          <div>
            <label className={labelCls}>높이</label>
            <input
              type="number"
              className={inputCls}
              value={form.height}
              onChange={(e) => setField('height', Number(e.target.value))}
            />
          </div>
        </div>
      )}

      {/* Circle: Radius */}
      {booth.shape === 'circle' && (
        <div className={fieldCls}>
          <label className={labelCls}>반지름</label>
          <input
            type="number"
            className={inputCls}
            value={form.radius}
            onChange={(e) => setField('radius', Number(e.target.value))}
          />
        </div>
      )}

      {/* Ellipse: RadiusX / RadiusY */}
      {booth.shape === 'ellipse' && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className={labelCls}>반지름 X</label>
            <input
              type="number"
              className={inputCls}
              value={form.radius_x}
              onChange={(e) => setField('radius_x', Number(e.target.value))}
            />
          </div>
          <div>
            <label className={labelCls}>반지름 Y</label>
            <input
              type="number"
              className={inputCls}
              value={form.radius_y}
              onChange={(e) => setField('radius_y', Number(e.target.value))}
            />
          </div>
        </div>
      )}

      {/* Company Name */}
      <div className={fieldCls}>
        <label className={labelCls}>회사명</label>
        <input
          type="text"
          className={inputCls}
          placeholder="회사명 입력"
          value={form.company_name}
          onChange={(e) => setField('company_name', e.target.value)}
        />
      </div>

      {/* Category */}
      <div className={fieldCls}>
        <label className={labelCls}>카테고리</label>
        <select
          className={inputCls}
          value={form.category_id ?? ''}
          onChange={(e) => setField('category_id', e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">카테고리 없음</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Active Toggle */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-gray-400">활성화</span>
        <button
          type="button"
          onClick={() => setField('is_active', !form.is_active)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
            form.is_active ? 'bg-indigo-600' : 'bg-gray-600'
          }`}
        >
          <span
            className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
              form.is_active ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-2 border-t border-gray-700">
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-1.5 rounded transition-colors"
        >
          저장
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="flex-1 bg-red-700 hover:bg-red-600 text-white text-sm font-medium py-1.5 rounded transition-colors"
        >
          삭제
        </button>
      </div>
    </div>
  );
}
