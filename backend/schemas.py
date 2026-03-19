from datetime import datetime
from typing import Optional, Any, List
from pydantic import BaseModel


# ---------- Floor ----------

class FloorCreate(BaseModel):
    name: dict
    order: int = 0

class FloorUpdate(BaseModel):
    name: Optional[dict] = None
    order: Optional[int] = None

class FloorResponse(BaseModel):
    id: int
    name: Any
    order: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---------- Hall ----------

class HallCreate(BaseModel):
    floor_id: int
    name: dict
    order: int = 0
    area_x: Optional[float] = None
    area_y: Optional[float] = None
    area_width: Optional[float] = None
    area_height: Optional[float] = None

class HallUpdate(BaseModel):
    floor_id: Optional[int] = None
    name: Optional[dict] = None
    order: Optional[int] = None
    area_x: Optional[float] = None
    area_y: Optional[float] = None
    area_width: Optional[float] = None
    area_height: Optional[float] = None

class HallResponse(BaseModel):
    id: int
    floor_id: int
    name: Any
    order: int
    area_x: Optional[float] = None
    area_y: Optional[float] = None
    area_width: Optional[float] = None
    area_height: Optional[float] = None
    created_at: Optional[datetime] = None
    floor: Optional[FloorResponse] = None

    class Config:
        from_attributes = True


# ---------- Category ----------

class CategoryCreate(BaseModel):
    name: dict
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
    floor_id: Optional[int] = None
    hall_id: Optional[int] = None
    x: float = 0
    y: float = 0
    width: float = 80
    height: float = 60
    color: Optional[str] = None
    is_active: bool = True
    corridor_node_id: Optional[int] = None

class BoothUpdate(BaseModel):
    booth_number: Optional[str] = None
    company_id: Optional[int] = None
    category_id: Optional[int] = None
    floor_id: Optional[int] = None
    hall_id: Optional[int] = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None
    corridor_node_id: Optional[int] = None

class BoothResponse(BaseModel):
    id: int
    booth_number: str
    company_id: Optional[int] = None
    category_id: Optional[int] = None
    floor_id: Optional[int] = None
    hall_id: Optional[int] = None
    x: float
    y: float
    width: float
    height: float
    color: Optional[str] = None
    is_active: bool
    corridor_node_id: Optional[int] = None
    created_at: Optional[datetime] = None
    company: Optional[CompanyResponse] = None
    category: Optional[CategoryResponse] = None
    floor: Optional[FloorResponse] = None
    hall: Optional[HallResponse] = None

    class Config:
        from_attributes = True


# ---------- MapImage ----------

class MapImageResponse(BaseModel):
    id: int
    original_filename: str
    low_path: str
    medium_path: str
    high_path: str
    zoom_levels: Any = None
    zoom_step_pixels: int = 512
    width: int
    height: int
    is_current: bool
    floor_id: Optional[int] = None
    hall_id: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---------- Facility ----------

class FacilityCreate(BaseModel):
    type: str
    subtype: Optional[str] = None
    x: float = 0
    y: float = 0
    floor_id: Optional[int] = None
    hall_id: Optional[int] = None
    connected_floors: Optional[list] = None
    name: Optional[dict] = None
    is_active: bool = True

class FacilityUpdate(BaseModel):
    type: Optional[str] = None
    subtype: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    floor_id: Optional[int] = None
    hall_id: Optional[int] = None
    connected_floors: Optional[list] = None
    name: Optional[dict] = None
    is_active: Optional[bool] = None

class FacilityResponse(BaseModel):
    id: int
    type: str
    subtype: Optional[str] = None
    x: float
    y: float
    floor_id: Optional[int] = None
    hall_id: Optional[int] = None
    connected_floors: Any = None
    name: Any = None
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---------- CorridorNode ----------

class CorridorNodeCreate(BaseModel):
    x: float
    y: float
    floor_id: Optional[int] = None
    hall_id: Optional[int] = None
    node_type: str = "intersection"
    connected_node_id: Optional[int] = None

class CorridorNodeUpdate(BaseModel):
    x: Optional[float] = None
    y: Optional[float] = None
    floor_id: Optional[int] = None
    hall_id: Optional[int] = None
    node_type: Optional[str] = None
    connected_node_id: Optional[int] = None

class CorridorNodeResponse(BaseModel):
    id: int
    x: float
    y: float
    floor_id: Optional[int] = None
    hall_id: Optional[int] = None
    node_type: str
    connected_node_id: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---------- CorridorEdge ----------

class CorridorEdgeCreate(BaseModel):
    from_node_id: int
    to_node_id: int
    distance: float
    is_open: bool = True

class CorridorEdgeUpdate(BaseModel):
    from_node_id: Optional[int] = None
    to_node_id: Optional[int] = None
    distance: Optional[float] = None
    is_open: Optional[bool] = None

class CorridorEdgeResponse(BaseModel):
    id: int
    from_node_id: int
    to_node_id: int
    distance: float
    is_open: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---------- Obstacle ----------

class ObstacleCreate(BaseModel):
    floor_id: int
    shape: str = "rectangle"
    x: float = 0
    y: float = 0
    width: Optional[float] = 40
    height: Optional[float] = 40
    radius: Optional[float] = None

class ObstacleUpdate(BaseModel):
    floor_id: Optional[int] = None
    shape: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    radius: Optional[float] = None

class ObstacleResponse(BaseModel):
    id: int
    floor_id: int
    shape: str
    x: float
    y: float
    width: Optional[float] = None
    height: Optional[float] = None
    radius: Optional[float] = None
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


# ---------- Auth ----------

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class AdminResponse(BaseModel):
    id: int
    username: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---------- Route ----------

class RoutePoint(BaseModel):
    x: float
    y: float
    floor_id: Optional[int] = None
    hall_id: Optional[int] = None

class RouteResponse(BaseModel):
    path: List[RoutePoint]
    total_distance: float
    floors_visited: List[int]
    facilities_used: List[FacilityResponse]
