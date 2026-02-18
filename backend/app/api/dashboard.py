"""Dashboard API endpoints."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.responses import DashboardStatsResponse

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard/stats/{indication}", response_model=DashboardStatsResponse)
def get_dashboard_stats(indication: str, db: Session = Depends(get_db)):
    where = ""
    params = {}
    if indication and indication != "All":
        where = "WHERE tb.tumor_type = :ind"
        params["ind"] = indication
        trial_where = """
            WHERE t.id IN (
                SELECT ti.trial_id FROM trial_indications ti
                JOIN indications i ON ti.indication_id = i.id
                WHERE i.name = :ind
            )
        """
    else:
        trial_where = ""

    # Total unique trials for this indication
    total_trials = db.execute(text(f"""
        SELECT COUNT(DISTINCT t.id) FROM trials t
        {trial_where}
    """), params).scalar() or 0

    # Biomarker counts
    bm_rows = db.execute(text(f"""
        SELECT tb.biomarker_name, COUNT(*) as cnt
        FROM trial_biomarkers tb
        {where}
        GROUP BY tb.biomarker_name
        ORDER BY cnt DESC
    """), params).fetchall()
    biomarker_counts = [{"name": r[0], "value": r[1]} for r in bm_rows]

    # Setting distribution
    setting_rows = db.execute(text(f"""
        SELECT tb.therapeutic_setting, COUNT(*) as cnt
        FROM trial_biomarkers tb
        {where}
        GROUP BY tb.therapeutic_setting
        ORDER BY cnt DESC
    """), params).fetchall()
    setting_distribution = [{"name": r[0] or "Unknown", "value": r[1]} for r in setting_rows]

    # Year distribution
    year_rows = db.execute(text(f"""
        SELECT t.start_year, COUNT(DISTINCT t.id) as cnt
        FROM trials t
        JOIN trial_biomarkers tb ON tb.trial_id = t.id
        {where}
        AND t.start_year IS NOT NULL
        GROUP BY t.start_year
        ORDER BY t.start_year
    """), params).fetchall()
    year_distribution = [{"year": r[0], "trials": r[1]} for r in year_rows]

    # Sponsor distribution (top 15)
    sponsor_rows = db.execute(text(f"""
        SELECT t.lead_sponsor_name, COUNT(DISTINCT t.id) as cnt
        FROM trials t
        JOIN trial_biomarkers tb ON tb.trial_id = t.id
        {where}
        AND t.lead_sponsor_name IS NOT NULL
        GROUP BY t.lead_sponsor_name
        ORDER BY cnt DESC
        LIMIT 15
    """), params).fetchall()
    sponsor_distribution = [{"name": r[0], "value": r[1]} for r in sponsor_rows]

    # Phase counts
    phase_rows = db.execute(text(f"""
        SELECT t.phase, COUNT(DISTINCT t.id) as cnt
        FROM trials t
        JOIN trial_biomarkers tb ON tb.trial_id = t.id
        {where}
        GROUP BY t.phase
        ORDER BY t.phase
    """), params).fetchall()
    phase_counts = [{"name": r[0] or "Unknown", "value": r[1]} for r in phase_rows]

    # Recruiting count
    recruiting = db.execute(text(f"""
        SELECT COUNT(DISTINCT t.id) FROM trials t
        JOIN trial_biomarkers tb ON tb.trial_id = t.id
        {where}
        AND t.overall_status = 'Recruiting'
    """), params).scalar() or 0

    # Total assays and FDA approved
    total_assays = db.execute(text("SELECT COUNT(*) FROM assays")).scalar() or 0
    fda_assays = db.execute(text("SELECT COUNT(*) FROM assays WHERE fda_approved = true")).scalar() or 0

    return DashboardStatsResponse(
        totalTrials=total_trials,
        totalBiomarkers=len(biomarker_counts),
        totalAssays=total_assays,
        fdaApprovedAssays=fda_assays,
        recruitingCount=recruiting,
        biomarkerCounts=biomarker_counts,
        settingDistribution=setting_distribution,
        yearDistribution=year_distribution,
        sponsorDistribution=sponsor_distribution,
        phaseCounts=phase_counts,
        indication=indication,
    )


@router.get("/dashboard/stats")
def get_global_stats(db: Session = Depends(get_db)):
    return get_dashboard_stats("All", db)
