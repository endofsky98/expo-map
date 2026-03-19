import heapq
import math
import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Booth, CorridorNode, CorridorEdge, Facility, Obstacle
from schemas import RouteResponse, RoutePoint, FacilityResponse

router = APIRouter(prefix="/api/route", tags=["route"])

CROSS_FLOOR_DISTANCE = 50.0


def _segment_intersects_obstacle(x1, y1, x2, y2, obs) -> bool:
    """Check if a line segment (x1,y1)→(x2,y2) passes through an obstacle."""
    if obs.shape == "circle" and obs.radius:
        cx, cy, r = obs.x, obs.y, obs.radius
        # Check if midpoint or any sample along the segment is within the circle
        for t in [0.0, 0.25, 0.5, 0.75, 1.0]:
            px = x1 + t * (x2 - x1)
            py = y1 + t * (y2 - y1)
            if math.sqrt((px - cx) ** 2 + (py - cy) ** 2) < r:
                return True
        return False
    else:
        # Rectangle: check if segment passes through the rectangle
        ox, oy = obs.x, obs.y
        ow = obs.width or 40
        oh = obs.height or 40
        for t in [0.0, 0.25, 0.5, 0.75, 1.0]:
            px = x1 + t * (x2 - x1)
            py = y1 + t * (y2 - y1)
            if ox <= px <= ox + ow and oy <= py <= oy + oh:
                return True
        return False


def _build_graph(db: Session):
    nodes = {n.id: n for n in db.query(CorridorNode).all()}
    edges = db.query(CorridorEdge).filter(CorridorEdge.is_open == True).all()
    obstacles = db.query(Obstacle).all()

    # Group obstacles by floor
    obs_by_floor = {}
    for obs in obstacles:
        obs_by_floor.setdefault(obs.floor_id, []).append(obs)

    graph = {nid: [] for nid in nodes}

    for edge in edges:
        if edge.from_node_id in graph and edge.to_node_id in graph:
            n1 = nodes[edge.from_node_id]
            n2 = nodes[edge.to_node_id]
            # Check if edge intersects any obstacle on the same floor
            blocked = False
            floor_obs = obs_by_floor.get(n1.floor_id, [])
            for obs in floor_obs:
                if _segment_intersects_obstacle(n1.x, n1.y, n2.x, n2.y, obs):
                    blocked = True
                    break
            if not blocked:
                graph[edge.from_node_id].append((edge.to_node_id, edge.distance))
                graph[edge.to_node_id].append((edge.from_node_id, edge.distance))

    for nid, node in nodes.items():
        if node.connected_node_id and node.connected_node_id in nodes:
            graph[nid].append((node.connected_node_id, CROSS_FLOOR_DISTANCE))

    return nodes, graph


def _find_nearest_node(booth: Booth, nodes: dict) -> int | None:
    if booth.corridor_node_id and booth.corridor_node_id in nodes:
        return booth.corridor_node_id

    best_id = None
    best_dist = float('inf')
    bx = booth.x + booth.width / 2
    by = booth.y + booth.height / 2

    for nid, node in nodes.items():
        if node.floor_id == booth.floor_id and node.hall_id == booth.hall_id:
            dist = math.sqrt((node.x - bx) ** 2 + (node.y - by) ** 2)
            if dist < best_dist:
                best_dist = dist
                best_id = nid

    return best_id


def _dijkstra(graph: dict, start: int, end: int):
    dist = {n: float('inf') for n in graph}
    prev = {n: None for n in graph}
    dist[start] = 0
    pq = [(0, start)]

    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue
        if u == end:
            break
        for v, w in graph[u]:
            new_dist = dist[u] + w
            if new_dist < dist[v]:
                dist[v] = new_dist
                prev[v] = u
                heapq.heappush(pq, (new_dist, v))

    return dist, prev


def _reconstruct_path(prev: dict, nodes: dict, start: int, end: int) -> list:
    path = []
    current = end
    while current is not None:
        node = nodes[current]
        path.append({
            "x": node.x,
            "y": node.y,
            "floor_id": node.floor_id,
            "hall_id": node.hall_id,
        })
        current = prev[current]
    path.reverse()
    return path


def _parse_facility(f: Facility) -> dict:
    return {
        "id": f.id,
        "type": f.type,
        "subtype": f.subtype,
        "x": f.x,
        "y": f.y,
        "floor_id": f.floor_id,
        "hall_id": f.hall_id,
        "connected_floors": json.loads(f.connected_floors) if f.connected_floors and isinstance(f.connected_floors, str) else f.connected_floors,
        "name": json.loads(f.name) if f.name and isinstance(f.name, str) else f.name,
        "is_active": f.is_active,
        "created_at": f.created_at,
    }


@router.get("", response_model=RouteResponse)
def compute_route(
    from_booth_id: int,
    to_booth_id: int,
    db: Session = Depends(get_db),
):
    from_booth = db.query(Booth).filter(Booth.id == from_booth_id).first()
    to_booth = db.query(Booth).filter(Booth.id == to_booth_id).first()

    if not from_booth:
        raise HTTPException(status_code=404, detail="Source booth not found")
    if not to_booth:
        raise HTTPException(status_code=404, detail="Destination booth not found")

    nodes, graph = _build_graph(db)

    if not nodes:
        raise HTTPException(status_code=400, detail="No corridor network defined")

    start_node = _find_nearest_node(from_booth, nodes)
    end_node = _find_nearest_node(to_booth, nodes)

    if start_node is None:
        raise HTTPException(status_code=400, detail="No corridor node near source booth")
    if end_node is None:
        raise HTTPException(status_code=400, detail="No corridor node near destination booth")

    distances, prev = _dijkstra(graph, start_node, end_node)

    if distances[end_node] == float('inf'):
        raise HTTPException(status_code=404, detail="No route found between the booths")

    path = _reconstruct_path(prev, nodes, start_node, end_node)

    # Add booth center positions at start and end
    path.insert(0, {
        "x": from_booth.x + from_booth.width / 2,
        "y": from_booth.y + from_booth.height / 2,
        "floor_id": from_booth.floor_id,
        "hall_id": from_booth.hall_id,
    })
    path.append({
        "x": to_booth.x + to_booth.width / 2,
        "y": to_booth.y + to_booth.height / 2,
        "floor_id": to_booth.floor_id,
        "hall_id": to_booth.hall_id,
    })

    floors_visited = list(set(p["floor_id"] for p in path if p["floor_id"] is not None))

    facilities_used = []
    if len(floors_visited) > 1:
        facs = db.query(Facility).filter(
            Facility.type.in_(["stairs", "elevator", "escalator"]),
            Facility.is_active == True,
        ).all()
        seen_ids = set()
        for point in path:
            for fac in facs:
                if fac.id in seen_ids:
                    continue
                dist = math.sqrt((fac.x - point["x"]) ** 2 + (fac.y - point["y"]) ** 2)
                if dist < 150 and fac.floor_id == point["floor_id"]:
                    facilities_used.append(_parse_facility(fac))
                    seen_ids.add(fac.id)

    return RouteResponse(
        path=[RoutePoint(**p) for p in path],
        total_distance=round(distances[end_node], 2),
        floors_visited=floors_visited,
        facilities_used=facilities_used,
    )
