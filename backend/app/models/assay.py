from sqlalchemy import Column, Integer, String, Boolean, ARRAY, DateTime
from sqlalchemy.sql import func
from app.database import Base


class Assay(Base):
    __tablename__ = "assays"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), unique=True, nullable=False)
    manufacturer = Column(String(200))
    platform = Column(String(100))
    antibody_clone = Column(String(100))
    fda_approved = Column(Boolean, default=False)
    companion_dx_for = Column(ARRAY(String))
    biomarker_names = Column(ARRAY(String))
    source = Column(String(50))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
