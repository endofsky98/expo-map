import React, { useState, useEffect } from 'react';
import type { EditorBooth } from '../editorTypes';

interface Company { id: number; name: string | Record<string, string>; }

interface BoothPanelProps {
  booth: EditorBooth;
  categories: { id: number; name: string | Record<string, string> }[];
  companies: Company[];
  onSave: (id: number, data: Partial<EditorBooth>) => void;
  onDelete: (id: number) => void;
}

function ln(name: string | Record<string, string> | undefined | null): string {
  if (!name) return '';
  if (typeof name === 'string') return name;
  return name.ko || name.en || Object.values(name)[0] || '';
}

function initForm(booth: EditorBooth) {
  return {
    booth_number: booth.booth_number ?? '',
    x: booth.x ?? 0, y: booth.y ?? 0,
    width: booth.width ?? 0, height: booth.height ?? 0,
    radius: booth.radius ?? 0,
    radius_x: booth.radius_x ?? 0, radius_y: booth.radius_y ?? 0,
    company_id: booth.company_id ?? null as number | null,
    company_name: booth.company_name ?? '',
    category_id: booth.category_id ?? null as number | null,
    is_active: booth.is_active ?? true,
  };
}

export function BoothPanel({ booth, categories, companies, onSave, onDelete }: BoothPanelProps) {
  const [form, setForm] = useState(() => initForm(booth));
  const [companyMode, setCompanyMode] = useState<'select' | 'new'>(booth.company_id ? 'select' : 'new');

  useEffect(() => {
    setForm(initForm(booth));
    setCompanyMode(booth.company_id ? 'select' : 'new');
  }, [booth.id]);

  function set<K extends keyof ReturnType<typeof initForm>>(k: K, v: ReturnType<typeof initForm>[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  function handleSave() {
    const data: Partial<EditorBooth> = {
      booth_number: form.booth_number,
      x: form.x, y: form.y,
      category_id: form.category_id ?? undefined,
      is_active: form.is_active,
    };
    if (companyMode === 'select' && form.company_id) {
      data.company_id = form.company_id;
      data.company_name = undefined;
    } else {
      data.company_name = form.company_name || undefined;
      data.company_id = undefined;
    }
    if (booth.shape === 'rectangle') { data.width = form.width; data.height = form.height; }
    else if (booth.shape === 'circle') { data.radius = form.radius; }
    else if (booth.shape === 'ellipse') { data.radius_x = form.radius_x; data.radius_y = form.radius_y; }
    onSave(booth.id, data);
  }

  const input = 'w-full text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#2a2a2a] dark:text-gray-200 outline-none focus:ring-1 focus:ring-indigo-400';
  const label = 'block text-[10px] text-gray-500 dark:text-gray-400 mb-0.5';

  return (
    <div className="flex flex-col gap-2 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">부스 #{booth.id}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 capitalize">{booth.shape ?? 'rect'}</span>
      </div>

      {/* 부스 번호 */}
      <div><label className={label}>부스 번호</label>
        <input className={input} value={form.booth_number} onChange={e => set('booth_number', e.target.value)} /></div>

      {/* 위치 */}
      <div className="grid grid-cols-2 gap-1.5">
        <div><label className={label}>X</label><input type="number" className={input} value={form.x} onChange={e => set('x', Number(e.target.value))} /></div>
        <div><label className={label}>Y</label><input type="number" className={input} value={form.y} onChange={e => set('y', Number(e.target.value))} /></div>
      </div>

      {/* 크기 */}
      {(!booth.shape || booth.shape === 'rectangle') && (
        <div className="grid grid-cols-2 gap-1.5">
          <div><label className={label}>너비</label><input type="number" className={input} value={form.width} onChange={e => set('width', Number(e.target.value))} /></div>
          <div><label className={label}>높이</label><input type="number" className={input} value={form.height} onChange={e => set('height', Number(e.target.value))} /></div>
        </div>
      )}
      {booth.shape === 'circle' && (
        <div><label className={label}>반지름</label><input type="number" className={input} value={form.radius} onChange={e => set('radius', Number(e.target.value))} /></div>
      )}
      {booth.shape === 'ellipse' && (
        <div className="grid grid-cols-2 gap-1.5">
          <div><label className={label}>RX</label><input type="number" className={input} value={form.radius_x} onChange={e => set('radius_x', Number(e.target.value))} /></div>
          <div><label className={label}>RY</label><input type="number" className={input} value={form.radius_y} onChange={e => set('radius_y', Number(e.target.value))} /></div>
        </div>
      )}

      {/* 회사 — 선택 / 새 입력 전환 */}
      <div>
        <div className="flex items-center gap-1 mb-0.5">
          <label className={label}>회사</label>
          <button onClick={() => setCompanyMode(companyMode === 'select' ? 'new' : 'select')}
            className="text-[9px] text-indigo-500 hover:underline ml-auto">
            {companyMode === 'select' ? '새로 입력' : '기존 선택'}
          </button>
        </div>
        {companyMode === 'select' ? (
          <select className={input} value={form.company_id ?? ''} onChange={e => set('company_id', e.target.value ? Number(e.target.value) : null)}>
            <option value="">회사 없음</option>
            {companies.map(c => <option key={c.id} value={c.id}>{ln(c.name)}</option>)}
          </select>
        ) : (
          <input className={input} placeholder="새 회사명 입력" value={form.company_name} onChange={e => set('company_name', e.target.value)} />
        )}
      </div>

      {/* 카테고리 */}
      <div><label className={label}>카테고리</label>
        <select className={input} value={form.category_id ?? ''} onChange={e => set('category_id', e.target.value ? Number(e.target.value) : null)}>
          <option value="">없음</option>
          {categories.map(c => <option key={c.id} value={c.id}>{ln(c.name)}</option>)}
        </select>
      </div>

      {/* 활성화 */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-500">활성화</span>
        <button onClick={() => set('is_active', !form.is_active)}
          className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${form.is_active ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
          <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${form.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* 버튼 */}
      <div className="flex gap-1.5 pt-2 border-t border-gray-200 dark:border-gray-700">
        <button onClick={handleSave}
          className="flex-1 px-2 py-1 text-xs rounded bg-indigo-500 text-white hover:bg-indigo-600">저장</button>
        <button onClick={() => onDelete(booth.id)}
          className="px-2 py-1 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400">삭제</button>
      </div>
    </div>
  );
}
