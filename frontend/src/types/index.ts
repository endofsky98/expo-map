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
  color?: string;
  is_active: boolean;
  created_at?: string;
}

export interface MapImage {
  id: number;
  original_filename: string;
  low_path: string;
  medium_path: string;
  high_path: string;
  width: number;
  height: number;
  is_current: boolean;
  created_at?: string;
}

declare global {
  interface Window {
    onBoothClick?: (boothId: number, boothData: Booth) => void;
  }
}
