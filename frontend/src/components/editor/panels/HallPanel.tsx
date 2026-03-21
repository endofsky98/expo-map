import React, { useState, useEffect } from 'react';
import type { EditorHall } from '../editorTypes';

interface HallPanelProps {
  hall: EditorHall;
  onSave: (id: number, data: Partial<EditorHall>) => void;
  onDelete: (id: number) => void;
}

function getHallName(name: EditorHall['name']): string {
  if (typeof name === 'string') return name;
  return name?.ko ?? name?.en ?? Object.values(name)[0] ?? '';
}

export function HallPanel({ hall, onSave, onDelete }: HallPanelProps) {
  const [name, setName] = useState(getHallName(hall.name));
  const [order, setOrder] = useState(hall.order);
  const [areaX, setAreaX] = useState(hall.area_x ?? 0);
  const [areaY, setAreaY] = useState(hall.area_y ?? 0);
  const [areaWidth, setAreaWidth] = useState(hall.area_width ?? 0);
  const [areaHeight, setAreaHeight] = useState(hall.area_height ?? 0);

  useEffect(() => {
    setName(getHallName(hall.name));
    setOrder(hall.order);
    setAreaX(hall.area_x ?? 0);
    setAreaY(hall.area_y ?? 0);
    setAreaWidth(hall.area_width ?? 0);
    setAreaHeight(hall.area_height ?? 0);
  }, [hall.id]);

  const handleSave = () => {
    const data: Partial<EditorHall> = {
      name,
      order,
      area_x: areaX,
      area_y: areaY,
      area_width: areaWidth,
      area_height: areaHeight,
    };
    onSave(hall.id, data);
  };

  return (
    <div className="flex flex-col gap-3 p-4 text-sm text-slate-200">
      <h3 className="font-semibold text-slate-100 text-base">Hall</h3>

      {/* Shape (display only) */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400 uppercase tracking-wide">Shape</label>
        <span className="px-2 py-1 rounded bg-slate-700 text-slate-300 capitalize">
          {hall.shape ?? 'rectangle'}
        </span>
      </div>

      {/* Name */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400 uppercase tracking-wide">Name</label>
        <input
          className="bg-slate-700 rounded px-2 py-1 text-slate-100 outline-none focus:ring-1 focus:ring-violet-500"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Hall name"
        />
      </div>

      {/* Order */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400 uppercase tracking-wide">Order</label>
        <input
          type="number"
          className="bg-slate-700 rounded px-2 py-1 text-slate-100 outline-none focus:ring-1 focus:ring-violet-500"
          value={order}
          onChange={e => setOrder(Number(e.target.value))}
        />
      </div>

      {/* Rectangle area (position + size) */}
      {(hall.shape == null || hall.shape === 'rectangle') && (
        <>
          <div className="flex gap-2">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-slate-400 uppercase tracking-wide">Area X</label>
              <input
                type="number"
                className="bg-slate-700 rounded px-2 py-1 text-slate-100 outline-none focus:ring-1 focus:ring-violet-500 w-full"
                value={areaX}
                onChange={e => setAreaX(Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-slate-400 uppercase tracking-wide">Area Y</label>
              <input
                type="number"
                className="bg-slate-700 rounded px-2 py-1 text-slate-100 outline-none focus:ring-1 focus:ring-violet-500 w-full"
                value={areaY}
                onChange={e => setAreaY(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-slate-400 uppercase tracking-wide">Width</label>
              <input
                type="number"
                className="bg-slate-700 rounded px-2 py-1 text-slate-100 outline-none focus:ring-1 focus:ring-violet-500 w-full"
                value={areaWidth}
                onChange={e => setAreaWidth(Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-slate-400 uppercase tracking-wide">Height</label>
              <input
                type="number"
                className="bg-slate-700 rounded px-2 py-1 text-slate-100 outline-none focus:ring-1 focus:ring-violet-500 w-full"
                value={areaHeight}
                onChange={e => setAreaHeight(Number(e.target.value))}
              />
            </div>
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-2">
        <button
          onClick={handleSave}
          className="flex-1 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
        >
          Save
        </button>
        <button
          onClick={() => onDelete(hall.id)}
          className="flex-1 py-1.5 rounded bg-slate-600 hover:bg-slate-500 text-slate-200 font-medium transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
