import { Booth, Category, Company, MapImage, Floor, Hall, Facility, CorridorNode, CorridorEdge, RouteResult, Obstacle } from '@/types';
import { getToken } from '@/lib/auth';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8008';
const REQUEST_TIMEOUT = 5000;

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  const isFormData = options?.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...authHeaders(),
    ...(options?.headers as Record<string, string> || {}),
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers,
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

// Auth
export async function login(username: string, password: string): Promise<{ access_token: string }> {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function fetchMe(): Promise<{ id: number; username: string }> {
  return request('/api/auth/me');
}

// Floors
export async function fetchFloors(): Promise<Floor[]> {
  return request<Floor[]>('/api/floors');
}

export async function createFloor(data: Partial<Floor>): Promise<Floor> {
  return request<Floor>('/api/floors', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateFloor(id: number, data: Partial<Floor>): Promise<Floor> {
  return request<Floor>(`/api/floors/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteFloor(id: number): Promise<void> {
  await request(`/api/floors/${id}`, { method: 'DELETE' });
}

// Halls
export async function fetchHalls(floorId?: number): Promise<Hall[]> {
  const params = floorId ? `?floor_id=${floorId}` : '';
  return request<Hall[]>(`/api/halls${params}`);
}

export async function createHall(data: Partial<Hall>): Promise<Hall> {
  return request<Hall>('/api/halls', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateHall(id: number, data: Partial<Hall>): Promise<Hall> {
  return request<Hall>(`/api/halls/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteHall(id: number): Promise<void> {
  await request(`/api/halls/${id}`, { method: 'DELETE' });
}

// Booths
export async function fetchBooths(floorId?: number, hallId?: number): Promise<Booth[]> {
  const params = new URLSearchParams();
  if (floorId) params.set('floor_id', String(floorId));
  if (hallId) params.set('hall_id', String(hallId));
  const qs = params.toString();
  return request<Booth[]>(`/api/booths${qs ? '?' + qs : ''}`);
}

export async function fetchBooth(id: number): Promise<Booth> {
  return request<Booth>(`/api/booths/${id}`);
}

export async function createBooth(data: Partial<Booth>): Promise<Booth> {
  return request<Booth>('/api/booths', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateBooth(id: number, data: Partial<Booth>): Promise<Booth> {
  return request<Booth>(`/api/booths/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteBooth(id: number): Promise<void> {
  await request<void>(`/api/booths/${id}`, { method: 'DELETE' });
}

export async function uploadBoothCSV(file: File): Promise<{ message: string; count: number }> {
  const formData = new FormData();
  formData.append('file', file);
  return request('/api/booths/upload-csv', { method: 'POST', body: formData });
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
  return request<Category>('/api/categories', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateCategory(id: number, data: Partial<Category>): Promise<Category> {
  return request<Category>(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteCategory(id: number): Promise<void> {
  await request<void>(`/api/categories/${id}`, { method: 'DELETE' });
}

// Companies
export async function fetchCompanies(): Promise<Company[]> {
  return request<Company[]>('/api/companies');
}

export async function createCompany(data: Partial<Company>): Promise<Company> {
  return request<Company>('/api/companies', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateCompany(id: number, data: Partial<Company>): Promise<Company> {
  return request<Company>(`/api/companies/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteCompany(id: number): Promise<void> {
  await request<void>(`/api/companies/${id}`, { method: 'DELETE' });
}

// Images
export async function fetchImages(floorId?: number, hallId?: number): Promise<MapImage[]> {
  const params = new URLSearchParams();
  if (floorId) params.set('floor_id', String(floorId));
  if (hallId) params.set('hall_id', String(hallId));
  const qs = params.toString();
  return request<MapImage[]>(`/api/images${qs ? '?' + qs : ''}`);
}

export async function fetchCurrentImage(floorId?: number, hallId?: number): Promise<MapImage | null> {
  try {
    const params = new URLSearchParams();
    if (floorId) params.set('floor_id', String(floorId));
    if (hallId) params.set('hall_id', String(hallId));
    const qs = params.toString();
    return await request<MapImage>(`/api/images/current${qs ? '?' + qs : ''}`);
  } catch {
    return null;
  }
}

export async function uploadImage(file: File, floorId?: number, hallId?: number, zoomStepPixels?: number): Promise<MapImage> {
  const formData = new FormData();
  formData.append('file', file);
  if (floorId) formData.append('floor_id', String(floorId));
  if (hallId) formData.append('hall_id', String(hallId));
  if (zoomStepPixels) formData.append('zoom_step_pixels', String(zoomStepPixels));
  return request('/api/images/upload', { method: 'POST', body: formData });
}

export async function reconfigureImage(id: number, zoomStepPixels: number): Promise<MapImage> {
  return request<MapImage>(`/api/images/${id}/reconfigure?zoom_step_pixels=${zoomStepPixels}`, { method: 'PUT' });
}

export async function setCurrentImage(id: number): Promise<MapImage> {
  return request<MapImage>(`/api/images/${id}/set-current`, { method: 'PUT' });
}

export async function updateImageFloor(id: number, floorId: number | null): Promise<MapImage> {
  const params = floorId != null ? `?floor_id=${floorId}` : '';
  return request<MapImage>(`/api/images/${id}/update-floor${params}`, { method: 'PUT' });
}

export async function deleteImage(id: number): Promise<void> {
  await request<void>(`/api/images/${id}`, { method: 'DELETE' });
}

// Facilities
export async function fetchFacilities(floorId?: number, hallId?: number, type?: string): Promise<Facility[]> {
  const params = new URLSearchParams();
  if (floorId) params.set('floor_id', String(floorId));
  if (hallId) params.set('hall_id', String(hallId));
  if (type) params.set('type', type);
  const qs = params.toString();
  return request<Facility[]>(`/api/facilities${qs ? '?' + qs : ''}`);
}

export async function createFacility(data: Partial<Facility>): Promise<Facility> {
  return request<Facility>('/api/facilities', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateFacility(id: number, data: Partial<Facility>): Promise<Facility> {
  return request<Facility>(`/api/facilities/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteFacility(id: number): Promise<void> {
  await request(`/api/facilities/${id}`, { method: 'DELETE' });
}

// Corridor Nodes & Edges
export async function fetchCorridorNodes(floorId?: number, hallId?: number): Promise<CorridorNode[]> {
  const params = new URLSearchParams();
  if (floorId) params.set('floor_id', String(floorId));
  if (hallId) params.set('hall_id', String(hallId));
  const qs = params.toString();
  return request<CorridorNode[]>(`/api/corridor-nodes${qs ? '?' + qs : ''}`);
}

export async function createCorridorNode(data: Partial<CorridorNode>): Promise<CorridorNode> {
  return request<CorridorNode>('/api/corridor-nodes', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateCorridorNode(id: number, data: Partial<CorridorNode>): Promise<CorridorNode> {
  return request<CorridorNode>(`/api/corridor-nodes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteCorridorNode(id: number): Promise<void> {
  await request(`/api/corridor-nodes/${id}`, { method: 'DELETE' });
}

export async function fetchCorridorEdges(): Promise<CorridorEdge[]> {
  return request<CorridorEdge[]>('/api/corridor-edges');
}

export async function createCorridorEdge(data: Partial<CorridorEdge>): Promise<CorridorEdge> {
  return request<CorridorEdge>('/api/corridor-edges', { method: 'POST', body: JSON.stringify(data) });
}

export async function deleteCorridorEdge(id: number): Promise<void> {
  await request(`/api/corridor-edges/${id}`, { method: 'DELETE' });
}

// Obstacles
export async function fetchObstacles(floorId?: number): Promise<Obstacle[]> {
  const params = floorId ? `?floor_id=${floorId}` : '';
  return request<Obstacle[]>(`/api/obstacles${params}`);
}

export async function createObstacle(data: Partial<Obstacle>): Promise<Obstacle> {
  return request<Obstacle>('/api/obstacles', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateObstacle(id: number, data: Partial<Obstacle>): Promise<Obstacle> {
  return request<Obstacle>(`/api/obstacles/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteObstacle(id: number): Promise<void> {
  await request(`/api/obstacles/${id}`, { method: 'DELETE' });
}

// Route
export async function fetchRoute(fromBoothId: number, toBoothId: number): Promise<RouteResult> {
  return request<RouteResult>(`/api/route?from_booth_id=${fromBoothId}&to_booth_id=${toBoothId}`);
}

// Seed
export async function seedData(): Promise<{ message: string }> {
  return request<{ message: string }>('/api/seed', { method: 'POST' });
}
