/**
 * pathfinding.ts — A* 길찾기 (클라이언트 전용)
 * 그래프 빌드 (교차점 + 50px 근접 자동연결) + A* 알고리즘
 */

import { Booth, Obstacle } from '@/types';
import { getBoothCenter } from './clusterUtils';

// ===== 타입 =====
interface RawNode { id: number; x: number; y: number; floor_id: number; type: string; linked_node_id?: number | null }
interface RawEdge { id: number; from_node_id: number; to_node_id: number; is_open: boolean }
interface GraphNode { id: string; x: number; y: number; floorId?: number }
interface GraphEdge { from: string; to: string; cost: number }
interface Point { x: number; y: number }

const SNAP_RADIUS = 50;    // 근접 연결 반경 (px)
// 도착 후보 탐색 거리 제한 없음 — 가장 가까운 엣지로 스냅

// ===== 유틸 =====
function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 점 P에서 선분 AB 위의 최근접점 반환 */
function nearestOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { ...a };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** 두 선분의 교차점 (없으면 null) */
function segmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-10) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / cross;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / cross;
  if (t < 0.01 || t > 0.99 || u < 0.01 || u > 0.99) return null;
  return { x: a1.x + t * d1x, y: a1.y + t * d1y };
}

/** 선분 AB 위에 다른 부스/장애물이 가리는지 체크 */
function hasObstruction(a: Point, b: Point, booths: Booth[], obstacles: Obstacle[], excludeBoothId?: number): boolean {
  for (const booth of booths) {
    if (booth.id === excludeBoothId) continue;
    if (!booth.is_active) continue;
    // 간단한 AABB 교차 — 선분이 부스 사각형과 교차?
    if (segmentIntersectsRect(a, b, booth.x, booth.y, booth.width, booth.height)) return true;
  }
  for (const obs of obstacles) {
    if (segmentIntersectsRect(a, b, obs.x, obs.y, obs.width ?? 0, obs.height ?? 0)) return true;
  }
  return false;
}

function segmentIntersectsRect(p1: Point, p2: Point, rx: number, ry: number, rw: number, rh: number): boolean {
  if (rw <= 0 || rh <= 0) return false;
  const edges: [Point, Point][] = [
    [{ x: rx, y: ry }, { x: rx + rw, y: ry }],
    [{ x: rx + rw, y: ry }, { x: rx + rw, y: ry + rh }],
    [{ x: rx + rw, y: ry + rh }, { x: rx, y: ry + rh }],
    [{ x: rx, y: ry + rh }, { x: rx, y: ry }],
  ];
  for (const [ea, eb] of edges) {
    if (segmentIntersection(p1, p2, ea, eb)) return true;
  }
  return false;
}

// ===== 그래프 빌드 =====
export interface GraphSegment { from: Point; to: Point; fromId: string; toId: string }
export interface PathGraph {
  nodes: Map<string, GraphNode>;
  adj: Map<string, { to: string; cost: number }[]>;
  segments: GraphSegment[];
}

export function buildGraph(rawNodes: RawNode[], rawEdges: RawEdge[]): PathGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  // 1. 원본 노드 등록
  for (const n of rawNodes) {
    nodes.set(`n${n.id}`, { id: `n${n.id}`, x: n.x, y: n.y, floorId: n.floor_id });
  }

  // 원본 엣지를 선분으로 변환
  type Seg = { fromId: string; toId: string; from: Point; to: Point; edgeId: number };
  const segments: Seg[] = [];
  for (const e of rawEdges) {
    if (!e.is_open) continue;
    const fn = nodes.get(`n${e.from_node_id}`);
    const tn = nodes.get(`n${e.to_node_id}`);
    if (!fn || !tn) continue;
    segments.push({ fromId: fn.id, toId: tn.id, from: fn, to: tn, edgeId: e.id });
  }

  // 2. 엣지 교차점 가상 노드
  let vIdx = 0;
  const splitPoints = new Map<number, { t: number; nodeId: string }[]>(); // edgeId → split points
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const pt = segmentIntersection(segments[i].from, segments[i].to, segments[j].from, segments[j].to);
      if (pt) {
        const vId = `v${vIdx++}`;
        const vFloor = nodes.get(segments[i].fromId)?.floorId;
        nodes.set(vId, { id: vId, x: pt.x, y: pt.y, floorId: vFloor });
        // 각 엣지에 분할점 기록
        const ti = paramOnSegment(pt, segments[i].from, segments[i].to);
        const tj = paramOnSegment(pt, segments[j].from, segments[j].to);
        addSplit(splitPoints, segments[i].edgeId, ti, vId);
        addSplit(splitPoints, segments[j].edgeId, tj, vId);
      }
    }
  }

  // 3. 50px 근접: 노드→엣지 연결 (원본 노드만 대상 — 가상 노드 제외)
  const originalNodeIds = [...nodes.keys()];
  for (const nId of originalNodeIds) {
    const node = nodes.get(nId)!;
    for (const seg of segments) {
      if (seg.fromId === nId || seg.toId === nId) continue;
      const nearest = nearestOnSegment(node, seg.from, seg.to);
      const d = dist(node, nearest);
      if (d > 0.1 && d <= SNAP_RADIUS) {
        const vId = `v${vIdx++}`;
        const vFloor = nodes.get(seg.fromId)?.floorId;
        nodes.set(vId, { id: vId, x: nearest.x, y: nearest.y, floorId: vFloor });
        const t = paramOnSegment(nearest, seg.from, seg.to);
        addSplit(splitPoints, seg.edgeId, t, vId);
        // 노드→가상노드 엣지
        edges.push({ from: nId, to: vId, cost: d });
      }
    }
  }

  // 4. 분할된 엣지를 실제 엣지로 변환 + 세그먼트 수집
  const graphSegments: GraphSegment[] = [];
  for (const seg of segments) {
    const splits = splitPoints.get(seg.edgeId) || [];
    splits.sort((a, b) => a.t - b.t);
    // 시작→분할1→분할2→...→끝
    const chain = [{ t: 0, nodeId: seg.fromId }, ...splits, { t: 1, nodeId: seg.toId }];
    for (let k = 0; k < chain.length - 1; k++) {
      const a = nodes.get(chain[k].nodeId)!;
      const b = nodes.get(chain[k + 1].nodeId)!;
      edges.push({ from: chain[k].nodeId, to: chain[k + 1].nodeId, cost: dist(a, b) });
      graphSegments.push({ from: a, to: b, fromId: chain[k].nodeId, toId: chain[k + 1].nodeId });
    }
  }

  // 분할 안 된 엣지 추가 (splitPoints에 없는 엣지)
  // → 위 for에서 splits가 빈 배열이면 원본 엣지 그대로 추가됨

  // adjacency list
  const adj = new Map<string, { to: string; cost: number }[]>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from)!.push({ to: e.to, cost: e.cost });
    adj.get(e.to)!.push({ to: e.from, cost: e.cost });
  }

  // 5. linked_node_id 크로스 엣지 (층간 연결 — 비용 50px 고정)
  const CROSS_FLOOR_COST = 50;
  for (const n of rawNodes) {
    if (n.linked_node_id != null && nodes.has(`n${n.linked_node_id}`)) {
      const fromId = `n${n.id}`;
      const toId = `n${n.linked_node_id}`;
      if (!adj.has(fromId)) adj.set(fromId, []);
      // 중복 방지
      if (!adj.get(fromId)!.some(e => e.to === toId)) {
        adj.get(fromId)!.push({ to: toId, cost: CROSS_FLOOR_COST });
      }
    }
  }

  return { nodes, adj, segments: graphSegments };
}

function paramOnSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return 0;
  return Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
}

function addSplit(map: Map<number, { t: number; nodeId: string }[]>, edgeId: number, t: number, nodeId: string) {
  if (!map.has(edgeId)) map.set(edgeId, []);
  map.get(edgeId)!.push({ t, nodeId });
}

// ===== 출발점 스냅 =====
export function snapToGraph(p: Point, graph: PathGraph, segments: { from: Point; to: Point; fromId: string; toId: string }[], floorId?: number): { nodeId: string; point: Point } {
  let bestDist = Infinity;
  let bestNodeId = '';
  let bestPoint: Point = p;

  // 기존 노드에 스냅
  for (const [id, node] of graph.nodes) {
    const d = dist(p, node);
    if (d < bestDist) { bestDist = d; bestNodeId = id; bestPoint = node; }
  }

  // 엣지 위의 점에 스냅
  let bestSeg: typeof segments[0] | null = null;
  for (const seg of segments) {
    const nearest = nearestOnSegment(p, seg.from, seg.to);
    const d = dist(p, nearest);
    if (d < bestDist) {
      bestDist = d;
      bestPoint = nearest;
      bestSeg = seg;
    }
  }
  // 엣지 위의 점이 더 가까우면 가상 노드 생성
  if (bestSeg) {
    const vId = `snap_start`;
    const snapFloor = floorId ?? graph.nodes.get(bestSeg.fromId)?.floorId;
    graph.nodes.set(vId, { id: vId, x: bestPoint.x, y: bestPoint.y, floorId: snapFloor });
    const dFrom = dist(bestPoint, bestSeg.from);
    const dTo = dist(bestPoint, bestSeg.to);
    graph.adj.set(vId, [{ to: bestSeg.fromId, cost: dFrom }, { to: bestSeg.toId, cost: dTo }]);
    if (!graph.adj.has(bestSeg.fromId)) graph.adj.set(bestSeg.fromId, []);
    if (!graph.adj.has(bestSeg.toId)) graph.adj.set(bestSeg.toId, []);
    graph.adj.get(bestSeg.fromId)!.push({ to: vId, cost: dFrom });
    graph.adj.get(bestSeg.toId)!.push({ to: vId, cost: dTo });
    bestNodeId = vId;
  }

  return { nodeId: bestNodeId, point: bestPoint };
}

// ===== 도착 후보 생성 =====
export function findDestCandidates(
  booth: Booth,
  graph: PathGraph,
  segments: { from: Point; to: Point; fromId: string; toId: string }[],
  allBooths: Booth[],
  obstacles: Obstacle[],
  floorId?: number,
): { nodeId: string; point: Point }[] {
  const { cx, cy } = getBoothCenter(booth);
  const center = { x: cx, y: cy };
  const candidates: { nodeId: string; point: Point; dist: number; segKey: string }[] = [];

  // 각 엣지에서 부스 중심과 가장 가까운 점 (후보 수집만, 그래프 수정 안 함)
  const segBest = new Map<string, { point: Point; dist: number; seg: typeof segments[0] }>();

  for (const seg of segments) {
    const nearest = nearestOnSegment(center, seg.from, seg.to);
    const d = dist(center, nearest);
    if (hasObstruction(center, nearest, allBooths, obstacles, booth.id)) continue;

    const segKey = [seg.fromId, seg.toId].sort().join('-');
    const existing = segBest.get(segKey);
    if (!existing || d < existing.dist) {
      segBest.set(segKey, { point: nearest, dist: d, seg });
    }
  }

  // 최대 4개 선택 후 그래프에 삽입
  const sorted = [...segBest.values()].sort((a, b) => a.dist - b.dist).slice(0, 4);
  return sorted.map((s, i) => {
    const vId = `dest_${i}`;
    const destFloor = floorId ?? graph.nodes.get(s.seg.fromId)?.floorId;
    graph.nodes.set(vId, { id: vId, x: s.point.x, y: s.point.y, floorId: destFloor });
    const dFrom = dist(s.point, s.seg.from);
    const dTo = dist(s.point, s.seg.to);
    graph.adj.set(vId, [{ to: s.seg.fromId, cost: dFrom }, { to: s.seg.toId, cost: dTo }]);
    if (!graph.adj.has(s.seg.fromId)) graph.adj.set(s.seg.fromId, []);
    if (!graph.adj.has(s.seg.toId)) graph.adj.set(s.seg.toId, []);
    graph.adj.get(s.seg.fromId)!.push({ to: vId, cost: dFrom });
    graph.adj.get(s.seg.toId)!.push({ to: vId, cost: dTo });
    return { nodeId: vId, point: s.point };
  });
}

// ===== A* 알고리즘 =====
export function astar(graph: PathGraph, startId: string, goalId: string): string[] | null {
  const goal = graph.nodes.get(goalId);
  if (!goal) return null;

  const openSet = new Set<string>([startId]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();

  gScore.set(startId, 0);
  fScore.set(startId, heuristic(graph.nodes.get(startId)!, goal));

  while (openSet.size > 0) {
    // 가장 낮은 fScore 노드
    let current = '';
    let bestF = Infinity;
    for (const id of openSet) {
      const f = fScore.get(id) ?? Infinity;
      if (f < bestF) { bestF = f; current = id; }
    }
    if (!current) return null;
    if (current === goalId) return reconstructPath(cameFrom, current);

    openSet.delete(current);
    const neighbors = graph.adj.get(current) || [];
    for (const { to, cost } of neighbors) {
      const tentG = (gScore.get(current) ?? Infinity) + cost;
      if (tentG < (gScore.get(to) ?? Infinity)) {
        cameFrom.set(to, current);
        gScore.set(to, tentG);
        const toNode = graph.nodes.get(to);
        fScore.set(to, tentG + (toNode ? heuristic(toNode, goal) : 0));
        openSet.add(to);
      }
    }
  }
  return null;
}

function heuristic(a: Point, b: Point): number {
  return dist(a, b);
}

function reconstructPath(cameFrom: Map<string, string>, current: string): string[] {
  const path = [current];
  while (cameFrom.has(current)) {
    current = cameFrom.get(current)!;
    path.unshift(current);
  }
  return path;
}

// ===== 전체 경로 찾기 =====
export interface FloorSegment {
  floorId: number;
  path: Point[];
  distance: number;
}

export interface PathResult {
  path: Point[];
  distance: number;
  /** 출발 연장 구간: path[0]~path[startExtIdx] (점선) */
  startExtIdx?: number;
  /** 도착 연장 구간: path[endExtIdx]~path[끝] (점선) */
  endExtIdx?: number;
  /** 멀티층 경로: 층별 세그먼트 */
  floorSegments?: FloorSegment[];
  /** 경유한 층 ID 목록 */
  floors?: number[];
}

export function findPath(
  startPoint: Point,
  destBooth: Booth,
  rawNodes: RawNode[],
  rawEdges: RawEdge[],
  allBooths: Booth[],
  obstacles: Obstacle[],
  startFloorId?: number,
  destFloorId?: number,
): PathResult | null {
  // 1. 그래프 빌드
  const graph = buildGraph(rawNodes, rawEdges);

  // 2. 분할된 세그먼트 사용 (교차점/근접 포함)
  const segments = graph.segments;

  // 3. 출발점 스냅 (같은 층만)
  const start = snapToGraph(startPoint, graph, segments, startFloorId);

  // 4. 도착 후보 (같은 층만)
  const destCandidates = findDestCandidates(destBooth, graph, segments, allBooths, obstacles, destFloorId);
  if (destCandidates.length === 0) return null;

  // 5. 각 후보에 A* → 최단 경로 선택
  let bestPath: string[] | null = null;
  let bestDist = Infinity;
  let bestGoalId = '';

  for (const cand of destCandidates) {
    const path = astar(graph, start.nodeId, cand.nodeId);
    if (path) {
      let totalDist = 0;
      for (let i = 0; i < path.length - 1; i++) {
        const a = graph.nodes.get(path[i])!;
        const b = graph.nodes.get(path[i + 1])!;
        totalDist += dist(a, b);
      }
      if (totalDist < bestDist) {
        bestDist = totalDist;
        bestPath = path;
        bestGoalId = cand.nodeId;
      }
    }
  }

  if (!bestPath) return null;

  // 경로를 Point 배열로 변환 + 층 정보 추출
  const points: Point[] = [];
  const nodeFloors: (number | undefined)[] = [];
  for (const id of bestPath) {
    const n = graph.nodes.get(id)!;
    points.push({ x: n.x, y: n.y });
    nodeFloors.push(n.floorId);
  }

  // 층별 세그먼트 분리 — linked_node_id 크로스 엣지에서만 층 전환
  // 경로의 각 노드에서 실제 층 전환(linked_node_id)인지 확인
  const floorSegments: FloorSegment[] = [];
  // 실제 층 전환: 연속된 두 노드가 linked_node_id로 연결된 경우만
  let curFloor = startFloorId ?? nodeFloors[0];
  let curPoints: Point[] = [points[0]];
  let curDist = 0;
  for (let i = 1; i < points.length; i++) {
    const prevId = bestPath[i - 1];
    const curId = bestPath[i];
    const prevNode = graph.nodes.get(prevId);
    const curNode = graph.nodes.get(curId);
    const segDist = dist(points[i - 1], points[i]);
    
    // linked_node_id 크로스 엣지인지 확인
    const isLinkedCross = prevNode?.floorId != null && curNode?.floorId != null 
      && prevNode.floorId !== curNode.floorId;
    
    if (isLinkedCross) {
      // 층 전환 — 현재 세그먼트 마감
      floorSegments.push({ floorId: curFloor!, path: curPoints, distance: curDist });
      curFloor = curNode.floorId;
      curPoints = [points[i]];
      curDist = 0;
    } else {
      curPoints.push(points[i]);
      curDist += segDist;
    }
  }
  if (curFloor != null && curPoints.length > 0) {
    floorSegments.push({ floorId: curFloor, path: curPoints, distance: curDist });
  }

  const floors = [...new Set(floorSegments.map(s => s.floorId))];

  return { path: points, distance: bestDist, floorSegments, floors };
}
