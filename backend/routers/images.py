import io
import json
import os
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from PIL import Image

from database import get_db
from models import MapImage, Floor
from schemas import MapImageResponse
from routers.auth import get_current_admin
from routers.tiles import generate_tile_pyramid, delete_tile_pyramid

router = APIRouter(prefix="/api/images", tags=["images"])

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(os.path.dirname(BASE_DIR), "uploads", "images")


def _resize_image(img: Image.Image, max_width: int) -> Image.Image:
    if img.width <= max_width:
        return img.copy()
    ratio = max_width / img.width
    new_height = int(img.height * ratio)
    return img.resize((max_width, new_height), Image.LANCZOS)


def _generate_zoom_levels(img: Image.Image, prefix: str, base_name: str, zoom_size: int) -> list:
    """Generate zoom level images using Image Pyramid (halving) approach.

    Process:
    1. Original image → highest zoom level
    2. Resize to half → next zoom level
    3. Repeat until both dimensions <= zoom_size
    Levels are numbered 0 (smallest) to N (original/largest).
    """
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    # Build pyramid from original down to zoom_size
    pyramid = []  # Will be reversed: index 0 = original, then halved...
    current = img.copy()
    pyramid.append(current)

    while current.width > zoom_size or current.height > zoom_size:
        new_w = max(1, current.width // 2)
        new_h = max(1, current.height // 2)
        current = current.resize((new_w, new_h), Image.LANCZOS)
        pyramid.append(current)

    # Reverse so level 0 = smallest, level N = original (largest)
    pyramid.reverse()

    levels = []
    for idx, resized in enumerate(pyramid):
        filename = f"{prefix}_{base_name}_zoom{idx}.jpg"
        filepath = os.path.join(UPLOAD_DIR, filename)
        resized.save(filepath, "JPEG", quality=85)
        levels.append({
            "level": idx,
            "path": f"/uploads/images/{filename}",
            "width": resized.width,
            "height": resized.height,
        })
    return levels


def _prepare_rgb(img: Image.Image) -> Image.Image:
    if img.mode in ("RGBA", "LA", "P"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
        return background
    elif img.mode != "RGB":
        return img.convert("RGB")
    return img


@router.get("/current", response_model=MapImageResponse)
def get_current_image(
    floor_id: Optional[int] = None,
    hall_id: Optional[int] = None,
    locale: Optional[str] = None,
    db: Session = Depends(get_db),
):
    base = db.query(MapImage).filter(MapImage.is_current == True)
    if floor_id is not None:
        base = base.filter(MapImage.floor_id == floor_id)
    if hall_id is not None:
        base = base.filter(MapImage.hall_id == hall_id)

    # locale 매칭 이미지 우선, 없으면 locale=null(공통) 이미지
    if locale:
        img = base.filter(MapImage.locale == locale).first()
        if not img:
            img = base.filter(MapImage.locale == None).first()
    else:
        img = base.filter(MapImage.locale == None).first() or base.first()

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
    locale: Optional[str] = Form(None),
    zoom_step_pixels: int = Form(256),
    db: Session = Depends(get_db),
):
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    content = file.file.read()
    img = Image.open(io.BytesIO(content))
    img = _prepare_rgb(img)

    original_width = img.width
    original_height = img.height
    prefix = uuid.uuid4().hex[:12]
    original_name = file.filename or "image.jpg"
    base_name = os.path.splitext(original_name)[0]

    # Determine zoom_size: use floor's zoom_size if floor_id provided, else form value
    zoom_size = zoom_step_pixels
    if floor_id:
        floor = db.query(Floor).filter(Floor.id == floor_id).first()
        if floor and floor.zoom_size:
            zoom_size = floor.zoom_size

    # Legacy 3-level images (low/medium/high)
    resolutions = {"low": 800, "medium": 2000, "high": 4000}
    paths = {}
    for res_name, max_w in resolutions.items():
        resized = _resize_image(img, max_w)
        filename = f"{prefix}_{base_name}_{res_name}.jpg"
        filepath = os.path.join(UPLOAD_DIR, filename)
        resized.save(filepath, "JPEG", quality=85)
        paths[res_name] = f"/uploads/images/{filename}"

    # Image pyramid zoom levels
    zoom_levels = _generate_zoom_levels(img, prefix, base_name, zoom_size)

    map_image = MapImage(
        original_filename=original_name,
        low_path=paths["low"],
        medium_path=paths["medium"],
        high_path=paths["high"],
        zoom_levels=json.dumps(zoom_levels),
        zoom_step_pixels=zoom_size,
        width=original_width,
        height=original_height,
        is_current=False,
        locale=locale if locale else None,
        floor_id=floor_id,
        hall_id=hall_id,
    )
    db.add(map_image)
    db.commit()
    db.refresh(map_image)

    # Generate tile pyramid
    try:
        tile_info = generate_tile_pyramid(map_image.id, img, zoom_size)
        map_image.tile_info = json.dumps(tile_info)
        db.commit()
        db.refresh(map_image)
    except Exception as e:
        print(f"[tiles] Warning: tile generation failed for image {map_image.id}: {e}")

    return map_image


@router.put("/{image_id}/reconfigure", response_model=MapImageResponse, dependencies=[Depends(get_current_admin)])
def reconfigure_image(image_id: int, zoom_size: int = 0, zoom_step_pixels: int = 0, db: Session = Depends(get_db)):
    """Reconfigure zoom levels for an existing image using image pyramid approach."""
    img_record = db.query(MapImage).filter(MapImage.id == image_id).first()
    if not img_record:
        raise HTTPException(status_code=404, detail="Image not found")

    # Use the high-res image to regenerate zoom levels
    high_path = os.path.join(os.path.dirname(BASE_DIR), img_record.high_path.lstrip("/"))
    if not os.path.exists(high_path):
        raise HTTPException(status_code=400, detail="Original high-res image file not found")

    # zoom_step_pixels is an alias for zoom_size (frontend compatibility)
    effective_zoom_size = zoom_size or zoom_step_pixels or 256

    img = Image.open(high_path)
    img = _prepare_rgb(img)

    prefix = uuid.uuid4().hex[:12]
    base_name = os.path.splitext(img_record.original_filename)[0]

    # Delete old zoom level files
    if img_record.zoom_levels:
        old_levels = json.loads(img_record.zoom_levels) if isinstance(img_record.zoom_levels, str) else img_record.zoom_levels
        for lv in (old_levels or []):
            old_path = os.path.join(os.path.dirname(BASE_DIR), lv["path"].lstrip("/"))
            if os.path.exists(old_path):
                os.remove(old_path)

    zoom_levels = _generate_zoom_levels(img, prefix, base_name, effective_zoom_size)
    img_record.zoom_levels = json.dumps(zoom_levels)
    img_record.zoom_step_pixels = effective_zoom_size

    # Generate tile pyramid
    try:
        img_full = Image.open(high_path)
        img_full = _prepare_rgb(img_full)
        tile_info = generate_tile_pyramid(img_record.id, img_full, effective_zoom_size)
        img_record.tile_info = json.dumps(tile_info)
        print(f"[tiles] Tile pyramid generated for image {img_record.id}: {len(tile_info['levels'])} levels, tile_size={effective_zoom_size}")
    except Exception as e:
        print(f"[tiles] Warning: tile generation failed for image {img_record.id}: {e}")
        import traceback; traceback.print_exc()

    db.commit()
    db.refresh(img_record)
    return img_record


@router.put("/regenerate-floor/{floor_id}", response_model=List[MapImageResponse], dependencies=[Depends(get_current_admin)])
def regenerate_floor_tiles(floor_id: int, db: Session = Depends(get_db)):
    """Regenerate all tile pyramids for a floor using its zoom_size setting."""
    floor = db.query(Floor).filter(Floor.id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")

    zoom_size = floor.zoom_size or 256
    images = db.query(MapImage).filter(MapImage.floor_id == floor_id).all()
    results = []

    for img_record in images:
        high_path = os.path.join(os.path.dirname(BASE_DIR), img_record.high_path.lstrip("/"))
        if not os.path.exists(high_path):
            continue

        img = Image.open(high_path)
        img = _prepare_rgb(img)

        prefix = uuid.uuid4().hex[:12]
        base_name = os.path.splitext(img_record.original_filename)[0]

        # Delete old zoom level files
        if img_record.zoom_levels:
            old_levels = json.loads(img_record.zoom_levels) if isinstance(img_record.zoom_levels, str) else img_record.zoom_levels
            for lv in (old_levels or []):
                old_path = os.path.join(os.path.dirname(BASE_DIR), lv["path"].lstrip("/"))
                if os.path.exists(old_path):
                    os.remove(old_path)

        zoom_levels = _generate_zoom_levels(img, prefix, base_name, zoom_size)
        img_record.zoom_levels = json.dumps(zoom_levels)
        img_record.zoom_step_pixels = zoom_size
        results.append(img_record)

    db.commit()
    for r in results:
        db.refresh(r)
    return results


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


@router.put("/{image_id}/update-floor", response_model=MapImageResponse, dependencies=[Depends(get_current_admin)])
def update_image_floor(image_id: int, floor_id: Optional[int] = None, hall_id: Optional[int] = None, locale: Optional[str] = None, db: Session = Depends(get_db)):
    img = db.query(MapImage).filter(MapImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    img.floor_id = floor_id
    img.hall_id = hall_id
    img.locale = locale if locale else None
    db.commit()
    db.refresh(img)
    return img


@router.delete("/{image_id}", dependencies=[Depends(get_current_admin)])
def delete_image(image_id: int, db: Session = Depends(get_db)):
    img = db.query(MapImage).filter(MapImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    # Delete legacy files
    for path in [img.low_path, img.medium_path, img.high_path]:
        file_path = os.path.join(os.path.dirname(BASE_DIR), path.lstrip("/"))
        if os.path.exists(file_path):
            os.remove(file_path)

    # Delete zoom level files
    if img.zoom_levels:
        levels = json.loads(img.zoom_levels) if isinstance(img.zoom_levels, str) else img.zoom_levels
        for lv in (levels or []):
            file_path = os.path.join(os.path.dirname(BASE_DIR), lv["path"].lstrip("/"))
            if os.path.exists(file_path):
                os.remove(file_path)

    db.delete(img)
    db.commit()
    return {"message": "Image deleted"}
