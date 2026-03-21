import math
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import PathNode
from schemas import PathNodeCreate, PathNodeUpdate, PathNodeResponse
from routers.auth import get_current_admin

router = APIRouter(prefix="/api/path-nodes", tags=["path-nodes"])


@router.get("", response_model=List[PathNodeResponse])
def list_path_nodes(
    floor_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = db.query(PathNode)
    if floor_id is not None:
        query = query.filter(PathNode.floor_id == floor_id)
    return query.order_by(PathNode.id).all()


@router.get("/{node_id}", response_model=PathNodeResponse)
def get_path_node(node_id: int, db: Session = Depends(get_db)):
    node = db.query(PathNode).filter(PathNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="PathNode not found")
    return node


@router.post("", response_model=PathNodeResponse, status_code=201, dependencies=[Depends(get_current_admin)])
def create_path_node(data: PathNodeCreate, db: Session = Depends(get_db)):
    node = PathNode(**data.model_dump())
    db.add(node)
    db.commit()
    db.refresh(node)
    return node


@router.put("/{node_id}", response_model=PathNodeResponse, dependencies=[Depends(get_current_admin)])
def update_path_node(node_id: int, data: PathNodeUpdate, db: Session = Depends(get_db)):
    node = db.query(PathNode).filter(PathNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="PathNode not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(node, key, value)
    db.commit()
    db.refresh(node)
    return node


@router.delete("/{node_id}", dependencies=[Depends(get_current_admin)])
def delete_path_node(node_id: int, db: Session = Depends(get_db)):
    node = db.query(PathNode).filter(PathNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="PathNode not found")
    db.delete(node)
    db.commit()
    return {"message": "PathNode deleted"}
