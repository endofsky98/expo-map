import json
import os

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models import Category, Company, Booth, Language
from routers import booths, images, categories, companies

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")

app = FastAPI(title="Expo Map API", version="1.0.0")

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
app.include_router(booths.router)
app.include_router(images.router)
app.include_router(categories.router)
app.include_router(companies.router)


def _create_seed_data(db: Session) -> dict | None:
    """Create sample seed data. Returns None if data already exists."""
    existing = db.query(Category).count()
    if existing > 0:
        return None

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
        cat = Category(
            name=json.dumps(cat_data["name"], ensure_ascii=False),
            color=cat_data["color"],
        )
        db.add(cat)
        db_categories.append(cat)

    db.flush()

    # --- Companies (20 = 4 per category) ---
    companies_data = [
        # IT/전자 (4)
        {"name": {"ko": "테크스타", "en": "TechStar"}, "cat_idx": 0, "desc": {"ko": "AI 솔루션 기업", "en": "AI solutions company"}},
        {"name": {"ko": "클라우드넷", "en": "CloudNet"}, "cat_idx": 0, "desc": {"ko": "클라우드 인프라", "en": "Cloud infrastructure"}},
        {"name": {"ko": "칩마스터", "en": "ChipMaster"}, "cat_idx": 0, "desc": {"ko": "반도체 설계", "en": "Semiconductor design"}},
        {"name": {"ko": "디지털웨이브", "en": "DigitalWave"}, "cat_idx": 0, "desc": {"ko": "IoT 플랫폼", "en": "IoT platform"}},
        # 식품/음료 (4)
        {"name": {"ko": "맛나식품", "en": "Matna Foods"}, "cat_idx": 1, "desc": {"ko": "식품 가공", "en": "Food processing"}},
        {"name": {"ko": "프레시드링크", "en": "FreshDrink"}, "cat_idx": 1, "desc": {"ko": "음료 제조", "en": "Beverage manufacturing"}},
        {"name": {"ko": "그린팜", "en": "GreenFarm"}, "cat_idx": 1, "desc": {"ko": "유기농 식품", "en": "Organic foods"}},
        {"name": {"ko": "스위트베이커리", "en": "SweetBakery"}, "cat_idx": 1, "desc": {"ko": "베이커리 전문", "en": "Bakery specialty"}},
        # 의류/패션 (4)
        {"name": {"ko": "스타일하우스", "en": "StyleHouse"}, "cat_idx": 2, "desc": {"ko": "패션 브랜드", "en": "Fashion brand"}},
        {"name": {"ko": "트렌디웨어", "en": "TrendyWear"}, "cat_idx": 2, "desc": {"ko": "캐주얼 의류", "en": "Casual clothing"}},
        {"name": {"ko": "패션플러스", "en": "FashionPlus"}, "cat_idx": 2, "desc": {"ko": "럭셔리 패션", "en": "Luxury fashion"}},
        {"name": {"ko": "엘레강스", "en": "Elegance"}, "cat_idx": 2, "desc": {"ko": "여성 의류", "en": "Women's clothing"}},
        # 뷰티/헬스 (4)
        {"name": {"ko": "글로우스킨", "en": "GlowSkin"}, "cat_idx": 3, "desc": {"ko": "스킨케어 브랜드", "en": "Skincare brand"}},
        {"name": {"ko": "헬스케어플러스", "en": "HealthcarePlus"}, "cat_idx": 3, "desc": {"ko": "건강 관리", "en": "Health management"}},
        {"name": {"ko": "뷰티랩", "en": "BeautyLab"}, "cat_idx": 3, "desc": {"ko": "화장품 연구", "en": "Cosmetics R&D"}},
        {"name": {"ko": "웰니스코리아", "en": "WellnessKorea"}, "cat_idx": 3, "desc": {"ko": "웰니스 제품", "en": "Wellness products"}},
        # 기타 (4)
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

    # --- Booths: 50 booths in 10 columns x 5 rows ---
    booth_count = 0
    for row in range(5):
        for col in range(10):
            idx = row * 10 + col
            booth_number = f"{chr(65 + row)}-{col + 1:03d}"  # A-001 ... E-010

            company = db_companies[idx % len(db_companies)]
            category = db_categories[idx % len(db_categories)]

            x = 100 + col * 100
            y = 100 + row * 80
            width = 80.0
            height = 60.0

            booth = Booth(
                booth_number=booth_number,
                company_id=company.id,
                category_id=category.id,
                x=x,
                y=y,
                width=width,
                height=height,
                is_active=True,
            )
            db.add(booth)
            booth_count += 1

    db.commit()

    # --- Default Languages ---
    lang_ko = Language(code="ko", name="한국어", is_default=True, is_active=True)
    lang_en = Language(code="en", name="English", is_default=False, is_active=True)
    db.add(lang_ko)
    db.add(lang_en)
    db.commit()

    return {
        "message": "Seed data created successfully",
        "categories": len(db_categories),
        "companies": len(db_companies),
        "booths": booth_count,
        "languages": 2,
    }


@app.on_event("startup")
def on_startup():
    # Create all tables
    Base.metadata.create_all(bind=engine)
    # Create uploads directory
    os.makedirs(os.path.join(UPLOAD_DIR, "images"), exist_ok=True)
    # Auto-seed if database is empty
    db = next(get_db())
    try:
        result = _create_seed_data(db)
        if result:
            print(f"[startup] Auto-seeded: {result}")
        else:
            print("[startup] Database already has data, skipping seed.")
    finally:
        db.close()


# Mount static files for uploads (after startup so directory exists)
os.makedirs(os.path.join(UPLOAD_DIR, "images"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/")
def root():
    return {"message": "Expo Map API is running", "docs": "/docs"}


@app.post("/api/seed")
def seed_data(db: Session = Depends(get_db)):
    """Create sample seed data for testing."""
    result = _create_seed_data(db)
    if result is None:
        return {"message": "Seed data already exists. Delete existing data first."}
    return result
