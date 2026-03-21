import React, { useState, useEffect } from 'react';
import type { Amenity, AmenityType } from '../editorTypes';
import { AMENITY_LABELS } from '../editorTypes';

interface AmenityPanelProps {
  amenity: Amenity;
  onSave: (id: number, data: Partial<Amenity>) => void;
  onDelete: (id: number) => void;
}

const AMENITY_TYPE_OPTIONS: AmenityType[] = [
  'restroom', 'nursing_room', 'info_desk', 'first_aid',
  'locker', 'atm', 'cafe', 'charging', 'wifi',
  'smoking', 'emergency_exit',
];

export function AmenityPanel({ amenity, onSave, onDelete }: AmenityPanelProps) {
  const [type, setType] = useState<AmenityType>(amenity.type);
  const [name, setName] = useState(amenity.name ?? '');
  const [x, setX] = useState(amenity.x);
  const [y, setY] = useState(amenity.y);
  const [isActive, setIsActive] = useState(amenity.is_active);

  useEffect(() => {
    setType(amenity.type);
    setName(amenity.name ?? '');
    setX(amenity.x);
    setY(amenity.y);
    setIsActive(amenity.is_active);
  }, [amenity.id]);

  const handleSave = () => {
    onSave(amenity.id, { type, name, x, y, is_active: isActive });
  };

  return (
    <div className="flex flex-col gap-3 p-4 text-sm text-slate-200">
      <h3 className="font-semibold text-slate-100 text-base">Amenity</h3>

      {/* Type dropdown */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400 uppercase tracking-wide">Type</label>
        <select
          className="bg-slate-700 rounded px-2 py-1 text-slate-100 outline-none focus:ring-1 focus:ring-blue-500"
          value={type}
          onChange={e => setType(e.target.value as AmenityType)}
        >
          {AMENITY_TYPE_OPTIONS.map(t => (
            <option key={t} value={t}>
              {AMENITY_LABELS[t]} {t.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      {/* Name */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400 uppercase tracking-wide">Name</label>
        <input
          className="bg-slate-700 rounded px-2 py-1 text-slate-100 outline-none focus:ring-1 focus:ring-blue-500"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="(optional)"
        />
      </div>

      {/* Position */}
      <div className="flex gap-2">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-slate-400 uppercase tracking-wide">X</label>
          <input
            type="number"
            className="bg-slate-700 rounded px-2 py-1 text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 w-full"
            value={x}
            onChange={e => setX(Number(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-slate-400 uppercase tracking-wide">Y</label>
          <input
            type="number"
            className="bg-slate-700 rounded px-2 py-1 text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 w-full"
            value={y}
            onChange={e => setY(Number(e.target.value))}
          />
        </div>
      </div>

      {/* is_active toggle */}
      <div className="flex items-center justify-between">
        <label className="text-xs text-slate-400 uppercase tracking-wide">Active</label>
        <button
          onClick={() => setIsActive(v => !v)}
          className={`relative w-11 h-6 rounded-full transition-colors ${isActive ? 'bg-blue-500' : 'bg-slate-600'}`}
        >
          <span
            className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${isActive ? 'translate-x-5' : 'translate-x-0'}`}
          />
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-2">
        <button
          onClick={handleSave}
          className="flex-1 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
        >
          Save
        </button>
        <button
          onClick={() => onDelete(amenity.id)}
          className="flex-1 py-1.5 rounded bg-slate-600 hover:bg-slate-500 text-slate-200 font-medium transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
