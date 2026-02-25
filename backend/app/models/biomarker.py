from sqlalchemy import Column, Integer, String, Text, ARRAY, DateTime, ForeignKey, Boolean, Float, UniqueConstraint
from sqlalchemy.sql import func
from app.database import Base


class Biomarker(Base):
    __tablename__ = "biomarkers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    aliases = Column(ARRAY(String), nullable=False, default=[])
    category = Column(String(50), nullable=False)
    description = Column(Text)
    gene_symbol = Column(String(50))
    ensembl_id = Column(String(50))
    uniprot_id = Column(String(20))
    search_terms = Column(ARRAY(String), nullable=False, default=[])
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TrialBiomarker(Base):
    __tablename__ = "trial_biomarkers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    trial_id = Column(Integer, ForeignKey("trials.id", ondelete="CASCADE"), nullable=False, index=True)
    biomarker_id = Column(Integer, ForeignKey("biomarkers.id", ondelete="CASCADE"), nullable=False, index=True)

    biomarker_name = Column(String(100), nullable=False, index=True)

    cutoff_value = Column(String(100))
    cutoff_unit = Column(String(100))
    cutoff_operator = Column(String(20))
    cutoff_raw_text = Column(Text)

    assay_name = Column(String(200), index=True)
    assay_manufacturer = Column(String(200))
    assay_platform = Column(String(100))
    companion_diagnostic = Column(Boolean, default=False)

    biomarker_role = Column(String(50), index=True)
    biomarker_context = Column(String(200))

    tumor_type = Column(String(100), index=True)
    therapeutic_setting = Column(String(50), index=True)

    variant_name = Column(String(100), index=True)

    extraction_source = Column(String(50))
    extraction_confidence = Column(Float, default=0.5)
    extraction_method = Column(String(50))
    raw_snippet = Column(Text)

    extracted_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("trial_id", "biomarker_id", "cutoff_value", "cutoff_unit",
                         name="uq_trial_biomarker_cutoff"),
    )
