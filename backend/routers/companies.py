import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Company
from schemas import CompanyCreate, CompanyUpdate, CompanyResponse
from routers.auth import get_current_admin

router = APIRouter(prefix="/api/companies", tags=["companies"])


def _parse_company(comp: Company) -> dict:
    result = {
        "id": comp.id,
        "name": json.loads(comp.name) if isinstance(comp.name, str) else comp.name,
        "category_id": comp.category_id,
        "description": json.loads(comp.description) if comp.description and isinstance(comp.description, str) else comp.description,
        "metadata_json": json.loads(comp.metadata_json) if comp.metadata_json and isinstance(comp.metadata_json, str) else comp.metadata_json,
        "created_at": comp.created_at,
        "category": None,
    }
    if comp.category:
        result["category"] = {
            "id": comp.category.id,
            "name": json.loads(comp.category.name) if isinstance(comp.category.name, str) else comp.category.name,
            "color": comp.category.color,
            "created_at": comp.category.created_at,
        }
    return result


@router.get("", response_model=List[CompanyResponse])
def list_companies(db: Session = Depends(get_db)):
    companies = db.query(Company).options(joinedload(Company.category)).all()
    return [_parse_company(c) for c in companies]


@router.post("", response_model=CompanyResponse, status_code=201, dependencies=[Depends(get_current_admin)])
def create_company(data: CompanyCreate, db: Session = Depends(get_db)):
    comp = Company(
        name=json.dumps(data.name, ensure_ascii=False),
        category_id=data.category_id,
        description=json.dumps(data.description, ensure_ascii=False) if data.description else None,
        metadata_json=json.dumps(data.metadata_json, ensure_ascii=False) if data.metadata_json else None,
    )
    db.add(comp)
    db.commit()
    db.refresh(comp)
    return _parse_company(comp)


@router.put("/{company_id}", response_model=CompanyResponse, dependencies=[Depends(get_current_admin)])
def update_company(company_id: int, data: CompanyUpdate, db: Session = Depends(get_db)):
    comp = db.query(Company).options(joinedload(Company.category)).filter(Company.id == company_id).first()
    if not comp:
        raise HTTPException(status_code=404, detail="Company not found")
    if data.name is not None:
        comp.name = json.dumps(data.name, ensure_ascii=False)
    if data.category_id is not None:
        comp.category_id = data.category_id
    if data.description is not None:
        comp.description = json.dumps(data.description, ensure_ascii=False)
    if data.metadata_json is not None:
        comp.metadata_json = json.dumps(data.metadata_json, ensure_ascii=False)
    db.commit()
    db.refresh(comp)
    return _parse_company(comp)


@router.delete("/{company_id}", dependencies=[Depends(get_current_admin)])
def delete_company(company_id: int, db: Session = Depends(get_db)):
    comp = db.query(Company).filter(Company.id == company_id).first()
    if not comp:
        raise HTTPException(status_code=404, detail="Company not found")
    db.delete(comp)
    db.commit()
    return {"message": "Company deleted"}
