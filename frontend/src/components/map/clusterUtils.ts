import { Booth, Hall } from '@/types';

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
export const CLUSTER_RADIUS = 50;        // px — 화면 기준 클러스터 반경
export const CLUSTER_MAX_ZOOM = 2.5;     // 이 줌 이상이면 항상 개별 표시
export const CLUSTER_ANIM_MS = 300;      // 애니메이션 시간 (ms)
export const CLUSTER_MIN_SIZE = 40;      // 클러스터 원 최소 크기 px
export const CLUSTER_MAX_SIZE = 80;      // 클러스터 원 최대 크기 px

/**
 * 화면 좌표 기준 greedy 클러스터링
 * O(n²) — 1000개 기준 ~1ms 이내
 * clusterRadius === 0 이면 모두 개별 마커로 반환
 */
export function clusterBooths(
  booths: Booth[],
  screenPosFn: (wx: number, wy: number) => { sx: number; sy: number },
  clusterRadius: number = CLUSTER_RADIUS,
): ClusterItem[] {
  if (booths.length === 0) return [];

  // 1. 모든 부스를 화면 좌표로 변환
  const positions: { booth: Booth; sx: number; sy: number }[] = booths.map((booth) => {
    const cx = booth.x + booth.width / 2;
    const cy = booth.y + booth.height / 2;
    const { sx, sy } = screenPosFn(cx, cy);
    return { booth, sx, sy };
  });

  const assigned = new Uint8Array(positions.length); // 0 = unassigned
  const clusters: ClusterItem[] = [];
  const r2 = clusterRadius * clusterRadius;

  for (let i = 0; i < positions.length; i++) {
    if (assigned[i]) continue;

    // 시드: positions[i]
    const seed = positions[i];
    const group: number[] = [i];
    assigned[i] = 1;

    // clusterRadius > 0 일 때만 그룹핑
    if (clusterRadius > 0) {
      for (let j = i + 1; j < positions.length; j++) {
        if (assigned[j]) continue;
        const dx = positions[j].sx - seed.sx;
        const dy = positions[j].sy - seed.sy;
        if (dx * dx + dy * dy <= r2) {
          group.push(j);
          assigned[j] = 1;
        }
      }
    }

    // 그룹 중심 계산 (화면 좌표 평균)
    let sumSx = 0, sumSy = 0;
    let sumWx = 0, sumWy = 0;
    for (const idx of group) {
      sumSx += positions[idx].sx;
      sumSy += positions[idx].sy;
      sumWx += positions[idx].booth.x + positions[idx].booth.width / 2;
      sumWy += positions[idx].booth.y + positions[idx].booth.height / 2;
    }
    const n = group.length;
    const cx = sumSx / n;
    const cy = sumSy / n;
    const wx = sumWx / n;
    const wy = sumWy / n;

    const boothIds = group.map((idx) => positions[idx].booth.id);

    // 클러스터 bounding box (world 좌표)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const idx of group) {
      const b = positions[idx].booth;
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.width > maxX) maxX = b.x + b.width;
      if (b.y + b.height > maxY) maxY = b.y + b.height;
    }

    if (n === 1) {
      // 개별 마커
      clusters.push({
        id: `booth-${positions[i].booth.id}`,
        isCluster: false,
        x: wx,
        y: wy,
        sx: cx,
        sy: cy,
        count: 1,
        boothIds,
        representBooth: positions[i].booth,
        bboxX: minX,
        bboxY: minY,
        bboxW: maxX - minX,
        bboxH: maxY - minY,
      });
    } else {
      // 클러스터 마커
      clusters.push({
        id: `cluster-${clusters.length}`,
        isCluster: true,
        x: wx,
        y: wy,
        sx: cx,
        sy: cy,
        count: n,
        boothIds,
        representBooth: undefined,
        bboxX: minX,
        bboxY: minY,
        bboxW: maxX - minX,
        bboxH: maxY - minY,
      });
    }
  }

  return clusters;
}

/**
 * 부스 개수에 따른 클러스터 원 크기 계산
 * count: 1 → MIN_SIZE, 10+ → MAX_SIZE
 */
export function clusterSize(count: number): number {
  const ratio = Math.min(1, (count - 2) / 18); // 2~20개 범위
  return CLUSTER_MIN_SIZE + ratio * (CLUSTER_MAX_SIZE - CLUSTER_MIN_SIZE);
}

/**
 * 홀 이름 문자열로 반환
 */
function hallName(hall: Hall): string {
  const n = hall.name;
  if (typeof n === 'string') return n;
  return n.ko || n.en || '';
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
 * 1순위: 홀 이름 (클러스터 내 부스가 속한 홀, type !== 'zone')
 * 2순위: 구역 이름 (type === 'zone')
 * 3순위: 부스 면적 가장 큰 업체 (회사 정보 있음)
 * 4순위: 회사 정보 있는 첫 번째 업체
 * 5순위: 첫 번째 부스
 */
/** 부스 중심이 홀/구역 영역 안에 있는지 체크 */
function boothInsideHall(b: Booth, h: Hall): boolean {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  if (h.area_x != null && h.area_y != null && h.area_width != null && h.area_height != null) {
    return cx >= h.area_x && cx <= h.area_x + h.area_width && cy >= h.area_y && cy <= h.area_y + h.area_height;
  }
  return false;
}

export function selectRepresentative(
  boothIds: number[],
  allBooths: Booth[],
  halls: Hall[] = [],
): { name: string; booth: Booth | null } {
  const booths = boothIds
    .map((id) => allBooths.find((b) => b.id === id))
    .filter((b): b is Booth => !!b);
  if (booths.length === 0) return { name: '', booth: null };

  // 1순위: 홀/구역 이름 — 클러스터가 2개 이상 다른 홀/구역에 걸쳐 있을 때만
  const allHalls = halls.filter((h) => h.type !== 'zone');
  const allZones = halls.filter((h) => h.type === 'zone');

  // 부스→홀/구역 매핑
  function findContainingHall(b: Booth): Hall | null {
    for (const h of allHalls) if (b.hall_id === h.id || boothInsideHall(b, h)) return h;
    for (const z of allZones) if (b.hall_id === z.id || boothInsideHall(b, z)) return z;
    return null;
  }
  const boothHallMap = new Map<number, Hall | null>();
  const hallIdSet = new Set<number>();
  for (const b of booths) {
    const h = findContainingHall(b);
    boothHallMap.set(b.id, h);
    if (h) hallIdSet.add(h.id);
  }

  // 2개 이상 서로 다른 홀/구역에 걸쳐 있을 때만 → 홀/구역 이름으로 대표
  // 단, 홀/구역 영역이 클러스터 bbox보다 작을 때만 (충분히 작아서 합쳐진 경우)
  if (hallIdSet.size >= 2) {
    // 부스가 가장 많이 속한 홀/구역 선택
    const countMap = new Map<number, number>();
    for (const [, h] of boothHallMap) {
      if (h) countMap.set(h.id, (countMap.get(h.id) || 0) + 1);
    }
    let bestHallId = 0, bestCount = 0;
    for (const [hid, cnt] of countMap) {
      if (cnt > bestCount) { bestHallId = hid; bestCount = cnt; }
    }
    const bestHall = halls.find(h => h.id === bestHallId);
    if (bestHall) {
      // 홀/구역 영역이 충분히 작은지 확인 — 클러스터에 합쳐질 만큼 작아야 함
      const hw = bestHall.area_width ?? 0;
      const hh = bestHall.area_height ?? 0;
      const hallDiag = Math.hypot(hw, hh);
      // 클러스터 bbox 대각선
      const clusterBboxes = booths.map(b => ({ x: b.x, y: b.y, x2: b.x + b.width, y2: b.y + b.height }));
      const cbx0 = Math.min(...clusterBboxes.map(c => c.x));
      const cby0 = Math.min(...clusterBboxes.map(c => c.y));
      const cbx1 = Math.max(...clusterBboxes.map(c => c.x2));
      const cby1 = Math.max(...clusterBboxes.map(c => c.y2));
      const clusterDiag = Math.hypot(cbx1 - cbx0, cby1 - cby0);

      // 홀 대각선이 클러스터 대각선의 80% 이하면 "충분히 작다"고 판단
      if (hallDiag > 0 && hallDiag <= clusterDiag * 0.8) {
        const repBooth = booths.find(b => boothHallMap.get(b.id)?.id === bestHallId) || booths[0];
        return { name: hallName(bestHall), booth: repBooth };
      }
    }
  }

  // 3순위: 부스 면적 가장 큰 업체 (회사명 있음)
  const sorted = [...booths].sort((a, b) => b.width * b.height - a.width * a.height);
  const biggest = sorted.find((b) => b.company?.name);
  if (biggest) return { name: getBoothDisplayName(biggest), booth: biggest };

  // 4순위: 회사/로고 있는 업체
  const withCompany = booths.find((b) => b.company_id || b.company);
  if (withCompany) return { name: getBoothDisplayName(withCompany), booth: withCompany };

  // 5순위: 첫 번째
  return { name: getBoothDisplayName(sorted[0]), booth: sorted[0] };
}
