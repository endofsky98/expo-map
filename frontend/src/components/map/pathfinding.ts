/**
 * pathfinding.ts — 멀티층 A* 길찾기 (클라이언트 전용)
 * 
 * 알고리즘:
 * 1. 각 층별 그래프를 독립 빌드 (교차점 + 50px 근접 자동연결)
 * 2. 에스컬레이터/계단/엘리베이터 노드를 층간 전환점으로 취급
 * 3. 같은 층이면: 출발 → 도착 직접 A*
 * 4. 다른 층이면:
 *    a. 출발층에서 모든 층간 노드까지 A* (각 최단거리)
 *    b. 각 층간 노드의 linked_node_id로 도착층 진입
 *    c. 도착층에서 도착지까지 A*
 *    d. 총 거리 최소 경로 선택
 */

import { Booth, Obstacle } from '@/types';
import { getBoothCenter } from './clusterUtils';

// ===== 타입 =====
interface RawNode { id: number; x: number; y: number; floor_id: number; type: string; linked_node_id?: number | null }
interface RawEdge { id: number; from_node_id: number; to_node_id: number; is_open: boolean }
interface GraphNode { id: string; x: number; y: number; floorId?: number }
interface GraphEdge { from: string; to: string; cost: number }
interface Point { x: number; y: number }

const SNAP_RADIUS = 50;

// ===== 유틸 =====
function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function nearestOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { ...a };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

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

function hasObstruction(a: Point, b: Point, booths: Booth[], obstacles: Obstacle[], excludeBoothId?: number): boolean {
  for (const booth of booths) {
    if (booth.id === excludeBoothId) continue;
    if (!booth.is_active) continue;
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

// ===== 그래프 타입 =====
export interface GraphSegment { from: Point; to: Point; fromId: string; toId: string }
export interface PathGraph {
  nodes: Map<string, GraphNode>;
  adj: Map<string, { to: string; cost: number }[]>;
  segments: GraphSegment[];
}

// ===== 단일층 그래프 빌드 =====
// floorId에 해당하는 노드/엣지만으로 그래프 빌드 (교차점 + 50px 스냅)
function buildFloorGraph(rawNodes: RawNode[], rawEdges: RawEdge[], floorId: number): PathGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  // 해당 층 노드만
  for (const n of rawNodes) {
    if (n.floor_id !== floorId) continue;
    nodes.set(`n${n.id}`, { id: `n${n.id}`, x: n.x, y: n.y, floorId: n.floor_id });
  }

  // 해당 층 엣지만 (양쪽 노드 모두 같은 층)
  type Seg = { fromId: string; toId: string; from: Point; to: Point; edgeId: number };
  const segments: Seg[] = [];
  for (const e of rawEdges) {
    if (!e.is_open) continue;
    const fn = nodes.get(`n${e.from_node_id}`);
    const tn = nodes.get(`n${e.to_node_id}`);
    if (!fn || !tn) continue;
    segments.push({ fromId: fn.id, toId: tn.id, from: fn, to: tn, edgeId: e.id });
  }

  // 교차점 가상 노드
  let vIdx = 0;
  const splitPoints = new Map<number, { t: number; nodeId: string }[]>();
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const pt = segmentIntersection(segments[i].from, segments[i].to, segments[j].from, segments[j].to);
      if (pt) {
        const vId = `v${floorId}_${vIdx++}`;
        nodes.set(vId, { id: vId, x: pt.x, y: pt.y, floorId });
        const ti = paramOnSegment(pt, segments[i].from, segments[i].to);
        const tj = paramOnSegment(pt, segments[j].from, segments[j].to);
        addSplit(splitPoints, segments[i].edgeId, ti, vId);
        addSplit(splitPoints, segments[j].edgeId, tj, vId);
      }
    }
  }

  // 50px 근접 스냅
  const originalNodeIds = [...nodes.keys()];
  for (const nId of originalNodeIds) {
    const node = nodes.get(nId)!;
    for (const seg of segments) {
      if (seg.fromId === nId || seg.toId === nId) continue;
      const nearest = nearestOnSegment(node, seg.from, seg.to);
      const d = dist(node, nearest);
      if (d > 0.1 && d <= SNAP_RADIUS) {
        const vId = `v${floorId}_${vIdx++}`;
        nodes.set(vId, { id: vId, x: nearest.x, y: nearest.y, floorId });
        const t = paramOnSegment(nearest, seg.from, seg.to);
        addSplit(splitPoints, seg.edgeId, t, vId);
        edges.push({ from: nId, to: vId, cost: d });
      }
    }
  }

  // 분할 엣지 + 세그먼트 수집
  const graphSegments: GraphSegment[] = [];
  for (const seg of segments) {
    const splits = splitPoints.get(seg.edgeId) || [];
    splits.sort((a, b) => a.t - b.t);
    const chain = [{ t: 0, nodeId: seg.fromId }, ...splits, { t: 1, nodeId: seg.toId }];
    for (let k = 0; k < chain.length - 1; k++) {
      const a = nodes.get(chain[k].nodeId)!;
      const b = nodes.get(chain[k + 1].nodeId)!;
      edges.push({ from: chain[k].nodeId, to: chain[k + 1].nodeId, cost: dist(a, b) });
      graphSegments.push({ from: a, to: b, fromId: chain[k].nodeId, toId: chain[k + 1].nodeId });
    }
  }

  // adjacency list
  const adj = new Map<string, { to: string; cost: number }[]>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from)!.push({ to: e.to, cost: e.cost });
    adj.get(e.to)!.push({ to: e.from, cost: e.cost });
  }

  return { nodes, adj, segments: graphSegments };
}

// ===== 출발점 스냅 (단일층 그래프에서) =====
function snapToFloorGraph(p: Point, graph: PathGraph, prefix: string): string {
  let bestDist = Infinity;
  let bestNodeId = '';
  let bestPoint: Point = p;
  let bestSeg: GraphSegment | null = null;

  for (const [id, node] of graph.nodes) {
    const d = dist(p, node);
    if (d < bestDist) { bestDist = d; bestNodeId = id; bestPoint = node; }
  }

  for (const seg of graph.segments) {
    const nearest = nearestOnSegment(p, seg.from, seg.to);
    const d = dist(p, nearest);
    if (d < bestDist) { bestDist = d; bestPoint = nearest; bestSeg = seg; }
  }

  if (bestSeg) {
    const vId = prefix;
    graph.nodes.set(vId, { id: vId, x: bestPoint.x, y: bestPoint.y, floorId: graph.nodes.values().next().value?.floorId });
    const dFrom = dist(bestPoint, bestSeg.from);
    const dTo = dist(bestPoint, bestSeg.to);
    graph.adj.set(vId, [{ to: bestSeg.fromId, cost: dFrom }, { to: bestSeg.toId, cost: dTo }]);
    if (!graph.adj.has(bestSeg.fromId)) graph.adj.set(bestSeg.fromId, []);
    if (!graph.adj.has(bestSeg.toId)) graph.adj.set(bestSeg.toId, []);
    graph.adj.get(bestSeg.fromId)!.push({ to: vId, cost: dFrom });
    graph.adj.get(bestSeg.toId)!.push({ to: vId, cost: dTo });
    bestNodeId = vId;
  }

  return bestNodeId;
}

// ===== 도착 후보 (단일층 그래프에서) =====
function findDestInFloorGraph(
  booth: Booth,
  graph: PathGraph,
  allBooths: Booth[],
  obstacles: Obstacle[],
): string[] {
  const { cx, cy } = getBoothCenter(booth);
  const center = { x: cx, y: cy };
  const segBest = new Map<string, { point: Point; dist: number; seg: GraphSegment }>();

  for (const seg of graph.segments) {
    const nearest = nearestOnSegment(center, seg.from, seg.to);
    const d = dist(center, nearest);
    if (hasObstruction(center, nearest, allBooths, obstacles, booth.id)) continue;
    const segKey = [seg.fromId, seg.toId].sort().join('-');
    const existing = segBest.get(segKey);
    if (!existing || d < existing.dist) {
      segBest.set(segKey, { point: nearest, dist: d, seg });
    }
  }

  const sorted = [...segBest.values()].sort((a, b) => a.dist - b.dist).slice(0, 4);
  return sorted.map((s, i) => {
    const vId = `dest_${i}`;
    graph.nodes.set(vId, { id: vId, x: s.point.x, y: s.point.y, floorId: graph.nodes.values().next().value?.floorId });
    const dFrom = dist(s.point, s.seg.from);
    const dTo = dist(s.point, s.seg.to);
    graph.adj.set(vId, [{ to: s.seg.fromId, cost: dFrom }, { to: s.seg.toId, cost: dTo }]);
    if (!graph.adj.has(s.seg.fromId)) graph.adj.set(s.seg.fromId, []);
    if (!graph.adj.has(s.seg.toId)) graph.adj.set(s.seg.toId, []);
    graph.adj.get(s.seg.fromId)!.push({ to: vId, cost: dFrom });
    graph.adj.get(s.seg.toId)!.push({ to: vId, cost: dTo });
    return vId;
  });
}

// ===== A* 알고리즘 =====
function astar(graph: PathGraph, startId: string, goalId: string): string[] | null {
  const goal = graph.nodes.get(goalId);
  if (!goal) return null;

  const openSet = new Set<string>([startId]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();

  gScore.set(startId, 0);
  const startNode = graph.nodes.get(startId);
  fScore.set(startId, startNode ? dist(startNode, goal) : 0);

  while (openSet.size > 0) {
    let current = '';
    let bestF = Infinity;
    for (const id of openSet) {
      const f = fScore.get(id) ?? Infinity;
      if (f < bestF) { bestF = f; current = id; }
    }
    if (!current) return null;
    if (current === goalId) {
      const path = [current];
      let c = current;
      while (cameFrom.has(c)) { c = cameFrom.get(c)!; path.unshift(c); }
      return path;
    }

    openSet.delete(current);
    const neighbors = graph.adj.get(current) || [];
    for (const { to, cost } of neighbors) {
      const tentG = (gScore.get(current) ?? Infinity) + cost;
      if (tentG < (gScore.get(to) ?? Infinity)) {
        cameFrom.set(to, current);
        gScore.set(to, tentG);
        const toNode = graph.nodes.get(to);
        fScore.set(to, tentG + (toNode ? dist(toNode, goal) : 0));
        openSet.add(to);
      }
    }
  }
  return null;
}

// ===== 경로에서 거리 계산 =====
function pathDistance(graph: PathGraph, path: string[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = graph.nodes.get(path[i])!;
    const b = graph.nodes.get(path[i + 1])!;
    total += dist(a, b);
  }
  return total;
}

// ===== 결과 타입 =====
export interface FloorSegment {
  floorId: number;
  path: Point[];
  distance: number;
}

export interface PathResult {
  path: Point[];
  distance: number;
  startExtIdx?: number;
  endExtIdx?: number;
  floorSegments?: FloorSegment[];
  floors?: number[];
}

// ===== 단일층 내부 경로 (A* + 최단 선택) =====
function findSameFloorPath(
  startNodeId: string,
  destNodeIds: string[],
  graph: PathGraph,
): { path: string[]; dist: number; goalId: string } | null {
  let best: { path: string[]; dist: number; goalId: string } | null = null;
  for (const goalId of destNodeIds) {
    const p = astar(graph, startNodeId, goalId);
    if (p) {
      const d = pathDistance(graph, p);
      if (!best || d < best.dist) best = { path: p, dist: d, goalId };
    }
  }
  return best;
}

// ===== 메인: 멀티층 길찾기 =====
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
  const srcFloor = startFloorId ?? 1;
  const dstFloor = destFloorId ?? srcFloor;

  // 층간 전환 노드 수집 (에스컬레이터/계단/엘리베이터 — linked_node_id가 있는 노드)
  const transitionNodes = rawNodes.filter(n => n.linked_node_id != null);

  // ===== 같은 층 =====
  if (srcFloor === dstFloor) {
    const graph = buildFloorGraph(rawNodes, rawEdges, srcFloor);
    const startId = snapToFloorGraph(startPoint, graph, 'snap_start');
    if (!startId) return null;
    const destIds = findDestInFloorGraph(destBooth, graph, allBooths, obstacles);
    if (destIds.length === 0) return null;
    const result = findSameFloorPath(startId, destIds, graph);
    if (!result) return null;

    const points = result.path.map(id => {
      const n = graph.nodes.get(id)!;
      return { x: n.x, y: n.y };
    });
    const floorSegments: FloorSegment[] = [{ floorId: srcFloor, path: points, distance: result.dist }];
    return { path: points, distance: result.dist, floorSegments, floors: [srcFloor] };
  }

  // ===== 다른 층 =====
  // 출발층 그래프
  const srcGraph = buildFloorGraph(rawNodes, rawEdges, srcFloor);
  const startId = snapToFloorGraph(startPoint, srcGraph, 'snap_start');
  if (!startId) return null;

  // 도착층 그래프
  const dstGraph = buildFloorGraph(rawNodes, rawEdges, dstFloor);
  const destIds = findDestInFloorGraph(destBooth, dstGraph, allBooths, obstacles);
  if (destIds.length === 0) return null;

  // 출발층의 층간 전환 노드 (linked_node_id의 상대가 도착층인 것)
  const srcTransitions: { srcNodeId: string; dstNodeId: string; rawNode: RawNode }[] = [];
  for (const tn of transitionNodes) {
    if (tn.floor_id !== srcFloor) continue;
    const linked = rawNodes.find(n => n.id === tn.linked_node_id);
    if (!linked) continue;
    if (linked.floor_id === dstFloor) {
      srcTransitions.push({ srcNodeId: `n${tn.id}`, dstNodeId: `n${linked.id}`, rawNode: tn });
    }
  }

  if (srcTransitions.length === 0) {
    // 직접 연결 불가 — 중간층 경유 (미구현, 일단 null)
    return null;
  }

  // 각 층간 전환 노드 경유 경로 계산
  interface CandidateRoute {
    srcPath: string[];     // 출발 → 출발층 전환노드
    srcDist: number;
    dstPath: string[];     // 도착층 전환노드 → 도착
    dstDist: number;
    totalDist: number;
    srcTransNodeId: string;  // 출발층 전환노드
    dstTransNodeId: string;  // 도착층 전환노드
  }

  const candidates: CandidateRoute[] = [];

  for (const trans of srcTransitions) {
    // 출발 → 출발층 전환노드
    if (!srcGraph.nodes.has(trans.srcNodeId)) continue;
    const srcPath = astar(srcGraph, startId, trans.srcNodeId);
    if (!srcPath) continue;
    const srcDist = pathDistance(srcGraph, srcPath);

    // 도착층 전환노드 → 도착
    if (!dstGraph.nodes.has(trans.dstNodeId)) continue;
    const dstResult = findSameFloorPath(trans.dstNodeId, destIds, dstGraph);
    if (!dstResult) continue;

    const totalDist = srcDist + dstResult.dist;
    candidates.push({
      srcPath,
      srcDist,
      dstPath: dstResult.path,
      dstDist: dstResult.dist,
      totalDist,
      srcTransNodeId: trans.srcNodeId,
      dstTransNodeId: trans.dstNodeId,
    });
  }

  if (candidates.length === 0) return null;

  // 최단 경로 선택
  candidates.sort((a, b) => a.totalDist - b.totalDist);
  const best = candidates[0];

  // 출발층 세그먼트
  const srcPoints = best.srcPath.map(id => {
    const n = srcGraph.nodes.get(id)!;
    return { x: n.x, y: n.y };
  });

  // 도착층 세그먼트
  const dstPoints = best.dstPath.map(id => {
    const n = dstGraph.nodes.get(id)!;
    return { x: n.x, y: n.y };
  });

  const floorSegments: FloorSegment[] = [
    { floorId: srcFloor, path: srcPoints, distance: best.srcDist },
    { floorId: dstFloor, path: dstPoints, distance: best.dstDist },
  ];

  const allPoints = [...srcPoints, ...dstPoints];
  const floors = [srcFloor, dstFloor];

  return {
    path: allPoints,
    distance: best.totalDist,
    floorSegments,
    floors,
  };
}

// ===== export for compatibility =====
export { buildFloorGraph as buildGraph };
export function snapToGraph(p: Point, graph: PathGraph, segments: GraphSegment[], floorId?: number) {
  return { nodeId: snapToFloorGraph(p, graph, 'snap_start'), point: p };
}
export function findDestCandidates(
  booth: Booth, graph: PathGraph, segments: GraphSegment[],
  allBooths: Booth[], obstacles: Obstacle[], floorId?: number,
) {
  return findDestInFloorGraph(booth, graph, allBooths, obstacles).map(id => ({
    nodeId: id, point: graph.nodes.get(id) ?? { x: 0, y: 0 },
  }));
}
