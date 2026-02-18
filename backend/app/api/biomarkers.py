"""Biomarker and assay API endpoints."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.responses import (
    BiomarkerResponse, AssayInfoResponse, CutoffTrendResponse
)

router = APIRouter(prefix="/api", tags=["biomarkers"])


@router.get("/biomarkers", response_model=list[BiomarkerResponse])
def get_biomarkers(db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT name, aliases, category, description, gene_symbol, uniprot_id
        FROM biomarkers ORDER BY name
    """)).fetchall()

    return [
        BiomarkerResponse(
            id=r[0].lower().replace("/", "").replace(" ", "_"),
            name=r[0], aliases=r[1] or [], category=r[2],
            description=r[3] or "", geneSymbol=r[4], uniprotId=r[5],
        )
        for r in rows
    ]


@router.get("/biomarkers/{biomarker_name}")
def get_biomarker_detail(biomarker_name: str, db: Session = Depends(get_db)):
    row = db.execute(text("""
        SELECT name, aliases, category, description, gene_symbol, ensembl_id, uniprot_id
        FROM biomarkers WHERE name = :name
    """), {"name": biomarker_name}).fetchone()

    if not row:
        return {"error": "Biomarker not found"}

    # Get trial count by indication
    indication_counts = db.execute(text("""
        SELECT tb.tumor_type, COUNT(*) as cnt
        FROM trial_biomarkers tb
        WHERE tb.biomarker_name = :name
        GROUP BY tb.tumor_type
        ORDER BY cnt DESC
    """), {"name": biomarker_name}).fetchall()

    return {
        "name": row[0], "aliases": row[1], "category": row[2],
        "description": row[3], "geneSymbol": row[4],
        "ensemblId": row[5], "uniprotId": row[6],
        "trialsByIndication": [{"indication": r[0], "count": r[1]} for r in indication_counts],
    }


@router.get("/assays", response_model=list[AssayInfoResponse])
def get_assays(
    biomarker: str | None = Query(None),
    fda_approved: bool | None = Query(None),
    db: Session = Depends(get_db),
):
    conditions = []
    params = {}
    if biomarker:
        conditions.append(":biomarker = ANY(biomarker_names)")
        params["biomarker"] = biomarker
    if fda_approved is not None:
        conditions.append("fda_approved = :fda")
        params["fda"] = fda_approved

    where = " AND ".join(conditions) if conditions else "1=1"
    rows = db.execute(text(f"""
        SELECT name, manufacturer, platform, antibody_clone, fda_approved,
               companion_dx_for, biomarker_names
        FROM assays WHERE {where} ORDER BY name
    """), params).fetchall()

    return [
        AssayInfoResponse(
            name=r[0], manufacturer=r[1] or "", platform=r[2] or "",
            antibodyClone=r[3], fdaApproved=r[4] or False,
            companionDiagnosticFor=r[5] or [], biomarkers=r[6] or [],
        )
        for r in rows
    ]


@router.get("/cutoff-trends", response_model=list[CutoffTrendResponse])
def get_cutoff_trends(
    biomarker: str | None = Query(None),
    indication: str | None = Query(None),
    db: Session = Depends(get_db),
):
    conditions = []
    params = {}
    if biomarker and biomarker != "All":
        conditions.append("biomarker_name = :bm")
        params["bm"] = biomarker
    if indication and indication != "All":
        conditions.append("tumor_type = :ind")
        params["ind"] = indication

    where = " AND ".join(conditions) if conditions else "1=1"
    rows = db.execute(text(f"""
        SELECT biomarker_name, tumor_type, year, cutoff_value, cutoff_unit,
               trial_count, dominant_assay
        FROM cutoff_trends WHERE {where}
        ORDER BY biomarker_name, tumor_type, year
    """), params).fetchall()

    return [
        CutoffTrendResponse(
            biomarkerName=r[0], tumorType=r[1], year=r[2],
            cutoffValue=r[3] or 0, cutoffUnit=r[4] or "",
            trialCount=r[5] or 0, assay=r[6] or "",
        )
        for r in rows
    ]
