from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel


# ---------- Category ----------

class CategoryCreate(BaseModel):
    name: dict  # {"ko": "...", "en": "..."}
    color: str

class CategoryUpdate(BaseModel):
    name: Optional[dict] = None
    color: Optional[str] = None

class CategoryResponse(BaseModel):
    id: int
    name: Any
    color: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---------- Company ----------

class CompanyCreate(BaseModel):
    name: dict
    category_id: Optional[int] = None
    description: Optional[dict] = None
    metadata_json: Optional[dict] = None

class CompanyUpdate(BaseModel):
    name: Optional[dict] = None
    category_id: Optional[int] = None
    description: Optional[dict] = None
    metadata_json: Optional[dict] = None

class CompanyResponse(BaseModel):
    id: int
    name: Any
    category_id: Optional[int] = None
    description: Any = None
    metadata_json: Any = None
    created_at: Optional[datetime] = None
    category: Optional[CategoryResponse] = None

    class Config:
        from_attributes = True


# ---------- Booth ----------

class BoothCreate(BaseModel):
    booth_number: str
    company_id: Optional[int] = None
    category_id: Optional[int] = None
    x: float = 0
    y: float = 0
    width: float = 80
    height: float = 60
    color: Optional[str] = None
    is_active: bool = True

class BoothUpdate(BaseModel):
    booth_number: Optional[str] = None
    company_id: Optional[int] = None
    category_id: Optional[int] = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None

class BoothResponse(BaseModel):
    id: int
    booth_number: str
    company_id: Optional[int] = None
    category_id: Optional[int] = None
    x: float
    y: float
    width: float
    height: float
    color: Optional[str] = None
    is_active: bool
    created_at: Optional[datetime] = None
    company: Optional[CompanyResponse] = None
    category: Optional[CategoryResponse] = None

    class Config:
        from_attributes = True


# ---------- MapImage ----------

class MapImageResponse(BaseModel):
    id: int
    original_filename: str
    low_path: str
    medium_path: str
    high_path: str
    width: int
    height: int
    is_current: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---------- Language ----------

class LanguageCreate(BaseModel):
    code: str
    name: str
    is_default: bool = False
    is_active: bool = True

class LanguageUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None

class LanguageResponse(BaseModel):
    id: int
    code: str
    name: str
    is_default: bool
    is_active: bool

    class Config:
        from_attributes = True
