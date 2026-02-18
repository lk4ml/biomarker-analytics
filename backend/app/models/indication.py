from sqlalchemy import Column, Integer, String, ARRAY, DateTime
from sqlalchemy.sql import func
from app.database import Base


class Indication(Base):
    __tablename__ = "indications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    display_name = Column(String(200), nullable=False)
    ct_gov_terms = Column(ARRAY(String), nullable=False)
    efo_id = Column(String(50))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
