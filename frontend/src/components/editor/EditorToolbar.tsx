/**
 * EditorToolbar.tsx — 에디터 좌측 모드 선택 툴바
 * 모드 버튼 + 하위 옵션 (pathNodeType, amenityType).
 */
import React from 'react';
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
  { mode: 'select',           label: '선택',       icon: '🖱️', group: 'general' },
  { mode: 'delete',           label: '삭제',       icon: '🗑️', group: 'general' },
  { mode: 'hall_rect',        label: '홀 사각형',   icon: '🏢', group: 'hall' },
  { mode: 'hall_polygon',     label: '홀 다각형',   icon: '🏗️', group: 'hall' },
  { mode: 'booth_rect',       label: '부스 사각형', icon: '📦', group: 'booth' },
  { mode: 'booth_polygon',    label: '부스 다각형', icon: '🔷', group: 'booth' },
  { mode: 'booth_circle',     label: '부스 원',     icon: '⭕', group: 'booth' },
  { mode: 'booth_ellipse',    label: '부스 타원',   icon: '🥚', group: 'booth' },
  { mode: 'path_node',        label: '노드 배치',   icon: '📍', group: 'path' },
  { mode: 'path_connect',     label: '노드 연결',   icon: '🔗', group: 'path' },
  { mode: 'path_crossfloor',  label: '층간 연결',   icon: '🔄', group: 'path' },
  { mode: 'obstacle_rect',    label: '장애물 사각', icon: '🚧', group: 'obstacle' },
  { mode: 'obstacle_polygon', label: '장애물 다각', icon: '⬡',  group: 'obstacle' },
  { mode: 'obstacle_circle',  label: '장애물 원',   icon: '🔴', group: 'obstacle' },
  { mode: 'amenity',          label: '편의시설',    icon: '🏥', group: 'amenity' },
];

const NODE_TYPES: { value: PathNodeType; label: string }[] = [
  { value: 'waypoint',   label: '통로' },
  { value: 'entrance',   label: '입구' },
  { value: 'exit',       label: '출구' },
  { value: 'stairs',     label: '계단' },
  { value: 'escalator',  label: '에스컬레이터' },
  { value: 'elevator',   label: '엘리베이터' },
];

const AMENITY_TYPES: { value: AmenityType; label: string }[] = [
  { value: 'restroom',       label: `${AMENITY_LABELS.restroom} 화장실` },
  { value: 'nursing_room',   label: `${AMENITY_LABELS.nursing_room} 수유실` },
  { value: 'info_desk',      label: `${AMENITY_LABELS.info_desk} 안내` },
  { value: 'first_aid',      label: `${AMENITY_LABELS.first_aid} 응급` },
  { value: 'locker',         label: `${AMENITY_LABELS.locker} 보관함` },
  { value: 'atm',            label: `${AMENITY_LABELS.atm} ATM` },
  { value: 'cafe',           label: `${AMENITY_LABELS.cafe} 카페` },
  { value: 'charging',       label: `${AMENITY_LABELS.charging} 충전` },
  { value: 'wifi',           label: `${AMENITY_LABELS.wifi} WiFi` },
  { value: 'smoking',        label: `${AMENITY_LABELS.smoking} 흡연` },
  { value: 'emergency_exit', label: `${AMENITY_LABELS.emergency_exit} 비상구` },
];

const GROUP_LABELS: Record<string, string> = {
  general: '일반',
  hall: '홀',
  booth: '부스',
  path: '통로',
  obstacle: '장애물',
  amenity: '편의시설',
};

export default function EditorToolbar(props: ToolbarProps) {
  const { mode, onModeChange, pathNodeType, onPathNodeTypeChange, amenityType, onAmenityTypeChange } = props;

  const groups = [...new Set(BUTTONS.map(b => b.group))];

  return (
    <div className="flex flex-col gap-1 p-2 bg-gray-900 border-r border-gray-700 overflow-y-auto"
         style={{ width: 160 }}>
      {groups.map(group => (
        <div key={group}>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider px-1 mt-2 mb-1">
            {GROUP_LABELS[group]}
          </div>
          {BUTTONS.filter(b => b.group === group).map(b => (
            <button
              key={b.mode}
              onClick={() => onModeChange(b.mode)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                mode === b.mode
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <span>{b.icon}</span>
              <span>{b.label}</span>
            </button>
          ))}
        </div>
      ))}

      {/* Path node type selector */}
      {(mode === 'path_node' || mode === 'path_connect' || mode === 'path_crossfloor') && (
        <div className="mt-3 px-1">
          <div className="text-[10px] text-gray-500 mb-1">노드 타입</div>
          <select
            value={pathNodeType}
            onChange={e => onPathNodeTypeChange(e.target.value as PathNodeType)}
            className="w-full bg-gray-800 text-white text-xs rounded px-2 py-1.5 border border-gray-600"
          >
            {NODE_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Amenity type selector */}
      {mode === 'amenity' && (
        <div className="mt-3 px-1">
          <div className="text-[10px] text-gray-500 mb-1">편의시설 타입</div>
          <select
            value={amenityType}
            onChange={e => onAmenityTypeChange(e.target.value as AmenityType)}
            className="w-full bg-gray-800 text-white text-xs rounded px-2 py-1.5 border border-gray-600"
          >
            {AMENITY_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
