from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Amenity
from schemas import AmenityCreate, AmenityUpdate, AmenityResponse
from routers.auth import get_current_admin

router = APIRouter(prefix="/api/amenities", tags=["amenities"])


@router.get("", response_model=List[AmenityResponse])
def list_amenities(
    floor_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Amenity)
    if floor_id is not None:
        query = query.filter(Amenity.floor_id == floor_id)
    return query.order_by(Amenity.id).all()


@router.get("/{amenity_id}", response_model=AmenityResponse)
def get_amenity(amenity_id: int, db: Session = Depends(get_db)):
    amenity = db.query(Amenity).filter(Amenity.id == amenity_id).first()
    if not amenity:
        raise HTTPException(status_code=404, detail="Amenity not found")
    return amenity


@router.post("", response_model=AmenityResponse, status_code=201, dependencies=[Depends(get_current_admin)])
def create_amenity(data: AmenityCreate, db: Session = Depends(get_db)):
    amenity = Amenity(**data.model_dump())
    db.add(amenity)
    db.commit()
    db.refresh(amenity)
    return amenity


@router.put("/{amenity_id}", response_model=AmenityResponse, dependencies=[Depends(get_current_admin)])
def update_amenity(amenity_id: int, data: AmenityUpdate, db: Session = Depends(get_db)):
    amenity = db.query(Amenity).filter(Amenity.id == amenity_id).first()
    if not amenity:
        raise HTTPException(status_code=404, detail="Amenity not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(amenity, key, value)
    db.commit()
    db.refresh(amenity)
    return amenity


@router.delete("/{amenity_id}", dependencies=[Depends(get_current_admin)])
def delete_amenity(amenity_id: int, db: Session = Depends(get_db)):
    amenity = db.query(Amenity).filter(Amenity.id == amenity_id).first()
    if not amenity:
        raise HTTPException(status_code=404, detail="Amenity not found")
    db.delete(amenity)
    db.commit()
    return {"message": "Amenity deleted"}
