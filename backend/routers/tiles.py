import json
import os
import shutil

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from PIL import Image

from database import get_db
from models import MapImage, Floor
from routers.auth import get_current_admin

router = APIRouter(prefix="/api/tiles", tags=["tiles"])

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TILES_DIR = os.path.join(os.path.dirname(BASE_DIR), "uploads", "tiles")


def generate_tile_pyramid(image_id: int, img: Image.Image, tile_size: int) -> dict:
    """Generate tile pyramid files and return tile_info metadata.

    Level 0 = highest resolution (original).
    Level N = lowest resolution.
    Tiles saved at: uploads/tiles/{image_id}/level_{n}/{row}_{col}.jpg
    """
    tile_dir = os.path.join(TILES_DIR, str(image_id))
    if os.path.exists(tile_dir):
        shutil.rmtree(tile_dir)

    levels_info = []
    current = img.copy()
    level = 0

    while True:
        level_dir = os.path.join(tile_dir, f"level_{level}")
        os.makedirs(level_dir, exist_ok=True)

        w, h = current.size
        cols = -(-w // tile_size)  # ceil division
        rows = -(-h // tile_size)

        for row in range(rows):
            for col in range(cols):
                left = col * tile_size
                top = row * tile_size
                right = min(left + tile_size, w)
                bottom = min(top + tile_size, h)
                tile = current.crop((left, top, right, bottom))
                tile_path = os.path.join(level_dir, f"{row}_{col}.jpg")
                tile.save(tile_path, "JPEG", quality=85)

        levels_info.append({
            "level": level,
            "width": w,
            "height": h,
            "cols": cols,
            "rows": rows,
        })

        if w <= tile_size and h <= tile_size:
            break

        new_w = max(1, w // 2)
        new_h = max(1, h // 2)
        current = current.resize((new_w, new_h), Image.LANCZOS)
        level += 1

    return {
        "tile_size": tile_size,
        "levels": levels_info,
    }


def delete_tile_pyramid(image_id: int):
    """Delete tile pyramid directory for an image."""
    tile_dir = os.path.join(TILES_DIR, str(image_id))
    if os.path.exists(tile_dir):
        shutil.rmtree(tile_dir)


@router.get("/{image_id}/{level}/{row}/{col}")
def get_tile(image_id: int, level: int, row: int, col: int):
    """Serve a single tile image."""
    tile_path = os.path.join(TILES_DIR, str(image_id), f"level_{level}", f"{row}_{col}.jpg")
    if not os.path.exists(tile_path):
        raise HTTPException(status_code=404, detail="Tile not found")
    return FileResponse(tile_path, media_type="image/jpeg")


@router.post("/{image_id}/regenerate", dependencies=[Depends(get_current_admin)])
def regenerate_tiles(image_id: int, db: Session = Depends(get_db)):
    """Regenerate tile pyramid for an existing image."""
    img_record = db.query(MapImage).filter(MapImage.id == image_id).first()
    if not img_record:
        raise HTTPException(status_code=404, detail="Image not found")

    high_path = os.path.join(os.path.dirname(BASE_DIR), img_record.high_path.lstrip("/"))
    if not os.path.exists(high_path):
        raise HTTPException(status_code=400, detail="High-res image file not found")

    img = Image.open(high_path)
    # Prepare RGB
    if img.mode in ("RGBA", "LA", "P"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        bg.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")

    # Determine tile_size from floor
    tile_size = 256
    if img_record.floor_id:
        floor = db.query(Floor).filter(Floor.id == img_record.floor_id).first()
        if floor and floor.zoom_size:
            tile_size = floor.zoom_size

    tile_info = generate_tile_pyramid(img_record.id, img, tile_size)
    img_record.tile_info = json.dumps(tile_info)
    db.commit()
    db.refresh(img_record)
    return {"message": "Tiles regenerated", "tile_info": tile_info}
