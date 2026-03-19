export interface Category {
  id: number;
  name: string;
  color: string;
  created_at?: string;
  updated_at?: string;
}

export interface Company {
  id: number;
  name: string;
  description?: string;
  category_id?: number;
  category?: Category;
  created_at?: string;
  updated_at?: string;
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
  updated_at?: string;
}

export interface MapImage {
  id: number;
  filename: string;
  original_filename: string;
  url: string;
  thumbnail_url?: string;
  low_res_url?: string;
  medium_res_url?: string;
  high_res_url?: string;
  is_current: boolean;
  width?: number;
  height?: number;
  created_at?: string;
  updated_at?: string;
}

declare global {
  interface Window {
    onBoothClick?: (boothId: number, boothData: Booth) => void;
  }
}
