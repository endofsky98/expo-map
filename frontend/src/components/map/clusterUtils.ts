import Supercluster from 'supercluster';
import { Booth, Hall } from '@/types';

/** 부스 중심 좌표 — 다각형이면 centroid, 아니면 x+w/2, y+h/2 */
export function getBoothCenter(b: Booth): { cx: number; cy: number } {
  if (b.shape === 'polygon' && b.points) {
    const pts: { x: number; y: number }[] = typeof b.points === 'string' ? JSON.parse(b.points) : b.points;
    if (pts.length > 0) {
      let sx = 0, sy = 0;
      for (const p of pts) { sx += p.x; sy += p.y; }
      return { cx: sx / pts.length, cy: sy / pts.length };
    }
  }
  return { cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
}

// ===== Cluster types =====
export interface ClusterItem {
  id: string;           // 'cluster-{index}' or 'booth-{boothId}'
  isCluster: boolean;
  x: number;            // world 좌표 (클러스터: 중심점)
  y: number;
  sx: number;           // screen 좌표
  sy: number;
  count: number;        // 클러스터: 부스 수, 개별: 1
  boothIds: number[];   // 포함된 부스 ID 목록
  representBooth?: Booth; // 개별 마커일 때 부스 데이터
  // 클러스터 bounding box (world 좌표) — 항상 존재
  bboxX: number;
  bboxY: number;
  bboxW: number;
  bboxH: number;
}

// ===== Cluster parameters =====
export const CLUSTER_MAX_ZOOM = 2.5;     // 이 줌 이상이면 항상 개별 표시
export const CLUSTER_ANIM_MS = 300;      // 애니메이션 시간 (ms)
export const CLUSTER_MIN_SIZE = 40;      // 클러스터 원 최소 크기 px
export const CLUSTER_MAX_SIZE = 80;      // 클러스터 원 최대 크기 px

// Supercluster 설정
const SC_MIN_ZOOM = 0;
const SC_MAX_ZOOM = 16;
const SC_RADIUS = 80;    // 클러스터 반경 (px 기준, 256 타일 기준)

// World 좌표를 가상 lng/lat으로 매핑 (supercluster는 geo 좌표 기대)
// 이미지 크기 기준으로 0~360, 0~180 범위에 매핑
let mapWidth = 10000;
let mapHeight = 10000;

export function setMapDimensions(w: number, h: number) {
  mapWidth = w;
  mapHeight = h;
}

function worldToLng(wx: number): number {
  return (wx / mapWidth) * 360 - 180;
}
function worldToLat(wy: number): number {
  // y 증가 → 아래 → lat 감소
  return 90 - (wy / mapHeight) * 180;
}
function lngToWorld(lng: number): number {
  return ((lng + 180) / 360) * mapWidth;
}
function latToWorld(lat: number): number {
  return ((90 - lat) / 180) * mapHeight;
}

// scale → zoom level 변환 (supercluster의 integer zoom 기반)
export function scaleToZoom(scale: number): number {
  // scale 0.05 → zoom 0, scale 4.0 → zoom 48
  // log2 기반 매핑, 3배 세밀도
  const z = Math.log2(scale * 20);
  return Math.max(SC_MIN_ZOOM, Math.min(SC_MAX_ZOOM, Math.round(z * 2)));
}

// Supercluster 인스턴스 관리
let scInstance: Supercluster<{ boothId: number }> | null = null;
let loadedBoothIds: string = '';

function getOrCreateIndex(booths: Booth[]): Supercluster<{ boothId: number }> {
  // 부스 목록이 바뀌면 재생성
  const key = booths.map(b => b.id).sort((a, b) => a - b).join(',');
  if (scInstance && loadedBoothIds === key) return scInstance;

  scInstance = new Supercluster<{ boothId: number }>({
    radius: SC_RADIUS,
    maxZoom: SC_MAX_ZOOM,
    minZoom: SC_MIN_ZOOM,
  });

  const points: Supercluster.PointFeature<{ boothId: number }>[] = booths.map(b => {
    const { cx, cy } = getBoothCenter(b);
    return {
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [worldToLng(cx), worldToLat(cy)],
      },
      properties: { boothId: b.id },
    };
  });

  scInstance.load(points);
  loadedBoothIds = key;
  return scInstance;
}

/**
 * Supercluster 기반 클러스터링
 * booths: 보이는 부스 목록
 * allBooths: 전체 부스 (supercluster 인덱싱용)
 * screenPosFn: world→screen 변환 함수
 * scale: 현재 줌 scale
 */
export function clusterBooths(
  booths: Booth[],
  screenPosFn: (wx: number, wy: number) => { sx: number; sy: number },
  _clusterRadius: number = 0,
  scale: number = 1,
  allBooths?: Booth[],
): ClusterItem[] {
  if (booths.length === 0) return [];

  // scale >= CLUSTER_MAX_ZOOM이면 개별 표시
  if (scale >= CLUSTER_MAX_ZOOM) {
    return booths.map(b => {
      const { cx, cy } = getBoothCenter(b);
      const { sx, sy } = screenPosFn(cx, cy);
      return {
        id: `booth-${b.id}`,
        isCluster: false,
        x: cx, y: cy, sx, sy,
        count: 1,
        boothIds: [b.id],
        representBooth: b,
        bboxX: b.x, bboxY: b.y,
        bboxW: b.width, bboxH: b.height,
      };
    });
  }

  const indexBooths = allBooths || booths;
  const index = getOrCreateIndex(indexBooths);
  const zoom = scaleToZoom(scale);

  // 보이는 영역의 bbox (world → lng/lat)
  let minWx = Infinity, minWy = Infinity, maxWx = -Infinity, maxWy = -Infinity;
  for (const b of booths) {
    const { cx, cy } = getBoothCenter(b);
    if (cx < minWx) minWx = cx;
    if (cy < minWy) minWy = cy;
    if (cx > maxWx) maxWx = cx;
    if (cy > maxWy) maxWy = cy;
  }
  // 여유 마진
  const marginW = (maxWx - minWx) * 0.2 || 200;
  const marginH = (maxWy - minWy) * 0.2 || 200;
  const bbox: [number, number, number, number] = [
    worldToLng(minWx - marginW),
    worldToLat(maxWy + marginH), // lat는 반대
    worldToLng(maxWx + marginW),
    worldToLat(minWy - marginH),
  ];

  const rawClusters = index.getClusters(bbox, zoom);
  const boothMap = new Map(indexBooths.map(b => [b.id, b]));
  const visibleIds = new Set(booths.map(b => b.id));

  const results: ClusterItem[] = [];

  for (const feature of rawClusters) {
    const [lng, lat] = feature.geometry.coordinates;
    const wx = lngToWorld(lng);
    const wy = latToWorld(lat);
    const { sx, sy } = screenPosFn(wx, wy);

    const props = feature.properties as any;
    if (props.cluster) {
      // 클러스터
      const clusterId = props.cluster_id as number;
      const count = props.point_count as number;
      // 클러스터에 포함된 부스 ID들
      const leaves = index.getLeaves(clusterId, Infinity);
      const boothIds = leaves
        .map(l => l.properties.boothId)
        .filter(id => visibleIds.has(id));

      if (boothIds.length === 0) continue;

      // bounding box 계산
      let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
      for (const id of boothIds) {
        const b = boothMap.get(id);
        if (!b) continue;
        if (b.shape === 'polygon' && b.points) {
          const pts: { x: number; y: number }[] = typeof b.points === 'string' ? JSON.parse(b.points) : b.points;
          for (const p of pts) {
            if (p.x < bMinX) bMinX = p.x; if (p.y < bMinY) bMinY = p.y;
            if (p.x > bMaxX) bMaxX = p.x; if (p.y > bMaxY) bMaxY = p.y;
          }
        } else {
          if (b.x < bMinX) bMinX = b.x; if (b.y < bMinY) bMinY = b.y;
          if (b.x + b.width > bMaxX) bMaxX = b.x + b.width; if (b.y + b.height > bMaxY) bMaxY = b.y + b.height;
        }
      }

      if (boothIds.length === 1) {
        // 클러스터지만 보이는 부스 1개 → 개별
        const b = boothMap.get(boothIds[0]);
        if (b) {
          const { cx, cy } = getBoothCenter(b);
          const sp = screenPosFn(cx, cy);
          results.push({
            id: `booth-${b.id}`,
            isCluster: false,
            x: cx, y: cy, sx: sp.sx, sy: sp.sy,
            count: 1,
            boothIds: [b.id],
            representBooth: b,
            bboxX: bMinX, bboxY: bMinY,
            bboxW: bMaxX - bMinX, bboxH: bMaxY - bMinY,
          });
        }
      } else {
        results.push({
          id: `cluster-sc-${clusterId}`,
          isCluster: true,
          x: wx, y: wy, sx, sy,
          count: boothIds.length,
          boothIds,
          representBooth: undefined,
          bboxX: bMinX, bboxY: bMinY,
          bboxW: bMaxX - bMinX, bboxH: bMaxY - bMinY,
        });
      }
    } else {
      // 개별 포인트
      const boothId = props.boothId as number;
      if (!visibleIds.has(boothId)) continue;
      const b = boothMap.get(boothId);
      if (!b) continue;
      const { cx, cy } = getBoothCenter(b);
      const sp = screenPosFn(cx, cy);

      let bMinX = b.x, bMinY = b.y, bMaxX = b.x + b.width, bMaxY = b.y + b.height;
      if (b.shape === 'polygon' && b.points) {
        const pts: { x: number; y: number }[] = typeof b.points === 'string' ? JSON.parse(b.points) : b.points;
        bMinX = Infinity; bMinY = Infinity; bMaxX = -Infinity; bMaxY = -Infinity;
        for (const p of pts) {
          if (p.x < bMinX) bMinX = p.x; if (p.y < bMinY) bMinY = p.y;
          if (p.x > bMaxX) bMaxX = p.x; if (p.y > bMaxY) bMaxY = p.y;
        }
      }

      results.push({
        id: `booth-${b.id}`,
        isCluster: false,
        x: cx, y: cy, sx: sp.sx, sy: sp.sy,
        count: 1,
        boothIds: [boothId],
        representBooth: b,
        bboxX: bMinX, bboxY: bMinY,
        bboxW: bMaxX - bMinX, bboxH: bMaxY - bMinY,
      });
    }
  }

  return results;
}

/**
 * 부스 개수에 따른 클러스터 원 크기 계산
 */
export function clusterSize(count: number): number {
  const ratio = Math.min(1, (count - 2) / 18);
  return CLUSTER_MIN_SIZE + ratio * (CLUSTER_MAX_SIZE - CLUSTER_MIN_SIZE);
}

/**
 * 부스 표시 이름 반환
 */
export function getBoothDisplayName(booth: Booth): string {
  if (booth.company?.name) {
    const name = booth.company.name;
    if (typeof name === 'string') return name;
    return name.ko || name.en || '';
  }
  return booth.booth_number || '';
}

/**
 * 클러스터 대표 업체 선정
 */
export function selectRepresentative(
  boothIds: number[],
  allBooths: Booth[],
  halls: Hall[] = [],
): { name: string; booth: Booth | null } {
  const booths = boothIds
    .map((id) => allBooths.find((b) => b.id === id))
    .filter((b): b is Booth => !!b);
  if (booths.length === 0) return { name: '', booth: null };

  const sorted = [...booths].sort((a, b) => b.width * b.height - a.width * a.height);
  const biggest = sorted.find((b) => b.company?.name);
  if (biggest) return { name: getBoothDisplayName(biggest), booth: biggest };

  const withCompany = booths.find((b) => b.company_id || b.company);
  if (withCompany) return { name: getBoothDisplayName(withCompany), booth: withCompany };

  return { name: getBoothDisplayName(sorted[0]), booth: sorted[0] };
}

/** Supercluster 인덱스 재생성 강제 */
export function invalidateClusterIndex() {
  loadedBoothIds = '';
  scInstance = null;
}
