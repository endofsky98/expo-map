export interface Floor {
  id: number;
  name: string | Record<string, string>;
  order: number;
  created_at?: string;
}

export interface Hall {
  id: number;
  floor_id: number;
  name: string | Record<string, string>;
  order: number;
  area_x?: number;
  area_y?: number;
  area_width?: number;
  area_height?: number;
  created_at?: string;
  floor?: Floor;
}

export interface Category {
  id: number;
  name: string | Record<string, string>;
  color: string;
  created_at?: string;
}

export interface Company {
  id: number;
  name: string | Record<string, string>;
  description?: string | Record<string, string>;
  category_id?: number;
  category?: Category;
  metadata_json?: Record<string, unknown>;
  created_at?: string;
}

export interface Booth {
  id: number;
  booth_number: string;
  x: number;
  y: number;
  width: number;
  height: number;
  company_id?: number;
  company?: Company;
  category_id?: number;
  category?: Category;
  floor_id?: number;
  floor?: Floor;
  hall_id?: number;
  hall?: Hall;
  color?: string;
  is_active: boolean;
  corridor_node_id?: number;
  created_at?: string;
}

export interface ZoomLevel {
  level: number;
  path: string;
  width: number;
  height: number;
}

export interface MapImage {
  id: number;
  original_filename: string;
  low_path: string;
  medium_path: string;
  high_path: string;
  zoom_levels?: ZoomLevel[] | string;
  zoom_step_pixels?: number;
  width: number;
  height: number;
  is_current: boolean;
  floor_id?: number;
  hall_id?: number;
  created_at?: string;
}

export interface Obstacle {
  id: number;
  floor_id: number;
  shape: 'rectangle' | 'circle';
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  created_at?: string;
}

export interface Facility {
  id: number;
  type: string;
  subtype?: string;
  x: number;
  y: number;
  floor_id?: number;
  hall_id?: number;
  connected_floors?: number[];
  name?: string | Record<string, string>;
  is_active: boolean;
  created_at?: string;
}

export interface CorridorNode {
  id: number;
  x: number;
  y: number;
  floor_id?: number;
  hall_id?: number;
  node_type: string;
  connected_node_id?: number;
  created_at?: string;
}

export interface CorridorEdge {
  id: number;
  from_node_id: number;
  to_node_id: number;
  distance: number;
  is_open: boolean;
  created_at?: string;
}

export interface RoutePoint {
  x: number;
  y: number;
  floor_id?: number;
  hall_id?: number;
}

export interface RouteResult {
  path: RoutePoint[];
  total_distance: number;
  floors_visited: number[];
  facilities_used: Facility[];
}

export interface Setting {
  id: number;
  key: string;
  value: string;
  description?: string;
}

declare global {
  interface Window {
    onBoothClick?: (boothId: number, boothData: Booth) => void;
    onRouteReady?: (route: RouteResult) => void;
    setCurrentPosition?: (x: number, y: number, floorId: number, hallId: number) => void;
  }
}
