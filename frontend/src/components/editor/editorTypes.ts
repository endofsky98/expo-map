import type * as PIXI from 'pixi.js';

// ===== 공통 =====
export type Point = { x: number; y: number };
export type ShapeType = 'rectangle' | 'polygon' | 'circle' | 'ellipse';

// ===== Booth (확장) =====
export interface EditorBooth {
  id: number;
  booth_number: string;
  shape: ShapeType;
  x: number; y: number;
  width: number; height: number;
  points?: Point[];       // polygon
  radius?: number;        // circle
  radius_x?: number;      // ellipse
  radius_y?: number;      // ellipse
  rotation?: number;
  company_id?: number;
  company_name?: string;  // 표시용
  display_name?: string | null;  // 표기이름 (줄바꿈 가능)
  category_id?: number;
  floor_id?: number;
  hall_id?: number;
  color?: string;
  is_active: boolean;
}

// ===== Path Node =====
export type PathNodeType = 'entrance' | 'exit' | 'waypoint' | 'stairs' | 'escalator' | 'elevator';

export interface PathNode {
  id: number;
  type: PathNodeType;
  x: number; y: number;
  floor_id?: number;
  hall_id?: number;
  linked_node_id?: number;
  name?: string;
  metadata?: Record<string, unknown>;
}

// ===== Path Edge =====
export interface PathEdge {
  id: number;
  from_node_id: number;
  to_node_id: number;
  distance: number;
  is_open: boolean;
}

// ===== Obstacle (확장) =====
export interface EditorObstacle {
  id: number;
  floor_id: number;
  shape: 'rectangle' | 'polygon' | 'circle';
  x: number; y: number;
  width?: number; height?: number;
  radius?: number;
  points?: Point[];
  name?: string;
}

// ===== Amenity =====
export type AmenityType =
  | 'restroom' | 'restroom_male' | 'restroom_female'
  | 'nursing_room' | 'info_desk' | 'first_aid'
  | 'locker' | 'atm' | 'cafe' | 'charging' | 'wifi'
  | 'smoking' | 'emergency_exit';

export interface Amenity {
  id: number;
  type: AmenityType;
  x: number; y: number;
  floor_id?: number;
  hall_id?: number;
  name?: string;
  is_active: boolean;
}

// ===== Hall (확장) =====
export interface EditorHall {
  id: number;
  floor_id: number;
  name: string | Record<string, string>;
  order: number;
  shape?: 'rectangle' | 'polygon';
  area_x?: number; area_y?: number;
  area_width?: number; area_height?: number;
  points?: Point[];
  display_name?: string;
}

// ===== Editor Mode =====
export type EditorMode =
  | 'pan'
  | 'select'
  | 'hall_rect' | 'hall_polygon'
  | 'zone_rect' | 'zone_polygon'
  | 'booth_rect' | 'booth_polygon' | 'booth_circle' | 'booth_ellipse'
  | 'path_node' | 'path_connect' | 'path_crossfloor'
  | 'obstacle_rect' | 'obstacle_polygon' | 'obstacle_circle'
  | 'amenity'
  | 'delete';

// ===== Selected Object =====
export type SelectedObject =
  | { kind: 'booth'; id: number }
  | { kind: 'path_node'; id: number }
  | { kind: 'path_edge'; id: number }
  | { kind: 'obstacle'; id: number }
  | { kind: 'amenity'; id: number }
  | { kind: 'hall'; id: number }
  | null;

// ===== Shape Complete Data =====
export type ShapeCompleteData =
  | { shape: 'rectangle'; x: number; y: number; width: number; height: number }
  | { shape: 'polygon'; points: Point[] }
  | { shape: 'circle'; x: number; y: number; radius: number }
  | { shape: 'ellipse'; x: number; y: number; radiusX: number; radiusY: number }
  | { shape: 'point'; x: number; y: number };

// ===== Draw Style =====
export interface DrawStyle {
  lineColor: number;
  lineWidth: number;
  lineAlpha?: number;
  fillColor: number;
  fillAlpha: number;
  selected?: boolean;
}

// ===== Layer Props =====
export interface LayerRenderProps {
  container: PIXI.Container;
  scale: number;
  selectedObject: SelectedObject;
}

// ===== Canvas Props =====
export interface EditorCanvasCallbacks {
  onObjectSelect: (obj: SelectedObject) => void;
  onShapeComplete: (mode: EditorMode, data: ShapeCompleteData) => void;
  onNodeConnect: (fromId: number, toId: number) => void;
  onObjectMove: (kind: string, id: number, x: number, y: number) => void;
}

// ===== Layer Color Schemes =====
export const LAYER_COLORS = {
  hall:     { line: 0x8b5cf6, fill: 0x8b5cf6, alpha: 0.08, selectedAlpha: 0.2 },
  booth:    { line: 0x6366f1, fill: 0x6366f1, alpha: 0.13, selectedAlpha: 0.3 },
  obstacle: { line: 0xef4444, fill: 0xef4444, alpha: 0.15, selectedAlpha: 0.35 },
  amenity:  { line: 0x3b82f6, fill: 0x3b82f6, alpha: 0.25, selectedAlpha: 0.5 },
} as const;

export const PATH_NODE_COLORS: Record<PathNodeType, number> = {
  entrance:   0x22c55e,
  exit:       0xf97316,
  waypoint:   0x6366f1,
  stairs:     0x8b5cf6,
  escalator:  0x06b6d4,
  elevator:   0xeab308,
};

export const AMENITY_COLORS: Record<AmenityType, number> = {
  restroom:       0x3b82f6,
  restroom_male:  0x3b82f6,
  restroom_female:0xec4899,
  nursing_room:   0xec4899,
  info_desk:      0x06b6d4,
  first_aid:      0xef4444,
  locker:         0x8b5cf6,
  atm:            0xf59e0b,
  cafe:           0x84cc16,
  charging:       0x22c55e,
  wifi:           0x6366f1,
  smoking:        0x6b7280,
  emergency_exit: 0xdc2626,
};

export const AMENITY_LABELS: Record<AmenityType, string> = {
  restroom:       '화장실',
  restroom_male:  '남자화장실',
  restroom_female:'여자화장실',
  nursing_room:   '수유실',
  info_desk:      '안내데스크',
  first_aid:      '응급처치',
  locker:         '보관함',
  atm:            'ATM',
  cafe:           '카페',
  charging:       '충전소',
  wifi:           'WiFi',
  smoking:        '흡연실',
  emergency_exit: '비상구',
};
