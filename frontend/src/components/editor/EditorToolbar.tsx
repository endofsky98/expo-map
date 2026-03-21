/**
 * EditorToolbar.tsx — 상단 수평 바 (PC+모바일 공통, 글자 기반)
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
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

const BUTTONS: { mode: EditorMode; label: string; group: string }[] = [
  { mode: 'select',           label: '선택',     group: 'general' },
  { mode: 'delete',           label: '삭제',     group: 'general' },
  { mode: 'hall_rect',        label: '홀□',      group: 'hall' },
  { mode: 'hall_polygon',     label: '홀⬠',     group: 'hall' },
  { mode: 'booth_rect',       label: '부스□',    group: 'booth' },
  { mode: 'booth_polygon',    label: '부스⬠',   group: 'booth' },
  { mode: 'booth_circle',     label: '부스○',    group: 'booth' },
  { mode: 'booth_ellipse',    label: '부스⬮',    group: 'booth' },
  { mode: 'path_node',        label: '노드',     group: 'path' },
  { mode: 'path_connect',     label: '연결',     group: 'path' },
  { mode: 'path_crossfloor',  label: '층간',     group: 'path' },
  { mode: 'obstacle_rect',    label: '장애□',    group: 'obstacle' },
  { mode: 'obstacle_polygon', label: '장애⬠',   group: 'obstacle' },
  { mode: 'obstacle_circle',  label: '장애○',    group: 'obstacle' },
  { mode: 'amenity',          label: '편의시설',  group: 'amenity' },
];

const NODE_TYPES: { value: PathNodeType; label: string }[] = [
  { value: 'waypoint', label: '통로' }, { value: 'entrance', label: '입구' },
  { value: 'exit', label: '출구' }, { value: 'stairs', label: '계단' },
  { value: 'escalator', label: '에스컬' }, { value: 'elevator', label: '엘리' },
];

const AMENITY_TYPES: { value: AmenityType; label: string }[] = Object.entries(AMENITY_LABELS).map(
  ([k, v]) => ({ value: k as AmenityType, label: v })
);

const GROUP_LABELS: Record<string, string> = {
  general: '일반', hall: '홀', booth: '부스', path: '통로', obstacle: '장애물', amenity: '편의',
};

export default function EditorToolbar(props: ToolbarProps) {
  const { mode, onModeChange, pathNodeType, onPathNodeTypeChange, amenityType, onAmenityTypeChange,
    onUndo, onRedo, canUndo = false, canRedo = false } = props;
  const [expanded, setExpanded] = useState<string | null>(null);
  const groups = [...new Set(BUTTONS.map(b => b.group))];

  const showNodeType = mode === 'path_node' || mode === 'path_connect' || mode === 'path_crossfloor';
  const showAmenityType = mode === 'amenity';

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] shrink-0">
      {/* Main row: group buttons */}
      <div className="flex items-center gap-0.5 px-2 py-1 overflow-x-auto">
        {/* Undo / Redo */}
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="실행취소 (Cmd+Z)"
          className={`shrink-0 px-2 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
            canUndo
              ? 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
              : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
          }`}
        >↩</button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="다시실행 (Cmd+Shift+Z)"
          className={`shrink-0 px-2 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
            canRedo
              ? 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
              : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
          }`}
        >↪</button>

        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 shrink-0 mx-0.5" />

        {/* 선택 / 삭제 — 항상 표시 */}
        {BUTTONS.filter(b => b.group === 'general').map(b => (
          <button key={b.mode} onClick={() => { onModeChange(b.mode); setExpanded(null); }}
            className={`shrink-0 px-2 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
              mode === b.mode
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
            }`}>{b.label}</button>
        ))}

        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 shrink-0 mx-0.5" />

        {/* 그룹 버튼 — 클릭하면 하위 모드 펼침 */}
        {groups.filter(g => g !== 'general').map(g => {
          const btns = BUTTONS.filter(b => b.group === g);
          const active = btns.some(b => b.mode === mode);
          return (
            <button key={g} onClick={() => {
              if (expanded === g) setExpanded(null);
              else { setExpanded(g); if (!active) onModeChange(btns[0].mode); }
            }}
              className={`shrink-0 px-2 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                  : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
              } ${expanded === g ? 'ring-1 ring-indigo-400' : ''}`}>{GROUP_LABELS[g]}</button>
          );
        })}

        {/* Sub-options: path node type / amenity type */}
        {showNodeType && (
          <select value={pathNodeType} onChange={e => onPathNodeTypeChange(e.target.value as PathNodeType)}
            className="shrink-0 text-[10px] bg-gray-100 dark:bg-gray-800 dark:text-gray-200 rounded px-1.5 py-0.5 ml-1 border-none outline-none">
            {NODE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        )}
        {showAmenityType && (
          <select value={amenityType} onChange={e => onAmenityTypeChange(e.target.value as AmenityType)}
            className="shrink-0 text-[10px] bg-gray-100 dark:bg-gray-800 dark:text-gray-200 rounded px-1.5 py-0.5 ml-1 border-none outline-none">
            {AMENITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        )}
      </div>

      {/* Expanded row: sub-modes */}
      {expanded && (
        <div className="flex items-center gap-1 px-2 py-1 border-t border-gray-200 dark:border-gray-700 overflow-x-auto">
          {BUTTONS.filter(b => b.group === expanded).map(b => (
            <button key={b.mode} onClick={() => { onModeChange(b.mode); setExpanded(null); }}
              className={`shrink-0 px-2.5 py-1 rounded text-xs whitespace-nowrap transition-colors ${
                mode === b.mode
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}>{b.label}</button>
          ))}
          <button onClick={() => setExpanded(null)}
            className="ml-auto text-gray-400 hover:text-gray-600 text-xs px-1 shrink-0">✕</button>
        </div>
      )}
    </div>
  );
}
