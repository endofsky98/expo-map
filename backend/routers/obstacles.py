from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Obstacle
from schemas import ObstacleCreate, ObstacleUpdate, ObstacleResponse
from routers.auth import get_current_admin

router = APIRouter(prefix="/api/obstacles", tags=["obstacles"])


@router.get("", response_model=List[ObstacleResponse])
def list_obstacles(
    floor_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Obstacle)
    if floor_id is not None:
        query = query.filter(Obstacle.floor_id == floor_id)
    return query.order_by(Obstacle.id).all()


@router.get("/{obstacle_id}", response_model=ObstacleResponse)
def get_obstacle(obstacle_id: int, db: Session = Depends(get_db)):
    obj = db.query(Obstacle).filter(Obstacle.id == obstacle_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Obstacle not found")
    return obj


@router.post("", response_model=ObstacleResponse, status_code=201, dependencies=[Depends(get_current_admin)])
def create_obstacle(data: ObstacleCreate, db: Session = Depends(get_db)):
    obj = Obstacle(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{obstacle_id}", response_model=ObstacleResponse, dependencies=[Depends(get_current_admin)])
def update_obstacle(obstacle_id: int, data: ObstacleUpdate, db: Session = Depends(get_db)):
    obj = db.query(Obstacle).filter(Obstacle.id == obstacle_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Obstacle not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{obstacle_id}", dependencies=[Depends(get_current_admin)])
def delete_obstacle(obstacle_id: int, db: Session = Depends(get_db)):
    obj = db.query(Obstacle).filter(Obstacle.id == obstacle_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Obstacle not found")
    db.delete(obj)
    db.commit()
    return {"message": "Obstacle deleted"}
