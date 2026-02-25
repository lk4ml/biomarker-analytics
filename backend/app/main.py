"""FastAPI application entry point."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.api.trials import router as trials_router
from app.api.dashboard import router as dashboard_router
from app.api.biomarkers import router as biomarkers_router
from app.api.external import router as external_router
from app.api.pipeline import router as pipeline_router
from app.api.druggability import router as druggability_router
from app.api.strategy import router as strategy_router
from app.api.watch import router as watch_router
from app.api.research_report import router as research_report_router
from app.api.variant_intelligence import router as variant_router

settings = get_settings()

app = FastAPI(
    title="BiomarkerScope API",
    description="Oncology Biomarker Analytics Platform - Backend API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(trials_router)
app.include_router(dashboard_router)
app.include_router(biomarkers_router)
app.include_router(external_router)
app.include_router(pipeline_router)
app.include_router(druggability_router)
app.include_router(strategy_router)
app.include_router(watch_router)
app.include_router(research_report_router)
app.include_router(variant_router)


@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "BiomarkerScope API"}


@app.get("/api/indications")
def get_indications():
    from sqlalchemy import text
    from app.database import SessionLocal
    db = SessionLocal()
    rows = db.execute(text("SELECT name, display_name FROM indications ORDER BY name")).fetchall()
    db.close()
    return [{"name": r[0], "displayName": r[1]} for r in rows]


@app.get("/api/indications/summary")
def get_indications_summary():
    """Returns per-indication summary stats for the landing page selector."""
    from sqlalchemy import text
    from app.database import SessionLocal
    db = SessionLocal()
    rows = db.execute(text("""
        SELECT
            i.name,
            i.display_name,
            COUNT(DISTINCT ti.trial_id) as trial_count,
            COUNT(DISTINCT tb.id) as biomarker_entries,
            COUNT(DISTINCT tb.biomarker_name) as unique_biomarkers,
            COUNT(DISTINCT CASE WHEN t.overall_status = 'Recruiting' THEN t.id END) as recruiting
        FROM indications i
        LEFT JOIN trial_indications ti ON i.id = ti.indication_id
        LEFT JOIN trials t ON ti.trial_id = t.id
        LEFT JOIN trial_biomarkers tb ON t.id = tb.trial_id
        GROUP BY i.name, i.display_name
        ORDER BY COUNT(DISTINCT ti.trial_id) DESC
    """)).fetchall()

    results = []
    for r in rows:
        pm_count = db.execute(text(
            "SELECT COUNT(*) FROM pubmed_articles WHERE :name = ANY(indication_mentions)"
        ), {"name": r[0]}).scalar() or 0
        results.append({
            "name": r[0],
            "displayName": r[1],
            "trialCount": r[2],
            "biomarkerEntries": r[3],
            "pubmedArticles": pm_count,
            "uniqueBiomarkers": r[4],
            "recruitingTrials": r[5],
        })
    db.close()
    return results
