"""Variant Intelligence API endpoints.

Provides mutation-level cross-source intelligence by joining
cBioPortal prevalence, OncoKB actionability, FDA approvals,
trial data, CIViC evidence, and data provenance.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.services.variant_data import (
    fetch_variant_card,
    fetch_variant_landscape,
    fetch_patient_funnel,
)

router = APIRouter(prefix="/api/variant", tags=["variant-intelligence"])


# --- Fixed-path routes MUST come before parameterized catch-all routes ---

@router.get("/genes")
def get_available_genes(db: Session = Depends(get_db)):
    """List genes that have variant-level data available."""
    genes = db.execute(text("""
        SELECT DISTINCT gene, COUNT(DISTINCT variant_name) as variant_count
        FROM (
            SELECT gene, variant_name FROM mutation_prevalence
            UNION
            SELECT gene, variant_name FROM oncokb_actionability
        ) combined
        GROUP BY gene
        ORDER BY variant_count DESC
    """)).fetchall()

    return [{"gene": r[0], "variantCount": r[1]} for r in genes]


@router.get("/{gene}/landscape")
def get_variant_landscape(gene: str, db: Session = Depends(get_db)):
    """
    All known variants for a gene across cancer types.

    Returns a frequency heatmap (variants x indications) and
    actionability level grid.
    """
    return fetch_variant_landscape(db, gene)


@router.get("/{gene}/variants")
def get_variants_for_gene(gene: str, db: Session = Depends(get_db)):
    """List all known variants for a specific gene."""
    variants = db.execute(text("""
        SELECT variant_name,
               MAX(CASE WHEN source = 'prevalence' THEN 1 ELSE 0 END) as has_prevalence,
               MAX(CASE WHEN source = 'actionability' THEN 1 ELSE 0 END) as has_actionability
        FROM (
            SELECT variant_name, 'prevalence' as source FROM mutation_prevalence WHERE gene = :gene
            UNION ALL
            SELECT variant_name, 'actionability' as source FROM oncokb_actionability WHERE gene = :gene
        ) combined
        GROUP BY variant_name
        ORDER BY variant_name
    """), {"gene": gene}).fetchall()

    return [
        {"variant": r[0], "hasPrevalence": bool(r[1]), "hasActionability": bool(r[2])}
        for r in variants
    ]


# --- Parameterized catch-all routes AFTER specific ones ---

@router.get("/{gene}/{variant}")
def get_variant_card(gene: str, variant: str, db: Session = Depends(get_db)):
    """
    Unified variant intelligence card.

    Returns prevalence, actionability, FDA approvals, trial counts,
    co-mutations, CIViC evidence, and provenance for a specific
    gene/variant combination (e.g., KRAS/G12C).
    """
    return fetch_variant_card(db, gene, variant)


@router.get("/{gene}/{variant}/funnel")
def get_patient_funnel(
    gene: str,
    variant: str,
    indication: str = "NSCLC",
    db: Session = Depends(get_db),
):
    """
    Patient funnel data for Sankey diagram.

    Shows: incidence -> tested -> gene mutated -> variant+ -> eligible -> on treatment.
    Uses GENIE prevalence + published testing rates + trial enrollment.
    """
    return fetch_patient_funnel(db, gene, variant, indication)
