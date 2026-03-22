import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Obstacle
from schemas import ObstacleCreate, ObstacleUpdate, ObstacleResponse
from routers.auth import get_current_admin

router = APIRouter(prefix="/api/obstacles", tags=["obstacles"])


def _serialize_points(value):
    """list/dict → JSON string for DB storage."""
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)
    return value


def _parse_obstacle(obj: Obstacle) -> dict:
    """Parse obstacle for response — deserialize points JSON."""
    d = {
        "id": obj.id,
        "floor_id": obj.floor_id,
        "shape": obj.shape,
        "x": obj.x,
        "y": obj.y,
        "width": obj.width,
        "height": obj.height,
        "radius": obj.radius,
        "name": obj.name,
        "created_at": obj.created_at,
    }
    pts = obj.points
    if pts and isinstance(pts, str):
        try:
            d["points"] = json.loads(pts)
        except (json.JSONDecodeError, TypeError):
            d["points"] = pts
    else:
        d["points"] = pts
    return d


@router.get("", response_model=List[ObstacleResponse])
def list_obstacles(
    floor_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Obstacle)
    if floor_id is not None:
        query = query.filter(Obstacle.floor_id == floor_id)
    return [_parse_obstacle(o) for o in query.order_by(Obstacle.id).all()]


@router.get("/{obstacle_id}", response_model=ObstacleResponse)
def get_obstacle(obstacle_id: int, db: Session = Depends(get_db)):
    obj = db.query(Obstacle).filter(Obstacle.id == obstacle_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Obstacle not found")
    return _parse_obstacle(obj)


@router.post("", response_model=ObstacleResponse, status_code=201, dependencies=[Depends(get_current_admin)])
def create_obstacle(data: ObstacleCreate, db: Session = Depends(get_db)):
    d = data.model_dump()
    d["points"] = _serialize_points(d.get("points"))
    obj = Obstacle(**d)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _parse_obstacle(obj)


@router.put("/{obstacle_id}", response_model=ObstacleResponse, dependencies=[Depends(get_current_admin)])
def update_obstacle(obstacle_id: int, data: ObstacleUpdate, db: Session = Depends(get_db)):
    obj = db.query(Obstacle).filter(Obstacle.id == obstacle_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Obstacle not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        if key == "points":
            value = _serialize_points(value)
        setattr(obj, key, value)
    db.commit()
    db.refresh(obj)
    return _parse_obstacle(obj)


@router.delete("/{obstacle_id}", dependencies=[Depends(get_current_admin)])
def delete_obstacle(obstacle_id: int, db: Session = Depends(get_db)):
    obj = db.query(Obstacle).filter(Obstacle.id == obstacle_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Obstacle not found")
    db.delete(obj)
    db.commit()
    return {"message": "Obstacle deleted"}
