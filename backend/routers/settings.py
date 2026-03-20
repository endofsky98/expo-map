from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import Setting
from schemas import SettingResponse, SettingUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=List[SettingResponse])
def list_settings(db: Session = Depends(get_db)):
    return db.query(Setting).all()


@router.get("/{key}", response_model=SettingResponse)
def get_setting(key: str, db: Session = Depends(get_db)):
    setting = db.query(Setting).filter(Setting.key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    return setting


@router.put("/{key}", response_model=SettingResponse)
def update_setting(key: str, data: SettingUpdate, db: Session = Depends(get_db)):
    setting = db.query(Setting).filter(Setting.key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    setting.value = data.value
    db.commit()
    db.refresh(setting)
    return setting
