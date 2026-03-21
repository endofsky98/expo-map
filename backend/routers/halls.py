import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Hall
from schemas import HallCreate, HallUpdate, HallResponse
from routers.auth import get_current_admin

router = APIRouter(prefix="/api/halls", tags=["halls"])


def _parse_hall(hall: Hall) -> dict:
    result = {
        "id": hall.id,
        "floor_id": hall.floor_id,
        "name": json.loads(hall.name) if isinstance(hall.name, str) else hall.name,
        "order": hall.order,
        "area_x": hall.area_x,
        "area_y": hall.area_y,
        "area_width": hall.area_width,
        "area_height": hall.area_height,
        "shape": hall.shape if hall.shape is not None else "rectangle",
        "points": hall.points,
        "type": hall.type if hall.type is not None else "hall",
        "created_at": hall.created_at,
        "floor": None,
    }
    if hall.floor:
        result["floor"] = {
            "id": hall.floor.id,
            "name": json.loads(hall.floor.name) if isinstance(hall.floor.name, str) else hall.floor.name,
            "order": hall.floor.order,
            "created_at": hall.floor.created_at,
        }
    return result


@router.get("", response_model=List[HallResponse])
def list_halls(floor_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(Hall).options(joinedload(Hall.floor))
    if floor_id is not None:
        query = query.filter(Hall.floor_id == floor_id)
    halls = query.order_by(Hall.order).all()
    return [_parse_hall(h) for h in halls]


@router.get("/{hall_id}", response_model=HallResponse)
def get_hall(hall_id: int, db: Session = Depends(get_db)):
    hall = db.query(Hall).options(joinedload(Hall.floor)).filter(Hall.id == hall_id).first()
    if not hall:
        raise HTTPException(status_code=404, detail="Hall not found")
    return _parse_hall(hall)


@router.post("", response_model=HallResponse, status_code=201, dependencies=[Depends(get_current_admin)])
def create_hall(data: HallCreate, db: Session = Depends(get_db)):
    hall = Hall(
        floor_id=data.floor_id,
        name=json.dumps(data.name, ensure_ascii=False),
        order=data.order,
        area_x=data.area_x,
        area_y=data.area_y,
        area_width=data.area_width,
        area_height=data.area_height,
        shape=data.shape,
        points=data.points,
        type=data.type,
    )
    db.add(hall)
    db.commit()
    db.refresh(hall)
    hall = db.query(Hall).options(joinedload(Hall.floor)).filter(Hall.id == hall.id).first()
    return _parse_hall(hall)


@router.put("/{hall_id}", response_model=HallResponse, dependencies=[Depends(get_current_admin)])
def update_hall(hall_id: int, data: HallUpdate, db: Session = Depends(get_db)):
    hall = db.query(Hall).filter(Hall.id == hall_id).first()
    if not hall:
        raise HTTPException(status_code=404, detail="Hall not found")
    if data.floor_id is not None:
        hall.floor_id = data.floor_id
    if data.name is not None:
        hall.name = json.dumps(data.name, ensure_ascii=False)
    if data.order is not None:
        hall.order = data.order
    if data.area_x is not None:
        hall.area_x = data.area_x
    if data.area_y is not None:
        hall.area_y = data.area_y
    if data.area_width is not None:
        hall.area_width = data.area_width
    if data.area_height is not None:
        hall.area_height = data.area_height
    if data.shape is not None:
        hall.shape = data.shape
    if data.points is not None:
        hall.points = data.points
    if data.type is not None:
        hall.type = data.type
    db.commit()
    db.refresh(hall)
    hall = db.query(Hall).options(joinedload(Hall.floor)).filter(Hall.id == hall.id).first()
    return _parse_hall(hall)


@router.delete("/{hall_id}", dependencies=[Depends(get_current_admin)])
def delete_hall(hall_id: int, db: Session = Depends(get_db)):
    hall = db.query(Hall).filter(Hall.id == hall_id).first()
    if not hall:
        raise HTTPException(status_code=404, detail="Hall not found")
    db.delete(hall)
    db.commit()
    return {"message": "Hall deleted"}
