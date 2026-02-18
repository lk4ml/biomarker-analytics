from sqlalchemy import Column, Integer, String, SmallInteger, Text, Float, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.database import Base


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    pipeline_name = Column(String(100), nullable=False)
    indication = Column(String(100))
    status = Column(String(20), nullable=False)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True))
    records_processed = Column(Integer, default=0)
    records_created = Column(Integer, default=0)
    records_updated = Column(Integer, default=0)
    error_message = Column(Text)
    metadata_ = Column("metadata", JSONB)


class CutoffTrend(Base):
    __tablename__ = "cutoff_trends"

    id = Column(Integer, primary_key=True, autoincrement=True)
    biomarker_name = Column(String(100), nullable=False)
    tumor_type = Column(String(100), nullable=False)
    year = Column(SmallInteger, nullable=False)
    cutoff_value = Column(Float)
    cutoff_unit = Column(String(100))
    trial_count = Column(Integer, default=0)
    dominant_assay = Column(String(200))
    computed_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("biomarker_name", "tumor_type", "year", "cutoff_unit",
                         name="uq_cutoff_trend"),
    )
