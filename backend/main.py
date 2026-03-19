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

# CORS - allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(booths.router)
app.include_router(images.router)
app.include_router(categories.router)
app.include_router(companies.router)


@app.on_event("startup")
def on_startup():
    # Create all tables
    Base.metadata.create_all(bind=engine)
    # Create uploads directory
    os.makedirs(os.path.join(UPLOAD_DIR, "images"), exist_ok=True)


# Mount static files for uploads (after startup so directory exists)
os.makedirs(os.path.join(UPLOAD_DIR, "images"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/")
def root():
    return {"message": "Expo Map API is running", "docs": "/docs"}


@app.post("/api/seed")
def seed_data(db: Session = Depends(get_db)):
    """Create sample seed data for testing."""

    # Check if data already exists
    existing = db.query(Category).count()
    if existing > 0:
        return {"message": "Seed data already exists. Delete existing data first."}

    # --- Categories ---
    categories_data = [
        {"name": {"ko": "IT/소프트웨어", "en": "IT/Software"}, "color": "#4A90D9"},
        {"name": {"ko": "전자/반도체", "en": "Electronics/Semiconductor"}, "color": "#E74C3C"},
        {"name": {"ko": "자동차", "en": "Automotive"}, "color": "#2ECC71"},
        {"name": {"ko": "식품/음료", "en": "Food/Beverage"}, "color": "#F39C12"},
        {"name": {"ko": "화학/소재", "en": "Chemical/Materials"}, "color": "#9B59B6"},
    ]

    db_categories = []
    for cat_data in categories_data:
        cat = Category(
            name=json.dumps(cat_data["name"], ensure_ascii=False),
            color=cat_data["color"],
        )
        db.add(cat)
        db_categories.append(cat)

    db.flush()  # Get IDs assigned

    # --- Companies ---
    companies_data = [
        {"name": {"ko": "테크놀로지", "en": "TechnoLogic"}, "cat_idx": 0, "desc": {"ko": "AI 솔루션 기업", "en": "AI solutions company"}},
        {"name": {"ko": "클라우드넷", "en": "CloudNet"}, "cat_idx": 0, "desc": {"ko": "클라우드 인프라", "en": "Cloud infrastructure"}},
        {"name": {"ko": "삼전전자", "en": "SamJeon Electronics"}, "cat_idx": 1, "desc": {"ko": "반도체 제조", "en": "Semiconductor manufacturing"}},
        {"name": {"ko": "하이칩스", "en": "HiChips"}, "cat_idx": 1, "desc": {"ko": "칩 설계", "en": "Chip design"}},
        {"name": {"ko": "모터스코리아", "en": "Motors Korea"}, "cat_idx": 2, "desc": {"ko": "전기차 제조", "en": "EV manufacturing"}},
        {"name": {"ko": "오토파츠", "en": "AutoParts"}, "cat_idx": 2, "desc": {"ko": "자동차 부품", "en": "Auto parts"}},
        {"name": {"ko": "맛나식품", "en": "Matna Foods"}, "cat_idx": 3, "desc": {"ko": "식품 가공", "en": "Food processing"}},
        {"name": {"ko": "프레시드링크", "en": "FreshDrink"}, "cat_idx": 3, "desc": {"ko": "음료 제조", "en": "Beverage manufacturing"}},
        {"name": {"ko": "케미랩", "en": "ChemiLab"}, "cat_idx": 4, "desc": {"ko": "화학 소재 연구", "en": "Chemical materials research"}},
        {"name": {"ko": "소재플러스", "en": "MaterialPlus"}, "cat_idx": 4, "desc": {"ko": "신소재 개발", "en": "New materials development"}},
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

            # Assign company (cycle through 10 companies)
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
