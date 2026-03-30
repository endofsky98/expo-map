/**
 * editorApi.ts — 에디터 전용 API 함수 (path_nodes, path_edges, amenities)
 * 기존 api.ts의 request() 패턴을 따름.
 */
import type { PathNode, PathEdge, Amenity } from '@/components/editor/editorTypes';
import { getToken } from '@/lib/auth';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body || res.statusText}`);
  }
  return res.json();
}

// ===== Path Nodes =====

export async function fetchPathNodes(floorId?: number): Promise<PathNode[]> {
  const qs = floorId ? `?floor_id=${floorId}` : '';
  return req<PathNode[]>(`/api/path-nodes${qs}`);
}

export async function createPathNode(data: Partial<PathNode>): Promise<PathNode> {
  return req<PathNode>('/api/path-nodes', { method: 'POST', body: JSON.stringify(data) });
}

export async function updatePathNode(id: number, data: Partial<PathNode>): Promise<PathNode> {
  return req<PathNode>(`/api/path-nodes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deletePathNode(id: number): Promise<void> {
  await req(`/api/path-nodes/${id}`, { method: 'DELETE' });
}

// ===== Path Edges =====

export async function fetchPathEdges(floorId?: number): Promise<PathEdge[]> {
  const qs = floorId ? `?floor_id=${floorId}` : '';
  return req<PathEdge[]>(`/api/path-edges${qs}`);
}

export async function createPathEdge(data: { from_node_id: number; to_node_id: number; distance?: number }): Promise<PathEdge> {
  return req<PathEdge>('/api/path-edges', { method: 'POST', body: JSON.stringify(data) });
}

export async function updatePathEdge(id: number, data: Partial<PathEdge>): Promise<PathEdge> {
  return req<PathEdge>(`/api/path-edges/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deletePathEdge(id: number): Promise<void> {
  await req(`/api/path-edges/${id}`, { method: 'DELETE' });
}

// ===== Amenities =====

export async function fetchAmenities(floorId?: number): Promise<Amenity[]> {
  const qs = floorId ? `?floor_id=${floorId}` : '';
  return req<Amenity[]>(`/api/amenities${qs}`);
}

export async function createAmenity(data: Partial<Amenity>): Promise<Amenity> {
  return req<Amenity>('/api/amenities', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateAmenity(id: number, data: Partial<Amenity>): Promise<Amenity> {
  return req<Amenity>(`/api/amenities/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteAmenity(id: number): Promise<void> {
  await req(`/api/amenities/${id}`, { method: 'DELETE' });
}
