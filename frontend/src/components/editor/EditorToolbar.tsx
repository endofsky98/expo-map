/**
 * EditorToolbar.tsx — corridors 스타일 통일
 * PC: 좌측 아이콘 바 (40px)
 * 모바일: 상단 수평 스크롤
 */
import React, { useState } from 'react';
import type { EditorMode, PathNodeType, AmenityType } from './editorTypes';
import { AMENITY_LABELS } from './editorTypes';

interface ToolbarProps {
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  pathNodeType: PathNodeType;
  onPathNodeTypeChange: (t: PathNodeType) => void;
  amenityType: AmenityType;
  onAmenityTypeChange: (t: AmenityType) => void;
}

const BUTTONS: { mode: EditorMode; label: string; icon: string; group: string }[] = [
  { mode: 'select',           label: '선택',   icon: '🖱️', group: 'general' },
  { mode: 'delete',           label: '삭제',   icon: '🗑️', group: 'general' },
  { mode: 'hall_rect',        label: '홀□',    icon: '🏢', group: 'hall' },
  { mode: 'hall_polygon',     label: '홀⬠',   icon: '🏗️', group: 'hall' },
  { mode: 'booth_rect',       label: '부스□',  icon: '📦', group: 'booth' },
  { mode: 'booth_polygon',    label: '부스⬠', icon: '🔷', group: 'booth' },
  { mode: 'booth_circle',     label: '부스○',  icon: '⭕', group: 'booth' },
  { mode: 'booth_ellipse',    label: '부스⬮',  icon: '🥚', group: 'booth' },
  { mode: 'path_node',        label: '노드',   icon: '📍', group: 'path' },
  { mode: 'path_connect',     label: '연결',   icon: '🔗', group: 'path' },
  { mode: 'path_crossfloor',  label: '층간',   icon: '🔄', group: 'path' },
  { mode: 'obstacle_rect',    label: '장애□',  icon: '🚧', group: 'obstacle' },
  { mode: 'obstacle_polygon', label: '장애⬠', icon: '⬡',  group: 'obstacle' },
  { mode: 'obstacle_circle',  label: '장애○',  icon: '🔴', group: 'obstacle' },
  { mode: 'amenity',          label: '편의',   icon: '🏥', group: 'amenity' },
];

const NODE_TYPES: { value: PathNodeType; label: string }[] = [
  { value: 'waypoint', label: '통로' }, { value: 'entrance', label: '입구' },
  { value: 'exit', label: '출구' }, { value: 'stairs', label: '계단' },
  { value: 'escalator', label: '에스컬' }, { value: 'elevator', label: '엘리' },
];

const AMENITY_TYPES: { value: AmenityType; label: string }[] = Object.entries(AMENITY_LABELS).map(
  ([k, v]) => ({ value: k as AmenityType, label: v })
);

export default function EditorToolbar(props: ToolbarProps) {
  const { mode, onModeChange, pathNodeType, onPathNodeTypeChange, amenityType, onAmenityTypeChange } = props;
  const [expanded, setExpanded] = useState<string | null>(null);
  const groups = [...new Set(BUTTONS.map(b => b.group))];

  const showNodeType = mode === 'path_node' || mode === 'path_connect' || mode === 'path_crossfloor';
  const showAmenityType = mode === 'amenity';

  return (
    <>
      {/* ===== PC: corridors 스타일 좌측 아이콘 바 ===== */}
      <div className="hidden md:flex flex-col gap-1 p-1.5 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] w-10 shrink-0 overflow-y-auto">
        {BUTTONS.map(b => (
          <button key={b.mode} onClick={() => onModeChange(b.mode)}
            title={b.label}
            className={`w-7 h-7 flex items-center justify-center rounded text-sm transition-colors ${
              mode === b.mode
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
            }`}>
            {b.icon}
          </button>
        ))}
        {/* Sub-options */}
        {showNodeType && (
          <select value={pathNodeType} onChange={e => onPathNodeTypeChange(e.target.value as PathNodeType)}
            className="mt-1 text-[8px] bg-gray-100 dark:bg-gray-800 rounded px-0.5 py-0.5 border-none outline-none">
            {NODE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        )}
        {showAmenityType && (
          <select value={amenityType} onChange={e => onAmenityTypeChange(e.target.value as AmenityType)}
            className="mt-1 text-[8px] bg-gray-100 dark:bg-gray-800 rounded px-0.5 py-0.5 border-none outline-none">
            {AMENITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        )}
      </div>

      {/* ===== Mobile: 상단 수평 바 ===== */}
      <div className="md:hidden border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] shrink-0">
        <div className="flex items-center gap-0.5 px-1 py-1 overflow-x-auto">
          {BUTTONS.filter(b => b.group === 'general').map(b => (
            <button key={b.mode} onClick={() => { onModeChange(b.mode); setExpanded(null); }}
              className={`shrink-0 px-2 py-1 rounded text-sm ${
                mode === b.mode ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' : 'text-gray-500'
              }`}>{b.icon}</button>
          ))}
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 shrink-0" />
          {groups.filter(g => g !== 'general').map(g => {
            const btns = BUTTONS.filter(b => b.group === g);
            const active = btns.some(b => b.mode === mode);
            const primary = btns.find(b => b.mode === mode) || btns[0];
            return (
              <button key={g} onClick={() => {
                if (expanded === g) setExpanded(null);
                else { setExpanded(g); if (!active) onModeChange(btns[0].mode); }
              }}
                className={`shrink-0 px-2 py-1 rounded text-sm ${
                  active ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' : 'text-gray-500'
                } ${expanded === g ? 'ring-1 ring-indigo-400' : ''}`}>{primary.icon}</button>
            );
          })}
          {showNodeType && (
            <select value={pathNodeType} onChange={e => onPathNodeTypeChange(e.target.value as PathNodeType)}
              className="shrink-0 text-[10px] bg-gray-100 dark:bg-gray-800 rounded px-1 py-0.5 ml-1">
              {NODE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          )}
          {showAmenityType && (
            <select value={amenityType} onChange={e => onAmenityTypeChange(e.target.value as AmenityType)}
              className="shrink-0 text-[10px] bg-gray-100 dark:bg-gray-800 rounded px-1 py-0.5 ml-1">
              {AMENITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          )}
        </div>
        {expanded && (
          <div className="flex items-center gap-1 px-2 py-1 border-t border-gray-200 dark:border-gray-700 overflow-x-auto">
            {BUTTONS.filter(b => b.group === expanded).map(b => (
              <button key={b.mode} onClick={() => { onModeChange(b.mode); setExpanded(null); }}
                className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] whitespace-nowrap ${
                  mode === b.mode ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                }`}>{b.icon} {b.label}</button>
            ))}
            <button onClick={() => setExpanded(null)} className="ml-auto text-gray-400 text-xs px-1 shrink-0">✕</button>
          </div>
        )}
      </div>
    </>
  );
}
