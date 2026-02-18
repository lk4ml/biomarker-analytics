"""Biomarker Watch — temporal activity feed and alert endpoints.

Aggregates recent publications, trial activity, cutoff evolution,
drug approvals, and white-space signals across all data sources.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter(prefix="/api/watch", tags=["watch"])


@router.get("/feed")
def get_watch_feed(
    indication: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """
    Unified activity feed aggregating 4 temporal streams:
    publications, trial activity, cutoff alerts, drug approvals.
    """
    ind_filter = indication if indication and indication != "all" else None

    # ── 1. RECENT PUBLICATIONS ──
    if ind_filter:
        pub_rows = db.execute(text("""
            SELECT pmid, title, journal, pub_date, authors,
                   biomarker_mentions, indication_mentions
            FROM pubmed_articles
            WHERE :indication = ANY(indication_mentions)
            ORDER BY pub_date DESC NULLS LAST
            LIMIT :limit
        """), {"indication": ind_filter, "limit": limit}).fetchall()
    else:
        pub_rows = db.execute(text("""
            SELECT pmid, title, journal, pub_date, authors,
                   biomarker_mentions, indication_mentions
            FROM pubmed_articles
            ORDER BY pub_date DESC NULLS LAST
            LIMIT :limit
        """), {"limit": limit}).fetchall()

    publications = [
        {
            "pmid": r[0], "title": r[1], "journal": r[2],
            "pubDate": str(r[3]) if r[3] else None,
            "authors": r[4][:3] if r[4] else [],
            "biomarkerMentions": r[5] or [],
            "indicationMentions": r[6] or [],
        }
        for r in pub_rows
    ]

    # ── 2. RECENT TRIAL ACTIVITY ──
    if ind_filter:
        trial_rows = db.execute(text("""
            SELECT t.nct_id, t.brief_title, t.overall_status, t.phase,
                   t.start_date, t.lead_sponsor_name,
                   array_agg(DISTINCT tb.biomarker_name) as biomarkers
            FROM trials t
            JOIN trial_biomarkers tb ON tb.trial_id = t.id
            JOIN trial_indications ti ON t.id = ti.trial_id
            JOIN indications i ON ti.indication_id = i.id
            WHERE i.name = :indication
              AND t.start_date >= CURRENT_DATE - INTERVAL '2 years'
            GROUP BY t.id
            ORDER BY t.start_date DESC NULLS LAST
            LIMIT :limit
        """), {"indication": ind_filter, "limit": limit}).fetchall()
    else:
        trial_rows = db.execute(text("""
            SELECT t.nct_id, t.brief_title, t.overall_status, t.phase,
                   t.start_date, t.lead_sponsor_name,
                   array_agg(DISTINCT tb.biomarker_name) as biomarkers
            FROM trials t
            JOIN trial_biomarkers tb ON tb.trial_id = t.id
            WHERE t.start_date >= CURRENT_DATE - INTERVAL '2 years'
            GROUP BY t.id
            ORDER BY t.start_date DESC NULLS LAST
            LIMIT :limit
        """), {"limit": limit}).fetchall()

    trial_activity = [
        {
            "nctId": r[0], "briefTitle": r[1], "status": r[2],
            "phase": r[3],
            "startDate": str(r[4]) if r[4] else None,
            "sponsor": r[5] or "Unknown",
            "biomarkers": r[6] or [],
        }
        for r in trial_rows
    ]

    # ── 3. CUTOFF EVOLUTION ALERTS ──
    if ind_filter:
        cutoff_rows = db.execute(text("""
            SELECT ct1.biomarker_name, ct1.tumor_type,
                   ct1.year as current_year, ct1.cutoff_value as current_cutoff,
                   ct1.cutoff_unit,
                   ct2.cutoff_value as previous_cutoff, ct2.year as previous_year
            FROM cutoff_trends ct1
            JOIN cutoff_trends ct2 ON ct1.biomarker_name = ct2.biomarker_name
              AND ct1.tumor_type = ct2.tumor_type
              AND ct1.cutoff_unit = ct2.cutoff_unit
              AND ct2.year = ct1.year - 1
            WHERE ct1.cutoff_value != ct2.cutoff_value
              AND ct1.tumor_type = :indication
            ORDER BY ct1.year DESC
            LIMIT 20
        """), {"indication": ind_filter}).fetchall()
    else:
        cutoff_rows = db.execute(text("""
            SELECT ct1.biomarker_name, ct1.tumor_type,
                   ct1.year as current_year, ct1.cutoff_value as current_cutoff,
                   ct1.cutoff_unit,
                   ct2.cutoff_value as previous_cutoff, ct2.year as previous_year
            FROM cutoff_trends ct1
            JOIN cutoff_trends ct2 ON ct1.biomarker_name = ct2.biomarker_name
              AND ct1.tumor_type = ct2.tumor_type
              AND ct1.cutoff_unit = ct2.cutoff_unit
              AND ct2.year = ct1.year - 1
            WHERE ct1.cutoff_value != ct2.cutoff_value
            ORDER BY ct1.year DESC
            LIMIT 20
        """)).fetchall()

    cutoff_alerts = [
        {
            "biomarkerName": r[0], "tumorType": r[1],
            "currentYear": r[2], "currentCutoff": r[3],
            "cutoffUnit": r[4] or "",
            "previousCutoff": r[5], "previousYear": r[6],
        }
        for r in cutoff_rows
    ]

    # ── 4. RECENT DRUG APPROVALS ──
    if ind_filter:
        approval_rows = db.execute(text("""
            SELECT DISTINCT ON (drug_name)
                drug_name, drug_type, biomarker_symbol, indication_name,
                year_approved, mechanism_of_action
            FROM ot_known_drugs
            WHERE is_approved = true AND year_approved IS NOT NULL
              AND indication_name = :indication
            ORDER BY drug_name, year_approved DESC
        """), {"indication": ind_filter}).fetchall()
    else:
        approval_rows = db.execute(text("""
            SELECT DISTINCT ON (drug_name)
                drug_name, drug_type, biomarker_symbol, indication_name,
                year_approved, mechanism_of_action
            FROM ot_known_drugs
            WHERE is_approved = true AND year_approved IS NOT NULL
            ORDER BY drug_name, year_approved DESC
        """)).fetchall()

    # Sort by year descending after DISTINCT ON
    recent_approvals = sorted(
        [
            {
                "drugName": r[0], "drugType": r[1],
                "biomarkerSymbol": r[2], "indicationName": r[3],
                "yearApproved": r[4], "moa": r[5] or "",
            }
            for r in approval_rows
        ],
        key=lambda x: x["yearApproved"] or 0,
        reverse=True,
    )[:30]

    return {
        "publications": publications,
        "trialActivity": trial_activity,
        "cutoffAlerts": cutoff_alerts,
        "recentApprovals": recent_approvals,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/biomarker/{biomarker}")
def get_biomarker_watch(
    biomarker: str,
    indication: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """
    Biomarker-specific intelligence: publications, trials, cutoff changes,
    drug pipeline, and white-space signal detection.
    """
    ind_filter = indication if indication and indication != "all" else None
    params: dict = {"biomarker": biomarker}

    # ── 1. LATEST PUBLICATIONS ──
    if ind_filter:
        params["indication"] = ind_filter
        pub_rows = db.execute(text("""
            SELECT pmid, title, journal, pub_date, authors
            FROM pubmed_articles
            WHERE :biomarker = ANY(biomarker_mentions)
              AND :indication = ANY(indication_mentions)
            ORDER BY pub_date DESC NULLS LAST
            LIMIT 15
        """), params).fetchall()
    else:
        pub_rows = db.execute(text("""
            SELECT pmid, title, journal, pub_date, authors
            FROM pubmed_articles
            WHERE :biomarker = ANY(biomarker_mentions)
            ORDER BY pub_date DESC NULLS LAST
            LIMIT 15
        """), params).fetchall()

    publications = [
        {
            "pmid": r[0], "title": r[1], "journal": r[2],
            "pubDate": str(r[3]) if r[3] else None,
            "authors": r[4][:3] if r[4] else [],
        }
        for r in pub_rows
    ]

    # ── 2. RECENT TRIALS (last 2 years) ──
    if ind_filter:
        trial_rows = db.execute(text("""
            SELECT t.nct_id, t.brief_title, t.overall_status, t.phase,
                   t.start_date, t.lead_sponsor_name,
                   tb.cutoff_value, tb.cutoff_unit
            FROM trial_biomarkers tb
            JOIN trials t ON tb.trial_id = t.id
            JOIN trial_indications ti ON t.id = ti.trial_id
            JOIN indications i ON ti.indication_id = i.id
            WHERE tb.biomarker_name = :biomarker
              AND i.name = :indication
              AND t.start_date >= CURRENT_DATE - INTERVAL '2 years'
            ORDER BY t.start_date DESC
            LIMIT 20
        """), params).fetchall()
    else:
        trial_rows = db.execute(text("""
            SELECT t.nct_id, t.brief_title, t.overall_status, t.phase,
                   t.start_date, t.lead_sponsor_name,
                   tb.cutoff_value, tb.cutoff_unit
            FROM trial_biomarkers tb
            JOIN trials t ON tb.trial_id = t.id
            WHERE tb.biomarker_name = :biomarker
              AND t.start_date >= CURRENT_DATE - INTERVAL '2 years'
            ORDER BY t.start_date DESC
            LIMIT 20
        """), params).fetchall()

    recent_trials = [
        {
            "nctId": r[0], "briefTitle": r[1], "status": r[2],
            "phase": r[3],
            "startDate": str(r[4]) if r[4] else None,
            "sponsor": r[5] or "Unknown",
            "cutoffValue": r[6] or "", "cutoffUnit": r[7] or "",
        }
        for r in trial_rows
    ]

    # ── 3. CUTOFF CHANGES (last 3 years) ──
    cutoff_rows = db.execute(text("""
        SELECT year, cutoff_value, cutoff_unit, trial_count, dominant_assay, tumor_type
        FROM cutoff_trends
        WHERE biomarker_name = :biomarker
          AND year >= EXTRACT(YEAR FROM CURRENT_DATE) - 3
        ORDER BY year DESC, tumor_type
    """), {"biomarker": biomarker}).fetchall()

    cutoff_changes = [
        {
            "year": r[0], "cutoffValue": r[1], "cutoffUnit": r[2] or "",
            "trialCount": r[3], "dominantAssay": r[4] or "",
            "tumorType": r[5] or "",
        }
        for r in cutoff_rows
    ]

    # ── 4. DRUG PIPELINE (Phase 2+) ──
    if ind_filter:
        drug_rows = db.execute(text("""
            SELECT DISTINCT ON (drug_name)
                drug_name, drug_type, max_phase, is_approved, year_approved,
                mechanism_of_action, indication_name
            FROM ot_known_drugs
            WHERE biomarker_symbol = :biomarker
              AND indication_name = :indication
              AND max_phase >= 2
            ORDER BY drug_name, max_phase DESC
        """), params).fetchall()
    else:
        drug_rows = db.execute(text("""
            SELECT DISTINCT ON (drug_name)
                drug_name, drug_type, max_phase, is_approved, year_approved,
                mechanism_of_action, indication_name
            FROM ot_known_drugs
            WHERE biomarker_symbol = :biomarker
              AND max_phase >= 2
            ORDER BY drug_name, max_phase DESC
        """), {"biomarker": biomarker}).fetchall()

    drug_pipeline = sorted(
        [
            {
                "drugName": r[0], "drugType": r[1],
                "maxPhase": float(r[2]) if r[2] else 0,
                "isApproved": r[3], "yearApproved": r[4],
                "moa": r[5] or "", "indicationName": r[6],
            }
            for r in drug_rows
        ],
        key=lambda x: x["maxPhase"],
        reverse=True,
    )

    # ── 5. WHITE-SPACE SIGNALS ──
    signal_rows = db.execute(text("""
        SELECT ota.indication_name, ota.overall_score, ota.unique_drugs
        FROM ot_target_associations ota
        WHERE ota.biomarker_symbol = :biomarker
          AND ota.overall_score > 0.3
    """), {"biomarker": biomarker}).fetchall()

    white_space_signals = []
    for r in signal_rows:
        # Count trials for this biomarker in this indication
        trial_count = db.execute(text("""
            SELECT COUNT(DISTINCT t.id)
            FROM trial_biomarkers tb
            JOIN trials t ON tb.trial_id = t.id
            JOIN trial_indications ti ON t.id = ti.trial_id
            JOIN indications i ON ti.indication_id = i.id
            WHERE tb.biomarker_name = :biomarker AND i.name = :indication
        """), {"biomarker": biomarker, "indication": r[0]}).scalar() or 0

        if trial_count < 15:
            white_space_signals.append({
                "indicationName": r[0],
                "overallScore": float(r[1]),
                "uniqueDrugs": int(r[2]) if r[2] else 0,
                "trialCount": trial_count,
            })

    white_space_signals.sort(key=lambda x: x["overallScore"], reverse=True)

    return {
        "biomarker": biomarker,
        "publications": publications,
        "recentTrials": recent_trials,
        "cutoffChanges": cutoff_changes,
        "drugPipeline": drug_pipeline,
        "whiteSpaceSignals": white_space_signals,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
