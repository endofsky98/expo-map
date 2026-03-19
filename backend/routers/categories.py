import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Category
from schemas import CategoryCreate, CategoryUpdate, CategoryResponse

router = APIRouter(prefix="/api/categories", tags=["categories"])


def _parse_category(cat: Category) -> dict:
    return {
        "id": cat.id,
        "name": json.loads(cat.name) if isinstance(cat.name, str) else cat.name,
        "color": cat.color,
        "created_at": cat.created_at,
    }


@router.get("", response_model=List[CategoryResponse])
def list_categories(db: Session = Depends(get_db)):
    categories = db.query(Category).all()
    return [_parse_category(c) for c in categories]


@router.post("", response_model=CategoryResponse, status_code=201)
def create_category(data: CategoryCreate, db: Session = Depends(get_db)):
    cat = Category(
        name=json.dumps(data.name, ensure_ascii=False),
        color=data.color,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return _parse_category(cat)


@router.put("/{category_id}", response_model=CategoryResponse)
def update_category(category_id: int, data: CategoryUpdate, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if data.name is not None:
        cat.name = json.dumps(data.name, ensure_ascii=False)
    if data.color is not None:
        cat.color = data.color
    db.commit()
    db.refresh(cat)
    return _parse_category(cat)


@router.delete("/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(cat)
    db.commit()
    return {"message": "Category deleted"}
