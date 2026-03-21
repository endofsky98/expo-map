/**
 * pathfinding.ts — A* 길찾기 (클라이언트 전용)
 * 그래프 빌드 (교차점 + 50px 근접 자동연결) + A* 알고리즘
 */

import { Booth, Obstacle } from '@/types';
import { getBoothCenter } from './clusterUtils';

// ===== 타입 =====
interface RawNode { id: number; x: number; y: number; floor_id: number; type: string }
interface RawEdge { id: number; from_node_id: number; to_node_id: number; is_open: boolean }
interface GraphNode { id: string; x: number; y: number }
interface GraphEdge { from: string; to: string; cost: number }
interface Point { x: number; y: number }

const SNAP_RADIUS = 50;    // 근접 연결 반경 (px)
const DEST_RADIUS = 200;   // 도착 후보 탐색 반경 (px)

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
export interface PathGraph {
  nodes: Map<string, GraphNode>;
  adj: Map<string, { to: string; cost: number }[]>;
}

export function buildGraph(rawNodes: RawNode[], rawEdges: RawEdge[]): PathGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  // 1. 원본 노드 등록
  for (const n of rawNodes) {
    nodes.set(`n${n.id}`, { id: `n${n.id}`, x: n.x, y: n.y });
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
        nodes.set(vId, { id: vId, x: pt.x, y: pt.y });
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
        nodes.set(vId, { id: vId, x: nearest.x, y: nearest.y });
        const t = paramOnSegment(nearest, seg.from, seg.to);
        addSplit(splitPoints, seg.edgeId, t, vId);
        // 노드→가상노드 엣지
        edges.push({ from: nId, to: vId, cost: d });
      }
    }
  }

  // 4. 분할된 엣지를 실제 엣지로 변환
  for (const seg of segments) {
    const splits = splitPoints.get(seg.edgeId) || [];
    splits.sort((a, b) => a.t - b.t);
    // 시작→분할1→분할2→...→끝
    const chain = [{ t: 0, nodeId: seg.fromId }, ...splits, { t: 1, nodeId: seg.toId }];
    for (let k = 0; k < chain.length - 1; k++) {
      const a = nodes.get(chain[k].nodeId)!;
      const b = nodes.get(chain[k + 1].nodeId)!;
      edges.push({ from: chain[k].nodeId, to: chain[k + 1].nodeId, cost: dist(a, b) });
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

  return { nodes, adj };
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
export function snapToGraph(p: Point, graph: PathGraph, segments: { from: Point; to: Point; fromId: string; toId: string }[]): { nodeId: string; point: Point } {
  let bestDist = Infinity;
  let bestNodeId = '';
  let bestPoint: Point = p;

  // 기존 노드에 스냅
  for (const [id, node] of graph.nodes) {
    const d = dist(p, node);
    if (d < bestDist) { bestDist = d; bestNodeId = id; bestPoint = node; }
  }

  // 엣지 위의 점에 스냅
  for (const seg of segments) {
    const nearest = nearestOnSegment(p, seg.from, seg.to);
    const d = dist(p, nearest);
    if (d < bestDist) {
      bestDist = d;
      // 가상 노드 생성하여 그래프에 삽입
      const vId = `snap_start`;
      graph.nodes.set(vId, { id: vId, x: nearest.x, y: nearest.y });
      // 양쪽 노드와 연결
      if (!graph.adj.has(vId)) graph.adj.set(vId, []);
      const dFrom = dist(nearest, seg.from);
      const dTo = dist(nearest, seg.to);
      graph.adj.get(vId)!.push({ to: seg.fromId, cost: dFrom }, { to: seg.toId, cost: dTo });
      if (!graph.adj.has(seg.fromId)) graph.adj.set(seg.fromId, []);
      if (!graph.adj.has(seg.toId)) graph.adj.set(seg.toId, []);
      graph.adj.get(seg.fromId)!.push({ to: vId, cost: dFrom });
      graph.adj.get(seg.toId)!.push({ to: vId, cost: dTo });
      bestNodeId = vId;
      bestPoint = nearest;
    }
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
): { nodeId: string; point: Point }[] {
  const { cx, cy } = getBoothCenter(booth);
  const center = { x: cx, y: cy };
  const candidates: { nodeId: string; point: Point; dist: number; segKey: string }[] = [];

  // 각 엣지에서 부스 중심과 가장 가까운 점
  const segBest = new Map<string, { nodeId: string; point: Point; dist: number }>();
  let vIdx = 0;

  for (const seg of segments) {
    const nearest = nearestOnSegment(center, seg.from, seg.to);
    const d = dist(center, nearest);
    if (d > DEST_RADIUS) continue;

    // 시야선 체크 — 부스 중심에서 nearest까지 장애물 없는지
    if (hasObstruction(center, nearest, allBooths, obstacles, booth.id)) continue;

    const segKey = [seg.fromId, seg.toId].sort().join('-');
    const existing = segBest.get(segKey);
    if (!existing || d < existing.dist) {
      const vId = `dest_${vIdx++}`;
      graph.nodes.set(vId, { id: vId, x: nearest.x, y: nearest.y });
      if (!graph.adj.has(vId)) graph.adj.set(vId, []);
      const dFrom = dist(nearest, seg.from);
      const dTo = dist(nearest, seg.to);
      graph.adj.get(vId)!.push({ to: seg.fromId, cost: dFrom }, { to: seg.toId, cost: dTo });
      if (!graph.adj.has(seg.fromId)) graph.adj.set(seg.fromId, []);
      if (!graph.adj.has(seg.toId)) graph.adj.set(seg.toId, []);
      graph.adj.get(seg.fromId)!.push({ to: vId, cost: dFrom });
      graph.adj.get(seg.toId)!.push({ to: vId, cost: dTo });
      segBest.set(segKey, { nodeId: vId, point: nearest, dist: d });
    }
  }

  // segBest에서 최대 4개 선택 (거리 가까운 순)
  const sorted = [...segBest.values()].sort((a, b) => a.dist - b.dist).slice(0, 4);
  return sorted.map(s => ({ nodeId: s.nodeId, point: s.point }));
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
export interface PathResult {
  path: Point[];
  distance: number;
}

export function findPath(
  startPoint: Point,
  destBooth: Booth,
  rawNodes: RawNode[],
  rawEdges: RawEdge[],
  allBooths: Booth[],
  obstacles: Obstacle[],
): PathResult | null {
  // 1. 그래프 빌드
  const graph = buildGraph(rawNodes, rawEdges);

  // 2. 엣지 세그먼트 목록 (스냅/후보 탐색용)
  const segments: { from: Point; to: Point; fromId: string; toId: string }[] = [];
  for (const e of rawEdges) {
    if (!e.is_open) continue;
    const fn = graph.nodes.get(`n${e.from_node_id}`);
    const tn = graph.nodes.get(`n${e.to_node_id}`);
    if (fn && tn) segments.push({ from: fn, to: tn, fromId: fn.id, toId: tn.id });
  }

  // 3. 출발점 스냅
  const start = snapToGraph(startPoint, graph, segments);

  // 4. 도착 후보
  const destCandidates = findDestCandidates(destBooth, graph, segments, allBooths, obstacles);
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

  // 경로를 Point 배열로 변환
  const points: Point[] = bestPath.map(id => {
    const n = graph.nodes.get(id)!;
    return { x: n.x, y: n.y };
  });

  return { path: points, distance: bestDist };
}
