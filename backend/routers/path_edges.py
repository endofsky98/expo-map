import math
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import PathEdge, PathNode
from schemas import PathEdgeCreate, PathEdgeUpdate, PathEdgeResponse
from routers.auth import get_current_admin

router = APIRouter(prefix="/api/path-edges", tags=["path-edges"])


@router.get("", response_model=List[PathEdgeResponse])
def list_path_edges(
    floor_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = db.query(PathEdge)
    if floor_id is not None:
        # Filter by joining to from_node's floor_id
        query = query.join(PathNode, PathEdge.from_node_id == PathNode.id).filter(
            PathNode.floor_id == floor_id
        )
    return query.order_by(PathEdge.id).all()


@router.get("/{edge_id}", response_model=PathEdgeResponse)
def get_path_edge(edge_id: int, db: Session = Depends(get_db)):
    edge = db.query(PathEdge).filter(PathEdge.id == edge_id).first()
    if not edge:
        raise HTTPException(status_code=404, detail="PathEdge not found")
    return edge


@router.post("", response_model=PathEdgeResponse, status_code=201, dependencies=[Depends(get_current_admin)])
def create_path_edge(data: PathEdgeCreate, db: Session = Depends(get_db)):
    from_node = db.query(PathNode).filter(PathNode.id == data.from_node_id).first()
    if not from_node:
        raise HTTPException(status_code=404, detail="from_node not found")
    to_node = db.query(PathNode).filter(PathNode.id == data.to_node_id).first()
    if not to_node:
        raise HTTPException(status_code=404, detail="to_node not found")

    # Calculate distance if not provided
    distance = data.distance
    if distance is None:
        distance = round(math.sqrt((to_node.x - from_node.x) ** 2 + (to_node.y - from_node.y) ** 2), 2)

    edge = PathEdge(
        from_node_id=data.from_node_id,
        to_node_id=data.to_node_id,
        distance=distance,
        is_open=data.is_open,
    )
    db.add(edge)
    db.commit()
    db.refresh(edge)
    return edge


@router.put("/{edge_id}", response_model=PathEdgeResponse, dependencies=[Depends(get_current_admin)])
def update_path_edge(edge_id: int, data: PathEdgeUpdate, db: Session = Depends(get_db)):
    edge = db.query(PathEdge).filter(PathEdge.id == edge_id).first()
    if not edge:
        raise HTTPException(status_code=404, detail="PathEdge not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(edge, key, value)
    db.commit()
    db.refresh(edge)
    return edge


@router.delete("/{edge_id}", dependencies=[Depends(get_current_admin)])
def delete_path_edge(edge_id: int, db: Session = Depends(get_db)):
    edge = db.query(PathEdge).filter(PathEdge.id == edge_id).first()
    if not edge:
        raise HTTPException(status_code=404, detail="PathEdge not found")
    db.delete(edge)
    db.commit()
    return {"message": "PathEdge deleted"}
