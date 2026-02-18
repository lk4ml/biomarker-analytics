from sqlalchemy import Column, Integer, String, SmallInteger, Date, Text, ARRAY, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.database import Base


class Trial(Base):
    __tablename__ = "trials"

    id = Column(Integer, primary_key=True, autoincrement=True)
    nct_id = Column(String(20), unique=True, nullable=False, index=True)
    brief_title = Column(Text, nullable=False)
    official_title = Column(Text)
    overall_status = Column(String(50), nullable=False, index=True)
    phase = Column(String(30), index=True)
    phases_raw = Column(ARRAY(String))
    study_type = Column(String(50))

    lead_sponsor_name = Column(String(300), index=True)
    lead_sponsor_class = Column(String(50), index=True)
    collaborators = Column(JSONB)

    start_date = Column(Date)
    start_year = Column(SmallInteger, index=True)
    completion_date = Column(Date)
    primary_completion = Column(Date)

    enrollment_count = Column(Integer)
    enrollment_type = Column(String(30))

    brief_summary = Column(Text)
    eligibility_criteria = Column(Text)

    conditions = Column(ARRAY(String))
    keywords = Column(ARRAY(String))

    interventions = Column(JSONB)
    primary_outcomes = Column(JSONB)
    secondary_outcomes = Column(JSONB)

    allocation = Column(String(50))
    intervention_model = Column(String(50))
    primary_purpose = Column(String(50))
    masking = Column(String(100))

    sex = Column(String(10))
    minimum_age = Column(String(30))
    maximum_age = Column(String(30))

    detected_tumor_type = Column(String(100))
    detected_setting = Column(String(50))

    raw_json = Column(JSONB)
    ingested_at = Column(DateTime(timezone=True), server_default=func.now())
    nlp_processed_at = Column(DateTime(timezone=True))
    nlp_version = Column(String(20))

    __table_args__ = (
        Index("idx_trials_conditions", "conditions", postgresql_using="gin"),
    )


class TrialIndication(Base):
    __tablename__ = "trial_indications"

    trial_id = Column(Integer, ForeignKey("trials.id", ondelete="CASCADE"), primary_key=True)
    indication_id = Column(Integer, ForeignKey("indications.id", ondelete="CASCADE"), primary_key=True)
    confidence = Column(Integer, default=1)
