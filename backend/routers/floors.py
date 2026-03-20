import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Floor
from schemas import FloorCreate, FloorUpdate, FloorResponse
from routers.auth import get_current_admin

router = APIRouter(prefix="/api/floors", tags=["floors"])


def _parse_floor(floor: Floor) -> dict:
    return {
        "id": floor.id,
        "name": json.loads(floor.name) if isinstance(floor.name, str) else floor.name,
        "order": floor.order,
        "zoom_size": floor.zoom_size or 256,
        "created_at": floor.created_at,
    }


@router.get("", response_model=List[FloorResponse])
def list_floors(db: Session = Depends(get_db)):
    floors = db.query(Floor).order_by(Floor.order).all()
    return [_parse_floor(f) for f in floors]


@router.get("/{floor_id}", response_model=FloorResponse)
def get_floor(floor_id: int, db: Session = Depends(get_db)):
    floor = db.query(Floor).filter(Floor.id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")
    return _parse_floor(floor)


@router.post("", response_model=FloorResponse, status_code=201, dependencies=[Depends(get_current_admin)])
def create_floor(data: FloorCreate, db: Session = Depends(get_db)):
    floor = Floor(
        name=json.dumps(data.name, ensure_ascii=False),
        order=data.order,
        zoom_size=data.zoom_size,
    )
    db.add(floor)
    db.commit()
    db.refresh(floor)
    return _parse_floor(floor)


@router.put("/{floor_id}", response_model=FloorResponse, dependencies=[Depends(get_current_admin)])
def update_floor(floor_id: int, data: FloorUpdate, db: Session = Depends(get_db)):
    floor = db.query(Floor).filter(Floor.id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")
    if data.name is not None:
        floor.name = json.dumps(data.name, ensure_ascii=False)
    if data.order is not None:
        floor.order = data.order
    if data.zoom_size is not None:
        floor.zoom_size = data.zoom_size
    db.commit()
    db.refresh(floor)
    return _parse_floor(floor)


@router.delete("/{floor_id}", dependencies=[Depends(get_current_admin)])
def delete_floor(floor_id: int, db: Session = Depends(get_db)):
    floor = db.query(Floor).filter(Floor.id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")
    db.delete(floor)
    db.commit()
    return {"message": "Floor deleted"}
