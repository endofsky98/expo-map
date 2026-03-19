import csv
import io
import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Booth, Company, Category
from schemas import BoothCreate, BoothUpdate, BoothResponse
from routers.auth import get_current_admin

router = APIRouter(prefix="/api/booths", tags=["booths"])


def _parse_booth(booth: Booth) -> dict:
    result = {
        "id": booth.id,
        "booth_number": booth.booth_number,
        "company_id": booth.company_id,
        "category_id": booth.category_id,
        "floor_id": booth.floor_id,
        "hall_id": booth.hall_id,
        "x": booth.x,
        "y": booth.y,
        "width": booth.width,
        "height": booth.height,
        "color": booth.color,
        "is_active": booth.is_active,
        "corridor_node_id": booth.corridor_node_id,
        "created_at": booth.created_at,
        "company": None,
        "category": None,
        "floor": None,
        "hall": None,
    }
    if booth.company:
        result["company"] = {
            "id": booth.company.id,
            "name": json.loads(booth.company.name) if isinstance(booth.company.name, str) else booth.company.name,
            "category_id": booth.company.category_id,
            "description": json.loads(booth.company.description) if booth.company.description and isinstance(booth.company.description, str) else booth.company.description,
            "metadata_json": json.loads(booth.company.metadata_json) if booth.company.metadata_json and isinstance(booth.company.metadata_json, str) else booth.company.metadata_json,
            "created_at": booth.company.created_at,
        }
    if booth.category:
        result["category"] = {
            "id": booth.category.id,
            "name": json.loads(booth.category.name) if isinstance(booth.category.name, str) else booth.category.name,
            "color": booth.category.color,
            "created_at": booth.category.created_at,
        }
    if booth.floor:
        result["floor"] = {
            "id": booth.floor.id,
            "name": json.loads(booth.floor.name) if isinstance(booth.floor.name, str) else booth.floor.name,
            "order": booth.floor.order,
            "created_at": booth.floor.created_at,
        }
    if booth.hall:
        result["hall"] = {
            "id": booth.hall.id,
            "floor_id": booth.hall.floor_id,
            "name": json.loads(booth.hall.name) if isinstance(booth.hall.name, str) else booth.hall.name,
            "order": booth.hall.order,
            "created_at": booth.hall.created_at,
        }
    return result


def _booth_query(db: Session):
    return db.query(Booth).options(
        joinedload(Booth.company),
        joinedload(Booth.category),
        joinedload(Booth.floor),
        joinedload(Booth.hall),
    )


@router.get("/search", response_model=List[BoothResponse])
def search_booths(q: str = "", db: Session = Depends(get_db)):
    if not q.strip():
        return []
    keyword = q.strip().lower()
    booths = _booth_query(db).all()

    results = []
    for booth in booths:
        matched = False
        if booth.company and booth.company.name:
            name_data = json.loads(booth.company.name) if isinstance(booth.company.name, str) else booth.company.name
            if isinstance(name_data, dict):
                for val in name_data.values():
                    if keyword in str(val).lower():
                        matched = True
                        break
        if not matched and booth.category and booth.category.name:
            name_data = json.loads(booth.category.name) if isinstance(booth.category.name, str) else booth.category.name
            if isinstance(name_data, dict):
                for val in name_data.values():
                    if keyword in str(val).lower():
                        matched = True
                        break
        if not matched and keyword in booth.booth_number.lower():
            matched = True

        if matched:
            results.append(_parse_booth(booth))

    return results


@router.get("/csv-template")
def download_csv_template():
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["booth_number", "x", "y", "width", "height", "company_name", "category_name", "floor_id", "hall_id"])
    writer.writerow(["A-001", "100", "100", "80", "60", "Example Corp", "IT", "1", "1"])
    content = output.getvalue()
    output.close()
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=booth_template.csv"},
    )


@router.get("", response_model=List[BoothResponse])
def list_booths(
    floor_id: Optional[int] = None,
    hall_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = _booth_query(db)
    if floor_id is not None:
        query = query.filter(Booth.floor_id == floor_id)
    if hall_id is not None:
        query = query.filter(Booth.hall_id == hall_id)
    booths = query.all()
    return [_parse_booth(b) for b in booths]


@router.get("/{booth_id}", response_model=BoothResponse)
def get_booth(booth_id: int, db: Session = Depends(get_db)):
    booth = _booth_query(db).filter(Booth.id == booth_id).first()
    if not booth:
        raise HTTPException(status_code=404, detail="Booth not found")
    return _parse_booth(booth)


@router.post("", response_model=BoothResponse, status_code=201, dependencies=[Depends(get_current_admin)])
def create_booth(data: BoothCreate, db: Session = Depends(get_db)):
    booth = Booth(
        booth_number=data.booth_number,
        company_id=data.company_id,
        category_id=data.category_id,
        floor_id=data.floor_id,
        hall_id=data.hall_id,
        x=data.x, y=data.y,
        width=data.width, height=data.height,
        color=data.color,
        is_active=data.is_active,
        corridor_node_id=data.corridor_node_id,
    )
    db.add(booth)
    db.commit()
    db.refresh(booth)
    booth = _booth_query(db).filter(Booth.id == booth.id).first()
    return _parse_booth(booth)


@router.put("/{booth_id}", response_model=BoothResponse, dependencies=[Depends(get_current_admin)])
def update_booth(booth_id: int, data: BoothUpdate, db: Session = Depends(get_db)):
    booth = db.query(Booth).filter(Booth.id == booth_id).first()
    if not booth:
        raise HTTPException(status_code=404, detail="Booth not found")
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(booth, key, value)
    db.commit()
    db.refresh(booth)
    booth = _booth_query(db).filter(Booth.id == booth.id).first()
    return _parse_booth(booth)


@router.delete("/{booth_id}", dependencies=[Depends(get_current_admin)])
def delete_booth(booth_id: int, db: Session = Depends(get_db)):
    booth = db.query(Booth).filter(Booth.id == booth_id).first()
    if not booth:
        raise HTTPException(status_code=404, detail="Booth not found")
    db.delete(booth)
    db.commit()
    return {"message": "Booth deleted"}


@router.post("/upload-csv", dependencies=[Depends(get_current_admin)])
def upload_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = file.file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    created = 0
    errors = []

    for row_num, row in enumerate(reader, start=2):
        try:
            booth_number = row.get("booth_number", "").strip()
            if not booth_number:
                errors.append(f"Row {row_num}: missing booth_number")
                continue

            x = float(row.get("x", 0))
            y = float(row.get("y", 0))
            width = float(row.get("width", 80))
            height = float(row.get("height", 60))
            company_name = row.get("company_name", "").strip()
            category_name = row.get("category_name", "").strip()
            floor_id_str = row.get("floor_id", "").strip()
            hall_id_str = row.get("hall_id", "").strip()

            company_id = None
            category_id = None
            floor_id = int(floor_id_str) if floor_id_str else None
            hall_id = int(hall_id_str) if hall_id_str else None

            if category_name:
                for cat in db.query(Category).all():
                    name_data = json.loads(cat.name) if isinstance(cat.name, str) else cat.name
                    if isinstance(name_data, dict):
                        for val in name_data.values():
                            if val.lower() == category_name.lower():
                                category_id = cat.id
                                break
                    if category_id:
                        break

            if company_name:
                for comp in db.query(Company).all():
                    name_data = json.loads(comp.name) if isinstance(comp.name, str) else comp.name
                    if isinstance(name_data, dict):
                        for val in name_data.values():
                            if val.lower() == company_name.lower():
                                company_id = comp.id
                                break
                    if company_id:
                        break

            booth = Booth(
                booth_number=booth_number,
                company_id=company_id,
                category_id=category_id,
                floor_id=floor_id,
                hall_id=hall_id,
                x=x, y=y,
                width=width, height=height,
            )
            db.add(booth)
            created += 1

        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")

    db.commit()

    return {
        "message": f"CSV upload complete. {created} booths created.",
        "created": created,
        "errors": errors,
    }
