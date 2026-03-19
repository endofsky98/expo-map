import csv
import io
import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Booth, Company, Category
from schemas import BoothCreate, BoothUpdate, BoothResponse

router = APIRouter(prefix="/api/booths", tags=["booths"])


def _parse_booth(booth: Booth) -> dict:
    result = {
        "id": booth.id,
        "booth_number": booth.booth_number,
        "company_id": booth.company_id,
        "category_id": booth.category_id,
        "x": booth.x,
        "y": booth.y,
        "width": booth.width,
        "height": booth.height,
        "color": booth.color,
        "is_active": booth.is_active,
        "created_at": booth.created_at,
        "company": None,
        "category": None,
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
    return result


@router.get("/search", response_model=List[BoothResponse])
def search_booths(q: str = "", db: Session = Depends(get_db)):
    """Search booths by company name or category name across all i18n values."""
    if not q.strip():
        return []

    keyword = q.strip().lower()
    booths = (
        db.query(Booth)
        .options(joinedload(Booth.company), joinedload(Booth.category))
        .all()
    )

    results = []
    for booth in booths:
        matched = False
        # Search in company name (JSON i18n)
        if booth.company and booth.company.name:
            name_data = json.loads(booth.company.name) if isinstance(booth.company.name, str) else booth.company.name
            if isinstance(name_data, dict):
                for val in name_data.values():
                    if keyword in str(val).lower():
                        matched = True
                        break
        # Search in category name (JSON i18n)
        if not matched and booth.category and booth.category.name:
            name_data = json.loads(booth.category.name) if isinstance(booth.category.name, str) else booth.category.name
            if isinstance(name_data, dict):
                for val in name_data.values():
                    if keyword in str(val).lower():
                        matched = True
                        break
        # Search in booth_number
        if not matched and keyword in booth.booth_number.lower():
            matched = True

        if matched:
            results.append(_parse_booth(booth))

    return results


@router.get("/csv-template")
def download_csv_template():
    """Download CSV template for bulk booth upload."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["booth_number", "x", "y", "width", "height", "company_name", "category_name"])
    writer.writerow(["A-001", "100", "100", "80", "60", "Example Corp", "IT"])
    content = output.getvalue()
    output.close()

    return StreamingResponse(
        io.BytesIO(content.encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=booth_template.csv"},
    )


@router.get("", response_model=List[BoothResponse])
def list_booths(db: Session = Depends(get_db)):
    booths = (
        db.query(Booth)
        .options(joinedload(Booth.company), joinedload(Booth.category))
        .all()
    )
    return [_parse_booth(b) for b in booths]


@router.get("/{booth_id}", response_model=BoothResponse)
def get_booth(booth_id: int, db: Session = Depends(get_db)):
    booth = (
        db.query(Booth)
        .options(joinedload(Booth.company), joinedload(Booth.category))
        .filter(Booth.id == booth_id)
        .first()
    )
    if not booth:
        raise HTTPException(status_code=404, detail="Booth not found")
    return _parse_booth(booth)


@router.post("", response_model=BoothResponse, status_code=201)
def create_booth(data: BoothCreate, db: Session = Depends(get_db)):
    booth = Booth(
        booth_number=data.booth_number,
        company_id=data.company_id,
        category_id=data.category_id,
        x=data.x,
        y=data.y,
        width=data.width,
        height=data.height,
        color=data.color,
        is_active=data.is_active,
    )
    db.add(booth)
    db.commit()
    db.refresh(booth)
    # Re-query with joins
    booth = (
        db.query(Booth)
        .options(joinedload(Booth.company), joinedload(Booth.category))
        .filter(Booth.id == booth.id)
        .first()
    )
    return _parse_booth(booth)


@router.put("/{booth_id}", response_model=BoothResponse)
def update_booth(booth_id: int, data: BoothUpdate, db: Session = Depends(get_db)):
    booth = db.query(Booth).filter(Booth.id == booth_id).first()
    if not booth:
        raise HTTPException(status_code=404, detail="Booth not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(booth, key, value)

    db.commit()
    db.refresh(booth)
    booth = (
        db.query(Booth)
        .options(joinedload(Booth.company), joinedload(Booth.category))
        .filter(Booth.id == booth.id)
        .first()
    )
    return _parse_booth(booth)


@router.delete("/{booth_id}")
def delete_booth(booth_id: int, db: Session = Depends(get_db)):
    booth = db.query(Booth).filter(Booth.id == booth_id).first()
    if not booth:
        raise HTTPException(status_code=404, detail="Booth not found")
    db.delete(booth)
    db.commit()
    return {"message": "Booth deleted"}


@router.post("/upload-csv")
def upload_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Bulk upload booths from CSV file."""
    content = file.file.read()

    # Handle UTF-8 BOM
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

            company_id = None
            category_id = None

            # Find or create category by name
            if category_name:
                categories = db.query(Category).all()
                for cat in categories:
                    name_data = json.loads(cat.name) if isinstance(cat.name, str) else cat.name
                    if isinstance(name_data, dict):
                        for val in name_data.values():
                            if val.lower() == category_name.lower():
                                category_id = cat.id
                                break
                    if category_id:
                        break

            # Find company by name
            if company_name:
                companies = db.query(Company).all()
                for comp in companies:
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
                x=x,
                y=y,
                width=width,
                height=height,
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
