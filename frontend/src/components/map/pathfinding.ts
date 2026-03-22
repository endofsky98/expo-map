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

// 출발점 멀티 후보 스냅 — 가장 가까운 N개 세그먼트에 스냅노드 생성
function snapToFloorGraphMulti(p: Point, graph: PathGraph, prefix: string, count: number = 4): string[] {
  type Candidate = { point: Point; dist: number; seg: GraphSegment | null; nodeId?: string };
  const candidates: Candidate[] = [];

  // 노드 후보
  for (const [id, node] of graph.nodes) {
    candidates.push({ point: node, dist: dist(p, node), seg: null, nodeId: id });
  }
  // 세그먼트 후보 (중복 세그먼트 방지)
  const segBest = new Map<string, Candidate>();
  for (const seg of graph.segments) {
    const nearest = nearestOnSegment(p, seg.from, seg.to);
    const d = dist(p, nearest);
    const key = [seg.fromId, seg.toId].sort().join('-');
    const existing = segBest.get(key);
    if (!existing || d < existing.dist) {
      segBest.set(key, { point: nearest, dist: d, seg });
    }
  }
  candidates.push(...segBest.values());

  candidates.sort((a, b) => a.dist - b.dist);
  const selected = candidates.slice(0, count);
  const ids: string[] = [];

  for (let i = 0; i < selected.length; i++) {
    const c = selected[i];
    if (c.nodeId) {
      ids.push(c.nodeId);
    } else if (c.seg) {
      const vId = `${prefix}_${i}`;
      const floorId = graph.nodes.values().next().value?.floorId;
      graph.nodes.set(vId, { id: vId, x: c.point.x, y: c.point.y, floorId });
      const dFrom = dist(c.point, c.seg.from);
      const dTo = dist(c.point, c.seg.to);
      graph.adj.set(vId, [{ to: c.seg.fromId, cost: dFrom }, { to: c.seg.toId, cost: dTo }]);
      if (!graph.adj.has(c.seg.fromId)) graph.adj.set(c.seg.fromId, []);
      if (!graph.adj.has(c.seg.toId)) graph.adj.set(c.seg.toId, []);
      graph.adj.get(c.seg.fromId)!.push({ to: vId, cost: dFrom });
      graph.adj.get(c.seg.toId)!.push({ to: vId, cost: dTo });
      ids.push(vId);
    }
  }
  return ids;
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
export interface RouteWaypoint {
  x: number;
  y: number;
  type: string;  // 'stairs' | 'escalator' | 'elevator' | 'entrance' | 'exit' 등
  label: string; // 한글 라벨
}

export interface FloorSegment {
  floorId: number;
  path: Point[];
  distance: number;
  waypoints?: RouteWaypoint[];
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
function findSameFloorPathMulti(
  startNodeIds: string[],
  destNodeIds: string[],
  graph: PathGraph,
  startPoint: Point,
  destCenter: Point,
): { path: string[]; dist: number; startId: string; goalId: string } | null {
  let best: { path: string[]; dist: number; totalDist: number; startId: string; goalId: string } | null = null;
  for (const startId of startNodeIds) {
    const startNode = graph.nodes.get(startId);
    const startSnapDist = startNode ? dist(startPoint, startNode) : 0;
    for (const goalId of destNodeIds) {
      const p = astar(graph, startId, goalId);
      if (p) {
        const routeDist = pathDistance(graph, p);
        const goalNode = graph.nodes.get(goalId);
        const endSnapDist = goalNode ? dist(goalNode, destCenter) : 0;
        const totalDist = startSnapDist + routeDist + endSnapDist;
        if (!best || totalDist < best.totalDist) {
          best = { path: p, dist: routeDist, totalDist, startId, goalId };
        }
      }
    }
  }
  return best;
}

// ===== 경로 상 특수 노드(계단/에스컬레이터/엘리베이터 등) 수집 =====
const WAYPOINT_LABELS: Record<string, string> = {
  stairs: '계단', escalator: '에스컬레이터', elevator: '엘리베이터',
  entrance: '입구', exit: '출구', emergency_exit: '비상구',
  restroom: '화장실', info_desk: '안내데스크',
};
const WAYPOINT_TYPES = new Set(Object.keys(WAYPOINT_LABELS));

function collectWaypoints(pathNodeIds: string[], rawNodes: RawNode[], graph: PathGraph): RouteWaypoint[] {
  const waypoints: RouteWaypoint[] = [];
  const rawNodeMap = new Map(rawNodes.map(n => [String(n.id), n]));
  for (const nodeId of pathNodeIds) {
    // snap_ 노드는 건너뜀
    if (nodeId.startsWith('snap_') || nodeId.startsWith('dest_') || nodeId.startsWith('v')) continue;
    const rawId = nodeId.replace(/^n/, '');
    const raw = rawNodeMap.get(rawId);
    if (!raw || !raw.type || !WAYPOINT_TYPES.has(raw.type)) continue;
    const gn = graph.nodes.get(nodeId);
    if (!gn) continue;
    waypoints.push({ x: gn.x, y: gn.y, type: raw.type, label: WAYPOINT_LABELS[raw.type] || raw.type });
  }
  return waypoints;
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
    const startIds = snapToFloorGraphMulti(startPoint, graph, 'snap_start', 4);
    if (startIds.length === 0) return null;
    const destIds = findDestInFloorGraph(destBooth, graph, allBooths, obstacles);
    if (destIds.length === 0) return null;
    const { cx: destCx, cy: destCy } = getBoothCenter(destBooth);
    const result = findSameFloorPathMulti(startIds, destIds, graph, startPoint, { x: destCx, y: destCy });
    if (!result) return null;

    const points = result.path.map(id => {
      const n = graph.nodes.get(id)!;
      return { x: n.x, y: n.y };
    });
    // 경로에 포함된 특수 노드(계단, 에스컬레이터 등) waypoints 수집
    const waypoints = collectWaypoints(result.path, rawNodes, graph);
    const floorSegments: FloorSegment[] = [{ floorId: srcFloor, path: points, distance: result.dist, waypoints }];
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
  const { cx: destCx, cy: destCy } = getBoothCenter(destBooth);

  // 층간 연결 맵: floorId → [{ nodeId (해당 층), linkedNodeId (다른 층), linkedFloorId }]
  const floorLinks = new Map<number, { nodeId: string; linkedNodeId: string; linkedFloorId: number }[]>();
  for (const tn of transitionNodes) {
    const linked = rawNodes.find(n => n.id === tn.linked_node_id);
    if (!linked) continue;
    if (!floorLinks.has(tn.floor_id)) floorLinks.set(tn.floor_id, []);
    floorLinks.get(tn.floor_id)!.push({
      nodeId: `n${tn.id}`,
      linkedNodeId: `n${linked.id}`,
      linkedFloorId: linked.floor_id,
    });
  }

  // 그래프 캐시 (층별)
  const graphCache = new Map<number, PathGraph>();
  function getFloorGraph(fid: number): PathGraph {
    if (!graphCache.has(fid)) graphCache.set(fid, buildFloorGraph(rawNodes, rawEdges, fid));
    return graphCache.get(fid)!;
  }
  graphCache.set(srcFloor, srcGraph);
  graphCache.set(dstFloor, dstGraph);

  // BFS로 층 경유 경로 탐색
  // 상태: { floorId, nodeId(해당 층에서의 현재 위치), segments[], totalDist }
  interface BfsState {
    floorId: number;
    nodeId: string;
    segments: FloorSegment[];
    totalDist: number;
    visitedFloors: Set<number>;
  }

  const queue: BfsState[] = [];
  // 출발층에서 모든 층간 전환 노드까지 경로 계산
  const srcLinks = floorLinks.get(srcFloor) || [];
  for (const link of srcLinks) {
    if (!srcGraph.nodes.has(link.nodeId)) continue;
    const path = astar(srcGraph, startId, link.nodeId);
    if (!path) continue;
    const d = pathDistance(srcGraph, path);
    const points = path.map(id => { const n = srcGraph.nodes.get(id)!; return { x: n.x, y: n.y }; });
    const visited = new Set([srcFloor, link.linkedFloorId]);
    queue.push({
      floorId: link.linkedFloorId,
      nodeId: link.linkedNodeId,
      segments: [{ floorId: srcFloor, path: points, distance: d }],
      totalDist: d,
      visitedFloors: visited,
    });
  }

  // 직접 출발층→도착층 연결도 포함 (위에서 이미 dstFloor인 것)
  // + 중간층 경유 BFS
  interface BestRoute {
    segments: FloorSegment[];
    totalDist: number;
  }
  let bestRoute: BestRoute | null = null;

  while (queue.length > 0) {
    const state = queue.shift()!;
    
    // 이미 더 좋은 경로 발견했으면 skip
    if (bestRoute && state.totalDist >= bestRoute.totalDist) continue;

    const curGraph = getFloorGraph(state.floorId);

    if (state.floorId === dstFloor) {
      // 도착층 도달 — 도착지까지 경로 계산
      if (!curGraph.nodes.has(state.nodeId)) continue;
      const stateNode = curGraph.nodes.get(state.nodeId);
      const result = findSameFloorPathMulti([state.nodeId], destIds, curGraph, stateNode ? { x: stateNode.x, y: stateNode.y } : { x: 0, y: 0 }, { x: destCx, y: destCy });
      if (!result) continue;
      const total = state.totalDist + result.dist;
      if (!bestRoute || total < bestRoute.totalDist) {
        const points = result.path.map(id => { const n = curGraph.nodes.get(id)!; return { x: n.x, y: n.y }; });
        bestRoute = {
          segments: [...state.segments, { floorId: dstFloor, path: points, distance: result.dist }],
          totalDist: total,
        };
      }
      continue;
    }

    // 아직 도착층이 아님 — 이 층의 층간 노드로 이동
    const curLinks = floorLinks.get(state.floorId) || [];
    for (const link of curLinks) {
      if (state.visitedFloors.has(link.linkedFloorId)) continue; // 이미 방문한 층 skip
      if (!curGraph.nodes.has(state.nodeId) || !curGraph.nodes.has(link.nodeId)) continue;
      
      let path: string[] | null;
      let d: number;
      if (state.nodeId === link.nodeId) {
        // 같은 노드 — 거리 0
        path = [state.nodeId];
        d = 0;
      } else {
        path = astar(curGraph, state.nodeId, link.nodeId);
        if (!path) continue;
        d = pathDistance(curGraph, path);
      }
      
      const total = state.totalDist + d;
      if (bestRoute && total >= bestRoute.totalDist) continue;
      
      const points = path.map(id => { const n = curGraph.nodes.get(id)!; return { x: n.x, y: n.y }; });
      const newSegments = d > 0
        ? [...state.segments, { floorId: state.floorId, path: points, distance: d }]
        : [...state.segments]; // 거리 0이면 세그먼트 생략
      const visited = new Set(state.visitedFloors);
      visited.add(link.linkedFloorId);
      queue.push({
        floorId: link.linkedFloorId,
        nodeId: link.linkedNodeId,
        segments: newSegments,
        totalDist: total,
        visitedFloors: visited,
      });
    }
  }

  if (!bestRoute) return null;

  // 각 세그먼트에 waypoints 추가 (경로 근처 특수 노드)
  for (const seg of bestRoute.segments) {
    const wp: RouteWaypoint[] = [];
    const floorNodes = rawNodes.filter(n => n.floor_id === seg.floorId && n.type && WAYPOINT_TYPES.has(n.type));
    for (const rn of floorNodes) {
      // 경로 포인트 중 하나와 20px 이내면 경유지로 포함
      for (const p of seg.path) {
        if (Math.hypot(p.x - rn.x, p.y - rn.y) < 30) {
          wp.push({ x: rn.x, y: rn.y, type: rn.type, label: WAYPOINT_LABELS[rn.type] || rn.type });
          break;
        }
      }
    }
    seg.waypoints = wp;
  }

  const allPoints = bestRoute.segments.flatMap(s => s.path);
  const floors = bestRoute.segments.map(s => s.floorId);

  return {
    path: allPoints,
    distance: bestRoute.totalDist,
    floorSegments: bestRoute.segments,
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
