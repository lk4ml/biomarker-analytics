from sqlalchemy import Column, Integer, String, Text, ARRAY, DateTime, Float, Date, Boolean, SmallInteger, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, DOUBLE_PRECISION
from sqlalchemy.sql import func
from app.database import Base


class OpenTargetsAssociation(Base):
    __tablename__ = "open_targets_associations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    target_ensembl_id = Column(String(50), nullable=False)
    target_symbol = Column(String(50), nullable=False)
    target_name = Column(String(200))
    disease_efo_id = Column(String(50), nullable=False)
    disease_name = Column(String(200))
    association_score = Column(Float)
    datatype_scores = Column(JSONB)
    fetched_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("target_ensembl_id", "disease_efo_id", name="uq_ot_target_disease"),
    )


class PubMedArticle(Base):
    __tablename__ = "pubmed_articles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    pmid = Column(String(20), unique=True, nullable=False)
    title = Column(Text, nullable=False)
    abstract = Column(Text)
    authors = Column(ARRAY(String))
    journal = Column(String(300))
    pub_date = Column(Date)
    doi = Column(String(200))
    mesh_terms = Column(ARRAY(String))
    biomarker_mentions = Column(ARRAY(String))
    indication_mentions = Column(ARRAY(String))
    fetched_at = Column(DateTime(timezone=True), server_default=func.now())


class CivicEvidence(Base):
    __tablename__ = "civic_evidence"

    id = Column(Integer, primary_key=True, autoincrement=True)
    civic_id = Column(Integer, unique=True, nullable=False)
    gene_name = Column(String(100))
    variant_name = Column(String(200))
    disease_name = Column(String(200))
    evidence_type = Column(String(50))
    evidence_level = Column(String(10))
    evidence_direction = Column(String(50))
    significance = Column(String(100))
    drugs = Column(ARRAY(String))
    source_pmid = Column(String(20))
    fetched_at = Column(DateTime(timezone=True), server_default=func.now())


class GWASAssociation(Base):
    __tablename__ = "gwas_associations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    rs_id = Column(String(30), nullable=False)
    gene = Column(String(100))
    trait_name = Column(String(300))
    p_value = Column(DOUBLE_PRECISION)
    odds_ratio = Column(Float)
    risk_allele = Column(String(50))
    population = Column(String(100))
    pubmed_id = Column(String(20))
    study_title = Column(Text)
    biomarker_relevance = Column(Text)
    fetched_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("rs_id", "trait_name", name="uq_gwas_rs_trait"),
    )


class OTTargetAssociation(Base):
    """Per-biomarker druggability & association scores from Open Targets."""
    __tablename__ = "ot_target_associations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    biomarker_symbol = Column(String(50), nullable=False, index=True)
    ensembl_id = Column(String(50), nullable=False)
    indication_name = Column(String(100), nullable=False, index=True)
    efo_id = Column(String(50), nullable=False)
    overall_score = Column(Float, nullable=False)
    drug_score = Column(Float, default=0)
    cancer_biomarker_score = Column(Float, default=0)
    cancer_gene_census_score = Column(Float, default=0)
    intogen_score = Column(Float, default=0)
    literature_score = Column(Float, default=0)
    # Tractability flags
    sm_tractable = Column(Boolean, default=False)
    sm_has_approved_drug = Column(Boolean, default=False)
    ab_tractable = Column(Boolean, default=False)
    ab_has_approved_drug = Column(Boolean, default=False)
    protac_tractable = Column(Boolean, default=False)
    # Drug counts
    unique_drugs = Column(Integer, default=0)
    approved_drug_count = Column(Integer, default=0)
    fetched_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("ensembl_id", "efo_id", name="uq_ot_assoc_target_disease"),
    )


class OTKnownDrug(Base):
    """Individual drugs per biomarker-indication from Open Targets / ChEMBL."""
    __tablename__ = "ot_known_drugs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    biomarker_symbol = Column(String(50), nullable=False, index=True)
    ensembl_id = Column(String(50), nullable=False)
    drug_name = Column(String(300), nullable=False)
    drug_chembl_id = Column(String(50))
    drug_type = Column(String(100))
    max_phase = Column(Float)
    is_approved = Column(Boolean, default=False)
    year_approved = Column(SmallInteger)
    mechanism_of_action = Column(Text)
    disease_name = Column(String(300))
    disease_efo_id = Column(String(50))
    indication_name = Column(String(100), nullable=False, index=True)
    fetched_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("ensembl_id", "drug_chembl_id", "disease_efo_id", "indication_name",
                         name="uq_ot_drug_target_disease_ind"),
    )


class OTCancerBiomarkerEvidence(Base):
    """Cancer biomarker evidence (drug sensitivity/resistance) from Cancer Genome Interpreter via OT."""
    __tablename__ = "ot_cancer_biomarker_evidence"

    id = Column(Integer, primary_key=True, autoincrement=True)
    biomarker_symbol = Column(String(50), nullable=False, index=True)
    ensembl_id = Column(String(50), nullable=False)
    drug_name = Column(String(300))
    confidence = Column(String(100))
    disease_from_source = Column(String(300))
    indication_name = Column(String(100), nullable=False, index=True)
    efo_id = Column(String(50))
    fetched_at = Column(DateTime(timezone=True), server_default=func.now())
