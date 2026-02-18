"""Strategy API — cross-database intelligence endpoints.

These endpoints perform joins across ALL data sources (ClinicalTrials.gov,
Open Targets, PubMed, GWAS, assays) to produce unified intelligence that
cannot be replicated by asking an LLM a few questions.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.strategy_data import (
    BIOMARKER_GENE_MAP,
    fetch_all_strategy_data,
)

router = APIRouter(prefix="/api/strategy", tags=["strategy"])


@router.get("/brief/{indication}/{biomarker}")
def get_strategy_brief(indication: str, biomarker: str, db: Session = Depends(get_db)):
    """
    Generate a cross-database strategy brief for a biomarker-indication pair.
    Joins data from: trials, druggability, cancer evidence, assays, GWAS, PubMed.
    """
    data = fetch_all_strategy_data(db, indication, biomarker)
    return {
        "biomarker": biomarker,
        "indication": indication,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        **data,
    }


@router.get("/opportunity-matrix")
def get_opportunity_matrix(db: Session = Depends(get_db)):
    """
    Generate the biomarker × indication opportunity matrix.
    Each cell = trial count + enrichment signals (OT score, CDx status, approved drugs).
    Empty/low cells with high OT scores = white-space opportunities.
    """
    core_indications = ["NSCLC", "Breast Cancer", "Colorectal Cancer"]

    # Get all biomarker names that exist in the data
    bm_rows = db.execute(text("""
        SELECT DISTINCT tb.biomarker_name
        FROM trial_biomarkers tb
        ORDER BY tb.biomarker_name
    """)).fetchall()
    all_biomarkers = [r[0] for r in bm_rows]

    # Main trial count matrix: biomarker × indication
    trial_counts = db.execute(text("""
        SELECT
            tb.biomarker_name,
            i.name as indication,
            COUNT(DISTINCT t.id) as total_trials,
            COUNT(DISTINCT CASE WHEN t.overall_status = 'Recruiting' THEN t.id END) as recruiting,
            COUNT(DISTINCT CASE WHEN t.phase LIKE '%%3%%' THEN t.id END) as phase3
        FROM trial_biomarkers tb
        JOIN trials t ON tb.trial_id = t.id
        JOIN trial_indications ti ON t.id = ti.trial_id
        JOIN indications i ON ti.indication_id = i.id
        WHERE i.name IN :indications
        GROUP BY tb.biomarker_name, i.name
    """), {"indications": tuple(core_indications)}).fetchall()

    # Index: (biomarker, indication) → counts
    count_map: dict[tuple[str, str], dict] = {}
    for r in trial_counts:
        count_map[(r[0], r[1])] = {
            "totalTrials": r[2], "recruitingTrials": r[3], "phase3Trials": r[4]
        }

    # Open Targets scores
    ot_rows = db.execute(text("""
        SELECT biomarker_symbol, indication_name,
               MAX(overall_score) as score,
               BOOL_OR(sm_has_approved_drug) as has_sm_approved,
               BOOL_OR(ab_has_approved_drug) as has_ab_approved,
               SUM(unique_drugs) as drug_count
        FROM ot_target_associations
        WHERE indication_name IN :indications
        GROUP BY biomarker_symbol, indication_name
    """), {"indications": tuple(core_indications)}).fetchall()

    ot_map: dict[tuple[str, str], dict] = {}
    for r in ot_rows:
        ot_map[(r[0], r[1])] = {
            "otScore": float(r[2]) if r[2] else 0,
            "hasApprovedDrug": bool(r[3]) or bool(r[4]),
            "drugCount": int(r[5]) if r[5] else 0,
        }

    # CDx availability per biomarker
    cdx_rows = db.execute(text("""
        SELECT DISTINCT unnest(biomarker_names) as bm
        FROM assays WHERE fda_approved = true
    """)).fetchall()
    cdx_biomarkers = {r[0] for r in cdx_rows}

    # Build the matrix
    matrix = []
    for bm in all_biomarkers:
        cells = []
        total_across = 0
        for ind in core_indications:
            counts = count_map.get((bm, ind), {"totalTrials": 0, "recruitingTrials": 0, "phase3Trials": 0})
            ot = ot_map.get((bm, ind), {"otScore": 0, "hasApprovedDrug": False, "drugCount": 0})
            total_across += counts["totalTrials"]
            cells.append({
                "indication": ind,
                "totalTrials": counts["totalTrials"],
                "recruitingTrials": counts["recruitingTrials"],
                "phase3Trials": counts["phase3Trials"],
                "hasApprovedDrug": ot["hasApprovedDrug"],
                "hasFdaCdx": bm in cdx_biomarkers,
                "otScore": ot["otScore"],
                "drugCount": ot["drugCount"],
            })
        matrix.append({
            "biomarker": bm,
            "totalAcrossIndications": total_across,
            "cells": cells,
        })

    # Sort by total trials descending
    matrix.sort(key=lambda x: x["totalAcrossIndications"], reverse=True)

    # Identify emerging opportunities: OT score > 0.3 but < 15 trials
    opportunities = []
    for row in matrix:
        for cell in row["cells"]:
            if cell["otScore"] > 0.3 and cell["totalTrials"] < 15 and cell["totalTrials"] > 0:
                opportunities.append({
                    "biomarker": row["biomarker"],
                    "indication": cell["indication"],
                    "totalTrials": cell["totalTrials"],
                    "otScore": cell["otScore"],
                    "hasApprovedDrug": cell["hasApprovedDrug"],
                    "rationale": f"OT association score {cell['otScore']:.2f} suggests biological relevance, but only {cell['totalTrials']} trials running."
                })
    opportunities.sort(key=lambda x: x["otScore"], reverse=True)

    return {
        "indications": core_indications,
        "biomarkers": [m["biomarker"] for m in matrix],
        "matrix": matrix,
        "opportunities": opportunities[:15],
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
