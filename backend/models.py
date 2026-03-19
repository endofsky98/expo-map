from datetime import datetime, timezone
from sqlalchemy import Column, Integer, Float, String, Text, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(Text, nullable=False)  # JSON i18n: {"ko": "...", "en": "..."}
    color = Column(String(7), nullable=False)  # hex e.g. #FF5733
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    companies = relationship("Company", back_populates="category")
    booths = relationship("Booth", back_populates="category")


class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(Text, nullable=False)  # JSON i18n
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    description = Column(Text, nullable=True)  # JSON i18n
    metadata_json = Column(Text, nullable=True)  # extensible key-value JSON
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    category = relationship("Category", back_populates="companies")
    booths = relationship("Booth", back_populates="company")


class Booth(Base):
    __tablename__ = "booths"

    id = Column(Integer, primary_key=True, index=True)
    booth_number = Column(String(50), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    x = Column(Float, nullable=False, default=0)
    y = Column(Float, nullable=False, default=0)
    width = Column(Float, nullable=False, default=80)
    height = Column(Float, nullable=False, default=60)
    color = Column(String(7), nullable=True)  # override category color
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    company = relationship("Company", back_populates="booths")
    category = relationship("Category", back_populates="booths")


class MapImage(Base):
    __tablename__ = "map_images"

    id = Column(Integer, primary_key=True, index=True)
    original_filename = Column(String(255), nullable=False)
    low_path = Column(String(500), nullable=False)
    medium_path = Column(String(500), nullable=False)
    high_path = Column(String(500), nullable=False)
    width = Column(Integer, nullable=False)  # original dimensions
    height = Column(Integer, nullable=False)
    is_current = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Language(Base):
    __tablename__ = "languages"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(10), unique=True, nullable=False)
    name = Column(String(50), nullable=False)
    is_default = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
