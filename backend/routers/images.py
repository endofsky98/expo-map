import os
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from PIL import Image

from database import get_db
from models import MapImage
from schemas import MapImageResponse
from routers.auth import get_current_admin

router = APIRouter(prefix="/api/images", tags=["images"])

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(os.path.dirname(BASE_DIR), "uploads", "images")


def _resize_image(img: Image.Image, max_width: int) -> Image.Image:
    if img.width <= max_width:
        return img.copy()
    ratio = max_width / img.width
    new_height = int(img.height * ratio)
    return img.resize((max_width, new_height), Image.LANCZOS)


@router.get("/current", response_model=MapImageResponse)
def get_current_image(
    floor_id: Optional[int] = None,
    hall_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = db.query(MapImage).filter(MapImage.is_current == True)
    if floor_id is not None:
        query = query.filter(MapImage.floor_id == floor_id)
    if hall_id is not None:
        query = query.filter(MapImage.hall_id == hall_id)
    img = query.first()
    if not img:
        raise HTTPException(status_code=404, detail="No current map image set")
    return img


@router.get("", response_model=List[MapImageResponse])
def list_images(
    floor_id: Optional[int] = None,
    hall_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = db.query(MapImage)
    if floor_id is not None:
        query = query.filter(MapImage.floor_id == floor_id)
    if hall_id is not None:
        query = query.filter(MapImage.hall_id == hall_id)
    return query.order_by(MapImage.created_at.desc()).all()


@router.post("/upload", response_model=MapImageResponse, status_code=201, dependencies=[Depends(get_current_admin)])
def upload_image(
    file: UploadFile = File(...),
    floor_id: Optional[int] = Form(None),
    hall_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
):
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    content = file.file.read()
    img = Image.open(__import__("io").BytesIO(content))

    if img.mode in ("RGBA", "LA", "P"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    original_width = img.width
    original_height = img.height
    prefix = uuid.uuid4().hex[:12]
    original_name = file.filename or "image.jpg"
    base_name = os.path.splitext(original_name)[0]

    resolutions = {"low": 800, "medium": 2000, "high": 4000}
    paths = {}
    for res_name, max_w in resolutions.items():
        resized = _resize_image(img, max_w)
        filename = f"{prefix}_{base_name}_{res_name}.jpg"
        filepath = os.path.join(UPLOAD_DIR, filename)
        resized.save(filepath, "JPEG", quality=85)
        paths[res_name] = f"/uploads/images/{filename}"

    map_image = MapImage(
        original_filename=original_name,
        low_path=paths["low"],
        medium_path=paths["medium"],
        high_path=paths["high"],
        width=original_width,
        height=original_height,
        is_current=False,
        floor_id=floor_id,
        hall_id=hall_id,
    )
    db.add(map_image)
    db.commit()
    db.refresh(map_image)
    return map_image


@router.put("/{image_id}/set-current", response_model=MapImageResponse, dependencies=[Depends(get_current_admin)])
def set_current_image(image_id: int, db: Session = Depends(get_db)):
    img = db.query(MapImage).filter(MapImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    # Unset current for same floor/hall scope
    scope = db.query(MapImage)
    if img.floor_id is not None:
        scope = scope.filter(MapImage.floor_id == img.floor_id)
    if img.hall_id is not None:
        scope = scope.filter(MapImage.hall_id == img.hall_id)
    scope.update({MapImage.is_current: False})
    img.is_current = True
    db.commit()
    db.refresh(img)
    return img


@router.delete("/{image_id}", dependencies=[Depends(get_current_admin)])
def delete_image(image_id: int, db: Session = Depends(get_db)):
    img = db.query(MapImage).filter(MapImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    for path in [img.low_path, img.medium_path, img.high_path]:
        file_path = os.path.join(os.path.dirname(BASE_DIR), path.lstrip("/"))
        if os.path.exists(file_path):
            os.remove(file_path)
    db.delete(img)
    db.commit()
    return {"message": "Image deleted"}
