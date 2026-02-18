"""Pipeline status and management API."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.responses import PipelineStatusResponse

router = APIRouter(prefix="/api", tags=["pipeline"])


@router.get("/pipeline/status", response_model=list[PipelineStatusResponse])
def get_pipeline_status(db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT pipeline_name, status, started_at, completed_at,
               records_processed, records_created
        FROM pipeline_runs
        ORDER BY started_at DESC
        LIMIT 20
    """)).fetchall()

    return [
        PipelineStatusResponse(
            pipelineName=r[0],
            status=r[1],
            startedAt=str(r[2]) if r[2] else None,
            completedAt=str(r[3]) if r[3] else None,
            recordsProcessed=r[4] or 0,
            recordsCreated=r[5] or 0,
        )
        for r in rows
    ]


@router.get("/pipeline/summary")
def get_pipeline_summary(db: Session = Depends(get_db)):
    trials = db.execute(text("SELECT COUNT(*) FROM trials")).scalar() or 0
    biomarker_entries = db.execute(text("SELECT COUNT(*) FROM trial_biomarkers")).scalar() or 0
    unique_biomarkers = db.execute(text("SELECT COUNT(DISTINCT biomarker_name) FROM trial_biomarkers")).scalar() or 0
    indications = db.execute(text("SELECT COUNT(*) FROM indications")).scalar() or 0
    ot_assocs = db.execute(text("SELECT COUNT(*) FROM open_targets_associations")).scalar() or 0
    pubmed = db.execute(text("SELECT COUNT(*) FROM pubmed_articles")).scalar() or 0
    civic = db.execute(text("SELECT COUNT(*) FROM civic_evidence")).scalar() or 0
    gwas = db.execute(text("SELECT COUNT(*) FROM gwas_associations")).scalar() or 0

    return {
        "totalTrials": trials,
        "totalBiomarkerEntries": biomarker_entries,
        "uniqueBiomarkers": unique_biomarkers,
        "indications": indications,
        "openTargetsAssociations": ot_assocs,
        "pubmedArticles": pubmed,
        "civicEvidence": civic,
        "gwasAssociations": gwas,
    }
