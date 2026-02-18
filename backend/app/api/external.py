"""External data API endpoints (Open Targets, GWAS, PubMed, CIViC)."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.responses import (
    GWASAssociationResponse, OpenTargetLinkResponse,
    PubMedArticleResponse, CivicEvidenceResponse,
)

router = APIRouter(prefix="/api/external", tags=["external"])

INDICATION_EFO_MAP = {
    "NSCLC": "EFO_0003060",
    "Breast Cancer": "EFO_0000305",
    "Melanoma": "EFO_0000389",
    "Colorectal Cancer": "EFO_0005842",
    "Gastric Cancer": "EFO_0000178",
}


@router.get("/open-targets/{indication}", response_model=list[OpenTargetLinkResponse])
def get_open_targets(indication: str, db: Session = Depends(get_db)):
    efo_id = INDICATION_EFO_MAP.get(indication)
    if not efo_id:
        # Return all
        rows = db.execute(text("""
            SELECT target_ensembl_id, target_symbol, target_name,
                   disease_efo_id, disease_name, association_score, datatype_scores
            FROM open_targets_associations
            ORDER BY association_score DESC
        """)).fetchall()
    else:
        rows = db.execute(text("""
            SELECT target_ensembl_id, target_symbol, target_name,
                   disease_efo_id, disease_name, association_score, datatype_scores
            FROM open_targets_associations
            WHERE disease_efo_id = :efo_id
            ORDER BY association_score DESC
        """), {"efo_id": efo_id}).fetchall()

    return [
        OpenTargetLinkResponse(
            targetId=r[0], targetName=f"{r[1]} ({r[2]})" if r[2] else r[1],
            diseaseId=r[3], diseaseName=r[4],
            associationScore=r[5] or 0,
            datatypeScores=r[6] or {},
        )
        for r in rows
    ]


@router.get("/gwas/{indication}", response_model=list[GWASAssociationResponse])
def get_gwas(indication: str, db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT rs_id, gene, trait_name, p_value, odds_ratio,
               risk_allele, population, pubmed_id, study_title, biomarker_relevance
        FROM gwas_associations
        ORDER BY p_value ASC
    """)).fetchall()

    return [
        GWASAssociationResponse(
            rsId=r[0], gene=r[1] or "", traitName=r[2] or "",
            pValue=r[3] or 0, oddsRatio=r[4],
            riskAllele=r[5] or "", population=r[6] or "",
            pubmedId=r[7] or "", studyTitle=r[8] or "",
            biomarkerRelevance=r[9] or "",
        )
        for r in rows
    ]


@router.get("/pubmed/{indication}", response_model=list[PubMedArticleResponse])
def get_pubmed(indication: str, db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT pmid, title, abstract, authors, journal, pub_date, biomarker_mentions
        FROM pubmed_articles
        WHERE :ind = ANY(indication_mentions) OR :ind = 'All'
        ORDER BY pub_date DESC NULLS LAST
        LIMIT 50
    """), {"ind": indication}).fetchall()

    return [
        PubMedArticleResponse(
            pmid=r[0], title=r[1], abstract=r[2],
            authors=r[3] or [], journal=r[4],
            pubDate=str(r[5]) if r[5] else None,
            biomarkerMentions=r[6] or [],
        )
        for r in rows
    ]


@router.get("/civic/{gene}", response_model=list[CivicEvidenceResponse])
def get_civic(gene: str, db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT civic_id, gene_name, variant_name, disease_name,
               evidence_type, evidence_level, drugs
        FROM civic_evidence
        WHERE gene_name ILIKE :gene
        ORDER BY evidence_level ASC
        LIMIT 50
    """), {"gene": f"%{gene}%"}).fetchall()

    return [
        CivicEvidenceResponse(
            civicId=r[0], geneName=r[1] or "", variantName=r[2] or "",
            diseaseName=r[3] or "", evidenceType=r[4] or "",
            evidenceLevel=r[5] or "", drugs=r[6] or [],
        )
        for r in rows
    ]
