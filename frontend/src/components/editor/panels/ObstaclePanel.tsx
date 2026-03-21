import React, { useState, useEffect } from 'react';
import type { EditorObstacle } from '../editorTypes';

interface ObstaclePanelProps {
  obstacle: EditorObstacle;
  onSave: (id: number, data: Partial<EditorObstacle>) => void;
  onDelete: (id: number) => void;
}

export function ObstaclePanel({ obstacle, onSave, onDelete }: ObstaclePanelProps) {
  const [name, setName] = useState(obstacle.name ?? '');
  const [x, setX] = useState(obstacle.x);
  const [y, setY] = useState(obstacle.y);
  const [width, setWidth] = useState(obstacle.width ?? 0);
  const [height, setHeight] = useState(obstacle.height ?? 0);
  const [radius, setRadius] = useState(obstacle.radius ?? 0);

  useEffect(() => {
    setName(obstacle.name ?? '');
    setX(obstacle.x);
    setY(obstacle.y);
    setWidth(obstacle.width ?? 0);
    setHeight(obstacle.height ?? 0);
    setRadius(obstacle.radius ?? 0);
  }, [obstacle.id]);

  const handleSave = () => {
    const data: Partial<EditorObstacle> = { name, x, y };
    if (obstacle.shape === 'rectangle') { data.width = width; data.height = height; }
    if (obstacle.shape === 'circle') { data.radius = radius; }
    onSave(obstacle.id, data);
  };

  return (
    <div className="flex flex-col gap-3 p-4 text-sm text-slate-200">
      <h3 className="font-semibold text-slate-100 text-base">Obstacle</h3>

      {/* Shape (display only) */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400 uppercase tracking-wide">Shape</label>
        <span className="px-2 py-1 rounded bg-slate-700 text-slate-300 capitalize">{obstacle.shape}</span>
      </div>

      {/* Name */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400 uppercase tracking-wide">Name</label>
        <input
          className="bg-slate-700 rounded px-2 py-1 text-slate-100 outline-none focus:ring-1 focus:ring-red-500"
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
            className="bg-slate-700 rounded px-2 py-1 text-slate-100 outline-none focus:ring-1 focus:ring-red-500 w-full"
            value={x}
            onChange={e => setX(Number(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-slate-400 uppercase tracking-wide">Y</label>
          <input
            type="number"
            className="bg-slate-700 rounded px-2 py-1 text-slate-100 outline-none focus:ring-1 focus:ring-red-500 w-full"
            value={y}
            onChange={e => setY(Number(e.target.value))}
          />
        </div>
      </div>

      {/* Rectangle fields */}
      {obstacle.shape === 'rectangle' && (
        <div className="flex gap-2">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-slate-400 uppercase tracking-wide">Width</label>
            <input
              type="number"
              className="bg-slate-700 rounded px-2 py-1 text-slate-100 outline-none focus:ring-1 focus:ring-red-500 w-full"
              value={width}
              onChange={e => setWidth(Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-slate-400 uppercase tracking-wide">Height</label>
            <input
              type="number"
              className="bg-slate-700 rounded px-2 py-1 text-slate-100 outline-none focus:ring-1 focus:ring-red-500 w-full"
              value={height}
              onChange={e => setHeight(Number(e.target.value))}
            />
          </div>
        </div>
      )}

      {/* Circle field */}
      {obstacle.shape === 'circle' && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400 uppercase tracking-wide">Radius</label>
          <input
            type="number"
            className="bg-slate-700 rounded px-2 py-1 text-slate-100 outline-none focus:ring-1 focus:ring-red-500"
            value={radius}
            onChange={e => setRadius(Number(e.target.value))}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-2">
        <button
          onClick={handleSave}
          className="flex-1 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
        >
          Save
        </button>
        <button
          onClick={() => onDelete(obstacle.id)}
          className="flex-1 py-1.5 rounded bg-slate-600 hover:bg-slate-500 text-slate-200 font-medium transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
