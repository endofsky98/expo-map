import json
import math
import os

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models import (
    Floor, Hall, Category, Company, Booth, Language, Admin,
    Facility, CorridorNode, CorridorEdge,
)
from routers import booths, images, categories, companies
from routers import auth, floors, halls, facilities, corridors, route
from routers.auth import hash_password

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")

app = FastAPI(title="Expo Map API", version="2.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3009",
        "http://3.36.108.114:3009",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(floors.router)
app.include_router(halls.router)
app.include_router(booths.router)
app.include_router(images.router)
app.include_router(categories.router)
app.include_router(companies.router)
app.include_router(facilities.router)
app.include_router(corridors.router)
app.include_router(route.router)


def _create_seed_data(db: Session) -> dict | None:
    """Create v2 seed data with floors, halls, facilities, corridors."""
    existing = db.query(Category).count()
    if existing > 0:
        return None

    # --- Floors (2) ---
    floor1 = Floor(name=json.dumps({"ko": "1층", "en": "1F"}, ensure_ascii=False), order=1)
    floor2 = Floor(name=json.dumps({"ko": "2층", "en": "2F"}, ensure_ascii=False), order=2)
    db.add_all([floor1, floor2])
    db.flush()

    # --- Halls (4) ---
    hall_1a = Hall(floor_id=floor1.id, name=json.dumps({"ko": "A홀", "en": "Hall A"}, ensure_ascii=False), order=1)
    hall_1b = Hall(floor_id=floor1.id, name=json.dumps({"ko": "B홀", "en": "Hall B"}, ensure_ascii=False), order=2)
    hall_2a = Hall(floor_id=floor2.id, name=json.dumps({"ko": "A홀", "en": "Hall A"}, ensure_ascii=False), order=1)
    hall_2b = Hall(floor_id=floor2.id, name=json.dumps({"ko": "B홀", "en": "Hall B"}, ensure_ascii=False), order=2)
    db.add_all([hall_1a, hall_1b, hall_2a, hall_2b])
    db.flush()

    all_halls = [
        (floor1, hall_1a), (floor1, hall_1b),
        (floor2, hall_2a), (floor2, hall_2b),
    ]

    # --- Categories (5) ---
    categories_data = [
        {"name": {"ko": "IT/전자", "en": "IT/Electronics"}, "color": "#4A90D9"},
        {"name": {"ko": "식품/음료", "en": "Food/Beverage"}, "color": "#E74C3C"},
        {"name": {"ko": "의류/패션", "en": "Clothing/Fashion"}, "color": "#2ECC71"},
        {"name": {"ko": "뷰티/헬스", "en": "Beauty/Health"}, "color": "#F39C12"},
        {"name": {"ko": "기타", "en": "Others"}, "color": "#9B59B6"},
    ]
    db_categories = []
    for cat_data in categories_data:
        cat = Category(name=json.dumps(cat_data["name"], ensure_ascii=False), color=cat_data["color"])
        db.add(cat)
        db_categories.append(cat)
    db.flush()

    # --- Companies (20) ---
    companies_data = [
        {"name": {"ko": "테크스타", "en": "TechStar"}, "cat_idx": 0, "desc": {"ko": "AI 솔루션 기업", "en": "AI solutions company"}},
        {"name": {"ko": "클라우드넷", "en": "CloudNet"}, "cat_idx": 0, "desc": {"ko": "클라우드 인프라", "en": "Cloud infrastructure"}},
        {"name": {"ko": "칩마스터", "en": "ChipMaster"}, "cat_idx": 0, "desc": {"ko": "반도체 설계", "en": "Semiconductor design"}},
        {"name": {"ko": "디지털웨이브", "en": "DigitalWave"}, "cat_idx": 0, "desc": {"ko": "IoT 플랫폼", "en": "IoT platform"}},
        {"name": {"ko": "맛나식품", "en": "Matna Foods"}, "cat_idx": 1, "desc": {"ko": "식품 가공", "en": "Food processing"}},
        {"name": {"ko": "프레시드링크", "en": "FreshDrink"}, "cat_idx": 1, "desc": {"ko": "음료 제조", "en": "Beverage manufacturing"}},
        {"name": {"ko": "그린팜", "en": "GreenFarm"}, "cat_idx": 1, "desc": {"ko": "유기농 식품", "en": "Organic foods"}},
        {"name": {"ko": "스위트베이커리", "en": "SweetBakery"}, "cat_idx": 1, "desc": {"ko": "베이커리 전문", "en": "Bakery specialty"}},
        {"name": {"ko": "스타일하우스", "en": "StyleHouse"}, "cat_idx": 2, "desc": {"ko": "패션 브랜드", "en": "Fashion brand"}},
        {"name": {"ko": "트렌디웨어", "en": "TrendyWear"}, "cat_idx": 2, "desc": {"ko": "캐주얼 의류", "en": "Casual clothing"}},
        {"name": {"ko": "패션플러스", "en": "FashionPlus"}, "cat_idx": 2, "desc": {"ko": "럭셔리 패션", "en": "Luxury fashion"}},
        {"name": {"ko": "엘레강스", "en": "Elegance"}, "cat_idx": 2, "desc": {"ko": "여성 의류", "en": "Women's clothing"}},
        {"name": {"ko": "글로우스킨", "en": "GlowSkin"}, "cat_idx": 3, "desc": {"ko": "스킨케어 브랜드", "en": "Skincare brand"}},
        {"name": {"ko": "헬스케어플러스", "en": "HealthcarePlus"}, "cat_idx": 3, "desc": {"ko": "건강 관리", "en": "Health management"}},
        {"name": {"ko": "뷰티랩", "en": "BeautyLab"}, "cat_idx": 3, "desc": {"ko": "화장품 연구", "en": "Cosmetics R&D"}},
        {"name": {"ko": "웰니스코리아", "en": "WellnessKorea"}, "cat_idx": 3, "desc": {"ko": "웰니스 제품", "en": "Wellness products"}},
        {"name": {"ko": "이노베이트", "en": "Innovate"}, "cat_idx": 4, "desc": {"ko": "혁신 컨설팅", "en": "Innovation consulting"}},
        {"name": {"ko": "글로벌파트너스", "en": "GlobalPartners"}, "cat_idx": 4, "desc": {"ko": "국제 비즈니스", "en": "International business"}},
        {"name": {"ko": "스마트솔루션", "en": "SmartSolutions"}, "cat_idx": 4, "desc": {"ko": "스마트 기술", "en": "Smart technology"}},
        {"name": {"ko": "에코그린", "en": "EcoGreen"}, "cat_idx": 4, "desc": {"ko": "친환경 소재", "en": "Eco-friendly materials"}},
    ]
    db_companies = []
    for comp_data in companies_data:
        comp = Company(
            name=json.dumps(comp_data["name"], ensure_ascii=False),
            category_id=db_categories[comp_data["cat_idx"]].id,
            description=json.dumps(comp_data["desc"], ensure_ascii=False),
        )
        db.add(comp)
        db_companies.append(comp)
    db.flush()

    # --- Booths (50 total: 13+12+13+12 per hall) ---
    prefixes = ["A", "B", "C", "D"]
    counts = [13, 12, 13, 12]
    booth_total = 0
    all_booths_by_hall = {}  # hall_id -> list of booths

    for hall_idx, (floor, hall) in enumerate(all_halls):
        prefix = prefixes[hall_idx]
        count = counts[hall_idx]
        hall_booths = []
        for i in range(count):
            row = i // 4
            col = i % 4
            x = 80.0 + col * 100
            y = 80.0 + row * 80
            booth_number = f"{prefix}-{i + 1:03d}"
            comp = db_companies[(booth_total + i) % len(db_companies)]
            cat = db_categories[(booth_total + i) % len(db_categories)]
            booth = Booth(
                booth_number=booth_number,
                company_id=comp.id,
                category_id=cat.id,
                floor_id=floor.id,
                hall_id=hall.id,
                x=x, y=y,
                width=80.0, height=60.0,
                is_active=True,
            )
            db.add(booth)
            hall_booths.append(booth)
        all_booths_by_hall[hall.id] = hall_booths
        booth_total += count

    db.flush()

    # --- Facilities (6 per hall = 24 total) ---
    facility_templates = [
        {"type": "restroom", "subtype": "male", "x": 500, "y": 80,
         "name": {"ko": "남자 화장실", "en": "Men's Restroom"}},
        {"type": "restroom", "subtype": "female", "x": 500, "y": 160,
         "name": {"ko": "여자 화장실", "en": "Women's Restroom"}},
        {"type": "emergency_exit", "subtype": None, "x": 20, "y": 50,
         "name": {"ko": "비상구 1", "en": "Emergency Exit 1"}},
        {"type": "emergency_exit", "subtype": None, "x": 20, "y": 280,
         "name": {"ko": "비상구 2", "en": "Emergency Exit 2"}},
        {"type": "stairs", "subtype": None, "x": 520, "y": 240,
         "name": {"ko": "계단", "en": "Stairs"}},
        {"type": "elevator", "subtype": None, "x": 540, "y": 120,
         "name": {"ko": "엘리베이터", "en": "Elevator"}},
    ]

    for floor, hall in all_halls:
        other_floor_id = floor2.id if floor.id == floor1.id else floor1.id
        for ft in facility_templates:
            connected = None
            if ft["type"] in ("stairs", "elevator"):
                connected = json.dumps([other_floor_id])
            fac = Facility(
                type=ft["type"],
                subtype=ft["subtype"],
                x=ft["x"], y=ft["y"],
                floor_id=floor.id,
                hall_id=hall.id,
                connected_floors=connected,
                name=json.dumps(ft["name"], ensure_ascii=False),
                is_active=True,
            )
            db.add(fac)

    db.flush()

    # --- Corridor Nodes (10 per hall = 40 total) ---
    node_templates = [
        {"x": 40, "y": 160, "type": "entrance"},
        {"x": 130, "y": 160, "type": "intersection"},
        {"x": 230, "y": 160, "type": "intersection"},
        {"x": 330, "y": 160, "type": "intersection"},
        {"x": 430, "y": 160, "type": "intersection"},
        {"x": 130, "y": 100, "type": "booth_entry"},
        {"x": 230, "y": 100, "type": "booth_entry"},
        {"x": 330, "y": 100, "type": "booth_entry"},
        {"x": 500, "y": 160, "type": "facility_entry"},
        {"x": 530, "y": 200, "type": "facility_entry"},  # elevator/stairs entry
    ]

    # Edge template: (from_idx, to_idx) within a hall's 10 nodes
    edge_templates = [
        (0, 1), (1, 2), (2, 3), (3, 4), (4, 8),
        (1, 5), (2, 6), (3, 7), (8, 9),
    ]

    hall_nodes = {}  # hall_id -> list of CorridorNode objects

    for floor, hall in all_halls:
        nodes = []
        for nt in node_templates:
            node = CorridorNode(
                x=nt["x"], y=nt["y"],
                floor_id=floor.id, hall_id=hall.id,
                node_type=nt["type"],
            )
            db.add(node)
            nodes.append(node)
        hall_nodes[hall.id] = nodes

    db.flush()

    # Cross-floor connections: node[9] (elevator/stairs entry) connects across floors
    # 1F-A ↔ 2F-A, 1F-B ↔ 2F-B
    cross_pairs = [
        (hall_1a.id, hall_2a.id),
        (hall_1b.id, hall_2b.id),
    ]
    for h1_id, h2_id in cross_pairs:
        n1 = hall_nodes[h1_id][9]
        n2 = hall_nodes[h2_id][9]
        n1.connected_node_id = n2.id
        n2.connected_node_id = n1.id

    db.flush()

    # Assign corridor_node_id to booths (nearest booth_entry node)
    for hall_id, booths_list in all_booths_by_hall.items():
        nodes = hall_nodes[hall_id]
        entry_nodes = [n for n in nodes if n.node_type in ("booth_entry", "intersection")]
        for booth in booths_list:
            bx = booth.x + booth.width / 2
            by = booth.y + booth.height / 2
            best_node = min(entry_nodes, key=lambda n: math.sqrt((n.x - bx) ** 2 + (n.y - by) ** 2))
            booth.corridor_node_id = best_node.id

    db.flush()

    # --- Corridor Edges ---
    for hall_id, nodes in hall_nodes.items():
        for from_idx, to_idx in edge_templates:
            n1 = nodes[from_idx]
            n2 = nodes[to_idx]
            dist = math.sqrt((n2.x - n1.x) ** 2 + (n2.y - n1.y) ** 2)
            edge = CorridorEdge(
                from_node_id=n1.id,
                to_node_id=n2.id,
                distance=round(dist, 2),
                is_open=True,
            )
            db.add(edge)

    db.commit()

    # --- Default Languages ---
    db.add(Language(code="ko", name="한국어", is_default=True, is_active=True))
    db.add(Language(code="en", name="English", is_default=False, is_active=True))
    db.commit()

    # --- Admin Account ---
    admin = Admin(
        username="admin",
        password_hash=hash_password("admin1234"),
    )
    db.add(admin)
    db.commit()

    return {
        "message": "v2 seed data created successfully",
        "floors": 2,
        "halls": 4,
        "categories": 5,
        "companies": 20,
        "booths": booth_total,
        "facilities": 24,
        "corridor_nodes": 40,
        "corridor_edges": len(edge_templates) * 4,
        "admin": "admin / admin1234",
    }


@app.on_event("startup")
def on_startup():
    # Check if schema migration needed (v1 -> v2)
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    if "floors" not in existing_tables:
        print("[startup] Schema migration: dropping old tables and recreating for v2...")
        Base.metadata.drop_all(bind=engine)

    Base.metadata.create_all(bind=engine)
    os.makedirs(os.path.join(UPLOAD_DIR, "images"), exist_ok=True)

    db = next(get_db())
    try:
        result = _create_seed_data(db)
        if result:
            print(f"[startup] Auto-seeded: {result}")
        else:
            print("[startup] Database already has data, skipping seed.")
    finally:
        db.close()


# Mount static files for uploads
os.makedirs(os.path.join(UPLOAD_DIR, "images"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/")
def root():
    return {"message": "Expo Map API v2 is running", "docs": "/docs"}


@app.post("/api/seed")
def seed_data(db: Session = Depends(get_db)):
    result = _create_seed_data(db)
    if result is None:
        return {"message": "Seed data already exists. Delete existing data first."}
    return result
