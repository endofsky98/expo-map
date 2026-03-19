from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import CorridorNode, CorridorEdge
from schemas import (
    CorridorNodeCreate, CorridorNodeUpdate, CorridorNodeResponse,
    CorridorEdgeCreate, CorridorEdgeUpdate, CorridorEdgeResponse,
)
from routers.auth import get_current_admin

router = APIRouter(prefix="/api", tags=["corridors"])


# --- Corridor Nodes ---

@router.get("/corridor-nodes", response_model=List[CorridorNodeResponse])
def list_nodes(
    floor_id: Optional[int] = None,
    hall_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = db.query(CorridorNode)
    if floor_id is not None:
        query = query.filter(CorridorNode.floor_id == floor_id)
    if hall_id is not None:
        query = query.filter(CorridorNode.hall_id == hall_id)
    return query.all()


@router.post("/corridor-nodes", response_model=CorridorNodeResponse, status_code=201, dependencies=[Depends(get_current_admin)])
def create_node(data: CorridorNodeCreate, db: Session = Depends(get_db)):
    node = CorridorNode(
        x=data.x, y=data.y,
        floor_id=data.floor_id, hall_id=data.hall_id,
        node_type=data.node_type,
        connected_node_id=data.connected_node_id,
    )
    db.add(node)
    db.commit()
    db.refresh(node)
    return node


@router.put("/corridor-nodes/{node_id}", response_model=CorridorNodeResponse, dependencies=[Depends(get_current_admin)])
def update_node(node_id: int, data: CorridorNodeUpdate, db: Session = Depends(get_db)):
    node = db.query(CorridorNode).filter(CorridorNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(node, key, value)
    db.commit()
    db.refresh(node)
    return node


@router.delete("/corridor-nodes/{node_id}", dependencies=[Depends(get_current_admin)])
def delete_node(node_id: int, db: Session = Depends(get_db)):
    node = db.query(CorridorNode).filter(CorridorNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    db.query(CorridorEdge).filter(
        (CorridorEdge.from_node_id == node_id) | (CorridorEdge.to_node_id == node_id)
    ).delete()
    db.delete(node)
    db.commit()
    return {"message": "Node and related edges deleted"}


# --- Corridor Edges ---

@router.get("/corridor-edges", response_model=List[CorridorEdgeResponse])
def list_edges(db: Session = Depends(get_db)):
    return db.query(CorridorEdge).all()


@router.post("/corridor-edges", response_model=CorridorEdgeResponse, status_code=201, dependencies=[Depends(get_current_admin)])
def create_edge(data: CorridorEdgeCreate, db: Session = Depends(get_db)):
    edge = CorridorEdge(
        from_node_id=data.from_node_id,
        to_node_id=data.to_node_id,
        distance=data.distance,
        is_open=data.is_open,
    )
    db.add(edge)
    db.commit()
    db.refresh(edge)
    return edge


@router.put("/corridor-edges/{edge_id}", response_model=CorridorEdgeResponse, dependencies=[Depends(get_current_admin)])
def update_edge(edge_id: int, data: CorridorEdgeUpdate, db: Session = Depends(get_db)):
    edge = db.query(CorridorEdge).filter(CorridorEdge.id == edge_id).first()
    if not edge:
        raise HTTPException(status_code=404, detail="Edge not found")
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(edge, key, value)
    db.commit()
    db.refresh(edge)
    return edge


@router.delete("/corridor-edges/{edge_id}", dependencies=[Depends(get_current_admin)])
def delete_edge(edge_id: int, db: Session = Depends(get_db)):
    edge = db.query(CorridorEdge).filter(CorridorEdge.id == edge_id).first()
    if not edge:
        raise HTTPException(status_code=404, detail="Edge not found")
    db.delete(edge)
    db.commit()
    return {"message": "Edge deleted"}
