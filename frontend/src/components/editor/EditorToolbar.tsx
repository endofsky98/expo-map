/**
 * EditorToolbar.tsx — 에디터 모드 선택 툴바
 * PC: 좌측 세로 사이드바 (160px)
 * 모바일: 하단 수평 스크롤 바
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

interface ModeButton {
  mode: EditorMode;
  label: string;
  icon: string;
  group: string;
}

const BUTTONS: ModeButton[] = [
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
  { value: 'waypoint',   label: '통로' },
  { value: 'entrance',   label: '입구' },
  { value: 'exit',       label: '출구' },
  { value: 'stairs',     label: '계단' },
  { value: 'escalator',  label: '에스컬' },
  { value: 'elevator',   label: '엘리' },
];

const AMENITY_TYPES: { value: AmenityType; label: string }[] = [
  { value: 'restroom',       label: `${AMENITY_LABELS.restroom}` },
  { value: 'nursing_room',   label: `${AMENITY_LABELS.nursing_room}` },
  { value: 'info_desk',      label: `${AMENITY_LABELS.info_desk}` },
  { value: 'first_aid',      label: `${AMENITY_LABELS.first_aid}` },
  { value: 'locker',         label: `${AMENITY_LABELS.locker}` },
  { value: 'atm',            label: `${AMENITY_LABELS.atm}` },
  { value: 'cafe',           label: `${AMENITY_LABELS.cafe}` },
  { value: 'charging',       label: `${AMENITY_LABELS.charging}` },
  { value: 'wifi',           label: `${AMENITY_LABELS.wifi}` },
  { value: 'smoking',        label: `${AMENITY_LABELS.smoking}` },
  { value: 'emergency_exit', label: `${AMENITY_LABELS.emergency_exit}` },
];

const GROUP_LABELS: Record<string, string> = {
  general: '일반', hall: '홀', booth: '부스',
  path: '통로', obstacle: '장애물', amenity: '편의시설',
};

// Sub-option selector (path node type / amenity type)
function SubOptions(props: ToolbarProps) {
  const { mode, pathNodeType, onPathNodeTypeChange, amenityType, onAmenityTypeChange } = props;
  if (mode === 'path_node' || mode === 'path_connect' || mode === 'path_crossfloor') {
    return (
      <select value={pathNodeType} onChange={e => onPathNodeTypeChange(e.target.value as PathNodeType)}
        className="bg-gray-800 text-white text-[10px] rounded px-1.5 py-1 border border-gray-600 shrink-0">
        {NODE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
    );
  }
  if (mode === 'amenity') {
    return (
      <select value={amenityType} onChange={e => onAmenityTypeChange(e.target.value as AmenityType)}
        className="bg-gray-800 text-white text-[10px] rounded px-1.5 py-1 border border-gray-600 shrink-0">
        {AMENITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
    );
  }
  return null;
}

export default function EditorToolbar(props: ToolbarProps) {
  const { mode, onModeChange } = props;
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const groups = [...new Set(BUTTONS.map(b => b.group))];

  return (
    <>
      {/* ===== Desktop: vertical sidebar ===== */}
      <div className="hidden md:flex flex-col gap-1 p-2 bg-gray-900 border-r border-gray-700 overflow-y-auto shrink-0"
           style={{ width: 140 }}>
        {groups.map(group => (
          <div key={group}>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider px-1 mt-2 mb-1">
              {GROUP_LABELS[group]}
            </div>
            {BUTTONS.filter(b => b.group === group).map(b => (
              <button key={b.mode} onClick={() => onModeChange(b.mode)}
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors ${
                  mode === b.mode ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-800'
                }`}>
                <span className="text-sm">{b.icon}</span>
                <span>{b.label}</span>
              </button>
            ))}
          </div>
        ))}
        <div className="mt-2 px-1">
          <SubOptions {...props} />
        </div>
      </div>

      {/* ===== Mobile: top horizontal bar ===== */}
      <div className="md:hidden bg-gray-900 border-b border-gray-700 shrink-0">
        {/* Main group buttons */}
        <div className="flex items-center gap-0.5 px-1.5 py-1 overflow-x-auto">
          {/* Quick access: select & delete */}
          {BUTTONS.filter(b => b.group === 'general').map(b => (
            <button key={b.mode} onClick={() => { onModeChange(b.mode); setExpandedGroup(null); }}
              className={`flex flex-col items-center px-2 py-0.5 rounded text-[9px] shrink-0 ${
                mode === b.mode ? 'bg-indigo-600 text-white' : 'text-gray-400'
              }`}>
              <span className="text-base">{b.icon}</span>
              <span>{b.label}</span>
            </button>
          ))}

          <div className="w-px h-6 bg-gray-700 shrink-0 mx-0.5" />

          {/* Group buttons */}
          {groups.filter(g => g !== 'general').map(g => {
            const groupBtns = BUTTONS.filter(b => b.group === g);
            const activeInGroup = groupBtns.some(b => b.mode === mode);
            const primaryBtn = groupBtns.find(b => b.mode === mode) || groupBtns[0];
            return (
              <button key={g} onClick={() => {
                if (expandedGroup === g) { setExpandedGroup(null); }
                else { setExpandedGroup(g); if (!activeInGroup) onModeChange(groupBtns[0].mode); }
              }}
                className={`flex flex-col items-center px-2 py-0.5 rounded text-[9px] shrink-0 ${
                  activeInGroup ? 'bg-indigo-600/80 text-white' : 'text-gray-400'
                } ${expandedGroup === g ? 'ring-1 ring-indigo-400' : ''}`}>
                <span className="text-base">{primaryBtn.icon}</span>
                <span>{GROUP_LABELS[g]}</span>
              </button>
            );
          })}
        </div>

        {/* Sub-options row */}
        {expandedGroup && (
          <div className="flex items-center gap-1 px-2 py-1 border-t border-gray-700 overflow-x-auto">
            {BUTTONS.filter(b => b.group === expandedGroup).map(b => (
              <button key={b.mode} onClick={() => { onModeChange(b.mode); setExpandedGroup(null); }}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] whitespace-nowrap shrink-0 ${
                  mode === b.mode ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300'
                }`}>
                <span>{b.icon}</span>
                <span>{b.label}</span>
              </button>
            ))}
            <SubOptions {...props} />
            <button onClick={() => setExpandedGroup(null)}
              className="ml-auto px-2 py-0.5 text-gray-400 text-xs shrink-0">✕</button>
          </div>
        )}
      </div>
    </>
  );
}
