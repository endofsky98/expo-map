from datetime import datetime, timezone
from sqlalchemy import Column, Integer, Float, String, Text, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base


class Floor(Base):
    __tablename__ = "floors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(Text, nullable=False)  # JSON i18n: {"ko": "...", "en": "..."}
    order = Column(Integer, default=0)
    zoom_size = Column(Integer, default=256)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    halls = relationship("Hall", back_populates="floor", cascade="all, delete-orphan")
    booths = relationship("Booth", back_populates="floor")
    facilities = relationship("Facility", back_populates="floor")
    corridor_nodes = relationship("CorridorNode", back_populates="floor")
    map_images = relationship("MapImage", back_populates="floor")
    obstacles = relationship("Obstacle", back_populates="floor", cascade="all, delete-orphan")
    path_nodes = relationship("PathNode", back_populates="floor")
    amenities = relationship("Amenity", back_populates="floor")


class Hall(Base):
    __tablename__ = "halls"

    id = Column(Integer, primary_key=True, index=True)
    floor_id = Column(Integer, ForeignKey("floors.id"), nullable=False)
    name = Column(Text, nullable=False)  # JSON i18n
    order = Column(Integer, default=0)
    area_x = Column(Float, nullable=True)
    area_y = Column(Float, nullable=True)
    area_width = Column(Float, nullable=True)
    area_height = Column(Float, nullable=True)
    shape = Column(String(20), default="rectangle")
    points = Column(Text, nullable=True)
    type = Column(String(20), default="hall")  # 'hall' or 'zone'
    display_name = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    floor = relationship("Floor", back_populates="halls")
    booths = relationship("Booth", back_populates="hall")
    facilities = relationship("Facility", back_populates="hall")
    corridor_nodes = relationship("CorridorNode", back_populates="hall")
    map_images = relationship("MapImage", back_populates="hall")
    path_nodes = relationship("PathNode", back_populates="hall")
    amenities = relationship("Amenity", back_populates="hall")


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(Text, nullable=False)  # JSON i18n
    color = Column(String(7), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    companies = relationship("Company", back_populates="category")
    booths = relationship("Booth", back_populates="category")


class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(Text, nullable=False)  # JSON i18n
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    description = Column(Text, nullable=True)  # JSON i18n
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    category = relationship("Category", back_populates="companies")
    booths = relationship("Booth", back_populates="company")


class Booth(Base):
    __tablename__ = "booths"

    id = Column(Integer, primary_key=True, index=True)
    booth_number = Column(String(50), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    floor_id = Column(Integer, ForeignKey("floors.id"), nullable=True)
    hall_id = Column(Integer, ForeignKey("halls.id"), nullable=True)
    x = Column(Float, nullable=False, default=0)
    y = Column(Float, nullable=False, default=0)
    width = Column(Float, nullable=False, default=80)
    height = Column(Float, nullable=False, default=60)
    color = Column(String(7), nullable=True)
    is_active = Column(Boolean, default=True)
    corridor_node_id = Column(Integer, nullable=True)
    shape = Column(String(20), default="rectangle")
    points = Column(Text, nullable=True)
    radius = Column(Float, nullable=True)
    radius_x = Column(Float, nullable=True)
    radius_y = Column(Float, nullable=True)
    rotation = Column(Float, default=0)
    display_name = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    company = relationship("Company", back_populates="booths")
    category = relationship("Category", back_populates="booths")
    floor = relationship("Floor", back_populates="booths")
    hall = relationship("Hall", back_populates="booths")


class MapImage(Base):
    __tablename__ = "map_images"

    id = Column(Integer, primary_key=True, index=True)
    original_filename = Column(String(255), nullable=False)
    low_path = Column(String(500), nullable=False)
    medium_path = Column(String(500), nullable=False)
    high_path = Column(String(500), nullable=False)
    zoom_levels = Column(Text, nullable=True)  # JSON: [{"level":1,"path":"/..","width":800},...]
    zoom_step_pixels = Column(Integer, default=512)
    tile_info = Column(Text, nullable=True)  # JSON: tile pyramid metadata
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    is_current = Column(Boolean, default=False)
    floor_id = Column(Integer, ForeignKey("floors.id"), nullable=True)
    hall_id = Column(Integer, ForeignKey("halls.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    floor = relationship("Floor", back_populates="map_images")
    hall = relationship("Hall", back_populates="map_images")


class Facility(Base):
    __tablename__ = "facilities"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String(50), nullable=False)  # restroom, emergency_exit, stairs, elevator, escalator
    subtype = Column(String(50), nullable=True)  # male, female, up, down, bidirectional
    x = Column(Float, nullable=False, default=0)
    y = Column(Float, nullable=False, default=0)
    floor_id = Column(Integer, ForeignKey("floors.id"), nullable=True)
    hall_id = Column(Integer, ForeignKey("halls.id"), nullable=True)
    connected_floors = Column(Text, nullable=True)  # JSON array of floor IDs
    name = Column(Text, nullable=True)  # JSON i18n
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    floor = relationship("Floor", back_populates="facilities")
    hall = relationship("Hall", back_populates="facilities")


class CorridorNode(Base):
    __tablename__ = "corridor_nodes"

    id = Column(Integer, primary_key=True, index=True)
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False)
    floor_id = Column(Integer, ForeignKey("floors.id"), nullable=True)
    hall_id = Column(Integer, ForeignKey("halls.id"), nullable=True)
    node_type = Column(String(50), nullable=False, default="intersection")
    connected_node_id = Column(Integer, nullable=True)  # cross-floor connection
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    floor = relationship("Floor", back_populates="corridor_nodes")
    hall = relationship("Hall", back_populates="corridor_nodes")


class CorridorEdge(Base):
    __tablename__ = "corridor_edges"

    id = Column(Integer, primary_key=True, index=True)
    from_node_id = Column(Integer, ForeignKey("corridor_nodes.id"), nullable=False)
    to_node_id = Column(Integer, ForeignKey("corridor_nodes.id"), nullable=False)
    distance = Column(Float, nullable=False)
    is_open = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    from_node = relationship("CorridorNode", foreign_keys=[from_node_id])
    to_node = relationship("CorridorNode", foreign_keys=[to_node_id])


class Obstacle(Base):
    __tablename__ = "obstacles"

    id = Column(Integer, primary_key=True, index=True)
    floor_id = Column(Integer, ForeignKey("floors.id"), nullable=False)
    shape = Column(String(20), nullable=False, default="rectangle")  # rectangle, circle, polygon
    x = Column(Float, nullable=False, default=0)
    y = Column(Float, nullable=False, default=0)
    width = Column(Float, nullable=True, default=40)
    height = Column(Float, nullable=True, default=40)
    radius = Column(Float, nullable=True)
    points = Column(Text, nullable=True)
    name = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    floor = relationship("Floor", back_populates="obstacles")


class Language(Base):
    __tablename__ = "languages"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(10), unique=True, nullable=False)
    name = Column(String(50), nullable=False)
    is_default = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)


class Admin(Base):
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class PathNode(Base):
    __tablename__ = "path_nodes"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String(50), nullable=False, default="waypoint")
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False)
    floor_id = Column(Integer, ForeignKey("floors.id"), nullable=True)
    hall_id = Column(Integer, ForeignKey("halls.id"), nullable=True)
    linked_node_id = Column(Integer, nullable=True)
    name = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    floor = relationship("Floor", back_populates="path_nodes")
    hall = relationship("Hall", back_populates="path_nodes")


class PathEdge(Base):
    __tablename__ = "path_edges"

    id = Column(Integer, primary_key=True, index=True)
    from_node_id = Column(Integer, ForeignKey("path_nodes.id", ondelete="CASCADE"), nullable=False)
    to_node_id = Column(Integer, ForeignKey("path_nodes.id", ondelete="CASCADE"), nullable=False)
    distance = Column(Float, nullable=False)
    is_open = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    from_node = relationship("PathNode", foreign_keys=[from_node_id])
    to_node = relationship("PathNode", foreign_keys=[to_node_id])


class Amenity(Base):
    __tablename__ = "amenities"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String(50), nullable=False)
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False)
    floor_id = Column(Integer, ForeignKey("floors.id"), nullable=True)
    hall_id = Column(Integer, ForeignKey("halls.id"), nullable=True)
    name = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    floor = relationship("Floor", back_populates="amenities")
    hall = relationship("Hall", back_populates="amenities")


class Setting(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
