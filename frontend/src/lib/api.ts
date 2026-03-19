import { Booth, Category, Company, MapImage } from '@/types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8008';
const REQUEST_TIMEOUT = 5000;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      throw new Error(`API Error ${res.status}: ${errorBody || res.statusText}`);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw err;
  }
}

// Booths
export async function fetchBooths(): Promise<Booth[]> {
  return request<Booth[]>('/api/booths');
}

export async function fetchBooth(id: number): Promise<Booth> {
  return request<Booth>(`/api/booths/${id}`);
}

export async function createBooth(data: Partial<Booth>): Promise<Booth> {
  return request<Booth>('/api/booths', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateBooth(id: number, data: Partial<Booth>): Promise<Booth> {
  return request<Booth>(`/api/booths/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteBooth(id: number): Promise<void> {
  await request<void>(`/api/booths/${id}`, { method: 'DELETE' });
}

export async function uploadBoothCSV(file: File): Promise<{ message: string; count: number }> {
  const formData = new FormData();
  formData.append('file', file);
  const url = `${BASE_URL}/api/booths/upload-csv`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      throw new Error(`API Error ${res.status}: ${errorBody || res.statusText}`);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw err;
  }
}

export function getCSVTemplateURL(): string {
  return `${BASE_URL}/api/booths/csv-template`;
}

export async function searchBooths(query: string): Promise<Booth[]> {
  return request<Booth[]>(`/api/booths/search?q=${encodeURIComponent(query)}`);
}

// Categories
export async function fetchCategories(): Promise<Category[]> {
  return request<Category[]>('/api/categories');
}

export async function createCategory(data: Partial<Category>): Promise<Category> {
  return request<Category>('/api/categories', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCategory(id: number, data: Partial<Category>): Promise<Category> {
  return request<Category>(`/api/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCategory(id: number): Promise<void> {
  await request<void>(`/api/categories/${id}`, { method: 'DELETE' });
}

// Companies
export async function fetchCompanies(): Promise<Company[]> {
  return request<Company[]>('/api/companies');
}

export async function createCompany(data: Partial<Company>): Promise<Company> {
  return request<Company>('/api/companies', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCompany(id: number, data: Partial<Company>): Promise<Company> {
  return request<Company>(`/api/companies/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCompany(id: number): Promise<void> {
  await request<void>(`/api/companies/${id}`, { method: 'DELETE' });
}

// Images
export async function fetchImages(): Promise<MapImage[]> {
  return request<MapImage[]>('/api/images');
}

export async function fetchCurrentImage(): Promise<MapImage | null> {
  try {
    return await request<MapImage>('/api/images/current');
  } catch {
    return null;
  }
}

export async function uploadImage(file: File): Promise<MapImage> {
  const formData = new FormData();
  formData.append('file', file);
  const url = `${BASE_URL}/api/images/upload`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      throw new Error(`API Error ${res.status}: ${errorBody || res.statusText}`);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw err;
  }
}

export async function setCurrentImage(id: number): Promise<MapImage> {
  return request<MapImage>(`/api/images/${id}/set-current`, {
    method: 'PUT',
  });
}

export async function deleteImage(id: number): Promise<void> {
  await request<void>(`/api/images/${id}`, { method: 'DELETE' });
}

// Seed
export async function seedData(): Promise<{ message: string }> {
  return request<{ message: string }>('/api/seed', { method: 'POST' });
}
