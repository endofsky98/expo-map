import { Booth } from '@/types';

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

    // 시드 반경 내 모든 미할당 부스 찾기
    for (let j = i + 1; j < positions.length; j++) {
      if (assigned[j]) continue;
      const dx = positions[j].sx - seed.sx;
      const dy = positions[j].sy - seed.sy;
      if (dx * dx + dy * dy <= r2) {
        group.push(j);
        assigned[j] = 1;
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
