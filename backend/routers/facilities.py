import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Facility
from schemas import FacilityCreate, FacilityUpdate, FacilityResponse
from routers.auth import get_current_admin

router = APIRouter(prefix="/api/facilities", tags=["facilities"])


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


@router.get("", response_model=List[FacilityResponse])
def list_facilities(
    floor_id: Optional[int] = None,
    hall_id: Optional[int] = None,
    type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Facility)
    if floor_id is not None:
        query = query.filter(Facility.floor_id == floor_id)
    if hall_id is not None:
        query = query.filter(Facility.hall_id == hall_id)
    if type is not None:
        query = query.filter(Facility.type == type)
    return [_parse_facility(f) for f in query.all()]


@router.get("/{facility_id}", response_model=FacilityResponse)
def get_facility(facility_id: int, db: Session = Depends(get_db)):
    f = db.query(Facility).filter(Facility.id == facility_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Facility not found")
    return _parse_facility(f)


@router.post("", response_model=FacilityResponse, status_code=201, dependencies=[Depends(get_current_admin)])
def create_facility(data: FacilityCreate, db: Session = Depends(get_db)):
    f = Facility(
        type=data.type,
        subtype=data.subtype,
        x=data.x,
        y=data.y,
        floor_id=data.floor_id,
        hall_id=data.hall_id,
        connected_floors=json.dumps(data.connected_floors) if data.connected_floors else None,
        name=json.dumps(data.name, ensure_ascii=False) if data.name else None,
        is_active=data.is_active,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return _parse_facility(f)


@router.put("/{facility_id}", response_model=FacilityResponse, dependencies=[Depends(get_current_admin)])
def update_facility(facility_id: int, data: FacilityUpdate, db: Session = Depends(get_db)):
    f = db.query(Facility).filter(Facility.id == facility_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Facility not found")
    if data.type is not None:
        f.type = data.type
    if data.subtype is not None:
        f.subtype = data.subtype
    if data.x is not None:
        f.x = data.x
    if data.y is not None:
        f.y = data.y
    if data.floor_id is not None:
        f.floor_id = data.floor_id
    if data.hall_id is not None:
        f.hall_id = data.hall_id
    if data.connected_floors is not None:
        f.connected_floors = json.dumps(data.connected_floors)
    if data.name is not None:
        f.name = json.dumps(data.name, ensure_ascii=False)
    if data.is_active is not None:
        f.is_active = data.is_active
    db.commit()
    db.refresh(f)
    return _parse_facility(f)


@router.delete("/{facility_id}", dependencies=[Depends(get_current_admin)])
def delete_facility(facility_id: int, db: Session = Depends(get_db)):
    f = db.query(Facility).filter(Facility.id == facility_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Facility not found")
    db.delete(f)
    db.commit()
    return {"message": "Facility deleted"}
