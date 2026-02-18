"""Shared strategy data-fetching functions.

Extracted from strategy.py so both the strategy brief endpoint and the
AI research report endpoint can reuse the same DB query logic.
"""
from sqlalchemy import text
from sqlalchemy.orm import Session

# Map biomarker names to possible gene symbols for GWAS lookups
BIOMARKER_GENE_MAP = {
    "EGFR": ["EGFR"],
    "KRAS": ["KRAS"],
    "BRAF": ["BRAF"],
    "ALK": ["ALK"],
    "HER2": ["ERBB2"],
    "PD-L1": ["CD274"],
    "BRCA1/2": ["BRCA1", "BRCA2"],
    "MSI": ["MLH1", "MSH2", "MSH6", "PMS2"],
    "NTRK": ["NTRK1", "NTRK2", "NTRK3"],
    "PIK3CA": ["PIK3CA"],
    "ER": ["ESR1"],
    "PR": ["PGR"],
    "Ki-67": ["MKI67"],
    "RET": ["RET"],
    "ROS1": ["ROS1"],
    "MET": ["MET"],
    "TMB": [],
    "ctDNA": [],
    "TILs": [],
}

# Shared trial base join used by multiple queries
_TRIAL_BASE = """
    FROM trial_biomarkers tb
    JOIN trials t ON tb.trial_id = t.id
    JOIN trial_indications ti ON t.id = ti.trial_id
    JOIN indications i ON ti.indication_id = i.id
    WHERE tb.biomarker_name = :biomarker
    AND i.name = :indication
"""


def fetch_trial_summary(db: Session, indication: str, biomarker: str) -> dict:
    """Fetch trial counts, phases, sponsors, and year trends."""
    params = {"biomarker": biomarker, "indication": indication}

    total = db.execute(text(f"SELECT COUNT(DISTINCT t.id) {_TRIAL_BASE}"), params).scalar() or 0
    recruiting = db.execute(text(f"""
        SELECT COUNT(DISTINCT t.id) {_TRIAL_BASE} AND t.overall_status = 'Recruiting'
    """), params).scalar() or 0

    by_phase = db.execute(text(f"""
        SELECT t.phase, COUNT(DISTINCT t.id) as cnt
        {_TRIAL_BASE} AND t.phase IS NOT NULL
        GROUP BY t.phase ORDER BY cnt DESC
    """), params).fetchall()

    top_sponsors = db.execute(text(f"""
        SELECT t.lead_sponsor_name, COUNT(DISTINCT t.id) as cnt
        {_TRIAL_BASE} AND t.lead_sponsor_name IS NOT NULL
        GROUP BY t.lead_sponsor_name ORDER BY cnt DESC LIMIT 10
    """), params).fetchall()

    year_trend = db.execute(text(f"""
        SELECT t.start_year, COUNT(DISTINCT t.id) as cnt
        {_TRIAL_BASE} AND t.start_year IS NOT NULL
        GROUP BY t.start_year ORDER BY t.start_year
    """), params).fetchall()

    first_year = db.execute(text(f"""
        SELECT MIN(t.start_year) {_TRIAL_BASE} AND t.start_year IS NOT NULL
    """), params).scalar()
    latest_year = db.execute(text(f"""
        SELECT MAX(t.start_year) {_TRIAL_BASE} AND t.start_year IS NOT NULL
    """), params).scalar()

    return {
        "total": total,
        "recruiting": recruiting,
        "byPhase": [{"phase": r[0] or "Unknown", "count": r[1]} for r in by_phase],
        "topSponsors": [{"name": r[0], "count": r[1]} for r in top_sponsors],
        "yearTrend": [{"year": r[0], "count": r[1]} for r in year_trend],
        "firstTrialYear": first_year,
        "latestTrialYear": latest_year,
    }


def fetch_cutoff_landscape(db: Session, indication: str, biomarker: str) -> dict:
    """Fetch cutoff values, assays used, CDx availability, and trends."""
    params = {"biomarker": biomarker, "indication": indication}

    dominant_cutoffs = db.execute(text(f"""
        SELECT tb.cutoff_value, tb.cutoff_unit, tb.cutoff_operator, COUNT(*) as cnt
        {_TRIAL_BASE}
        AND tb.cutoff_value IS NOT NULL AND tb.cutoff_value != ''
        GROUP BY tb.cutoff_value, tb.cutoff_unit, tb.cutoff_operator
        ORDER BY cnt DESC LIMIT 10
    """), params).fetchall()

    assays_used = db.execute(text(f"""
        SELECT tb.assay_name, COUNT(*) as cnt
        {_TRIAL_BASE}
        AND tb.assay_name IS NOT NULL AND tb.assay_name != '' AND tb.assay_name != 'Not specified'
        GROUP BY tb.assay_name ORDER BY cnt DESC LIMIT 10
    """), params).fetchall()

    cdx_assays = db.execute(text("""
        SELECT name FROM assays
        WHERE :biomarker = ANY(biomarker_names) AND fda_approved = true
    """), params).fetchall()

    cutoff_trends = db.execute(text("""
        SELECT year, cutoff_value, cutoff_unit, trial_count, dominant_assay
        FROM cutoff_trends
        WHERE biomarker_name = :biomarker AND tumor_type = :indication
        ORDER BY year
    """), params).fetchall()

    return {
        "dominantCutoffs": [
            {"value": r[0], "unit": r[1] or "", "operator": r[2] or "", "count": r[3]}
            for r in dominant_cutoffs
        ],
        "assaysUsed": [{"name": r[0], "count": r[1]} for r in assays_used],
        "companionDiagnostics": [r[0] for r in cdx_assays],
        "cutoffTrends": [
            {"year": r[0], "cutoffValue": r[1], "cutoffUnit": r[2],
             "trialCount": r[3], "dominantAssay": r[4]}
            for r in cutoff_trends
        ],
    }


def fetch_druggability(db: Session, indication: str, biomarker: str) -> dict:
    """Fetch Open Targets druggability scores, tractability, and drug lists."""
    params = {"biomarker": biomarker, "indication": indication}

    ot_row = db.execute(text("""
        SELECT
            MAX(overall_score) as overall_score,
            MAX(drug_score) as drug_score,
            MAX(cancer_biomarker_score) as cancer_bm_score,
            MAX(cancer_gene_census_score) as cgc_score,
            MAX(literature_score) as lit_score,
            BOOL_OR(sm_tractable) as sm_tractable,
            BOOL_OR(sm_has_approved_drug) as sm_approved,
            BOOL_OR(ab_tractable) as ab_tractable,
            BOOL_OR(ab_has_approved_drug) as ab_approved,
            BOOL_OR(protac_tractable) as protac_tractable,
            SUM(unique_drugs) as total_drugs,
            SUM(approved_drug_count) as total_approved
        FROM ot_target_associations
        WHERE biomarker_symbol = :biomarker AND indication_name = :indication
    """), params).fetchone()

    approved_drugs = db.execute(text("""
        SELECT DISTINCT ON (drug_name)
            drug_name, drug_type, year_approved, mechanism_of_action, max_phase
        FROM ot_known_drugs
        WHERE biomarker_symbol = :biomarker AND indication_name = :indication
        AND is_approved = true
        ORDER BY drug_name, max_phase DESC
    """), params).fetchall()

    pipeline_drugs = db.execute(text("""
        SELECT DISTINCT ON (drug_name)
            drug_name, drug_type, max_phase, mechanism_of_action
        FROM ot_known_drugs
        WHERE biomarker_symbol = :biomarker AND indication_name = :indication
        AND is_approved = false AND max_phase >= 2
        ORDER BY drug_name, max_phase DESC
    """), params).fetchall()

    return {
        "overallScore": float(ot_row[0]) if ot_row and ot_row[0] else 0,
        "drugScore": float(ot_row[1]) if ot_row and ot_row[1] else 0,
        "cancerBiomarkerScore": float(ot_row[2]) if ot_row and ot_row[2] else 0,
        "cancerGeneCensusScore": float(ot_row[3]) if ot_row and ot_row[3] else 0,
        "literatureScore": float(ot_row[4]) if ot_row and ot_row[4] else 0,
        "smTractable": bool(ot_row[5]) if ot_row else False,
        "smHasApprovedDrug": bool(ot_row[6]) if ot_row else False,
        "abTractable": bool(ot_row[7]) if ot_row else False,
        "abHasApprovedDrug": bool(ot_row[8]) if ot_row else False,
        "protacTractable": bool(ot_row[9]) if ot_row else False,
        "totalDrugCandidates": int(ot_row[10]) if ot_row and ot_row[10] else 0,
        "totalApproved": int(ot_row[11]) if ot_row and ot_row[11] else 0,
        "approvedDrugs": [
            {"name": r[0], "type": r[1], "yearApproved": r[2],
             "moa": r[3], "phase": float(r[4]) if r[4] else None}
            for r in approved_drugs
        ],
        "pipelineDrugs": [
            {"name": r[0], "type": r[1], "phase": float(r[2]) if r[2] else None, "moa": r[3]}
            for r in pipeline_drugs
        ],
    }


def fetch_evidence(db: Session, indication: str, biomarker: str) -> dict:
    """Fetch cancer biomarker evidence grouped by confidence level."""
    params = {"biomarker": biomarker, "indication": indication}

    evidence_rows = db.execute(text("""
        SELECT biomarker_symbol, drug_name, confidence, disease_from_source
        FROM ot_cancer_biomarker_evidence
        WHERE biomarker_symbol = :biomarker AND indication_name = :indication
        ORDER BY
            CASE confidence
                WHEN 'FDA guidelines' THEN 1
                WHEN 'NCCN guidelines' THEN 2
                WHEN 'NCCN/CAP guidelines' THEN 3
                WHEN 'European LeukemiaNet guidelines' THEN 4
                WHEN 'Late trials' THEN 5
                WHEN 'Early trials' THEN 6
                WHEN 'Clinical trials' THEN 7
                WHEN 'Case report' THEN 8
                WHEN 'Pre-clinical' THEN 9
                ELSE 10
            END
    """), params).fetchall()

    evidence_by_level: dict[str, list] = {}
    for r in evidence_rows:
        level = r[2] or "Unknown"
        if level not in evidence_by_level:
            evidence_by_level[level] = []
        evidence_by_level[level].append({
            "biomarker": r[0], "drug": r[1], "disease": r[3]
        })

    return {
        "total": len(evidence_rows),
        "byLevel": evidence_by_level,
    }


def fetch_assay_landscape(db: Session, biomarker: str) -> dict:
    """Fetch FDA-approved and research-use assays for the biomarker."""
    params = {"biomarker": biomarker}

    all_assays = db.execute(text("""
        SELECT name, manufacturer, platform, fda_approved, companion_dx_for
        FROM assays
        WHERE :biomarker = ANY(biomarker_names)
        ORDER BY fda_approved DESC, name
    """), params).fetchall()

    return {
        "fdaApproved": [
            {"name": r[0], "manufacturer": r[1], "platform": r[2], "cdxFor": r[4]}
            for r in all_assays if r[3]
        ],
        "researchUse": [
            {"name": r[0], "manufacturer": r[1], "platform": r[2]}
            for r in all_assays if not r[3]
        ],
    }


def fetch_genetic_context(db: Session, biomarker: str) -> dict:
    """Fetch GWAS variants for gene symbols mapped from the biomarker name."""
    gene_symbols = BIOMARKER_GENE_MAP.get(biomarker, [])
    gwas_variants = []
    if gene_symbols:
        placeholders = ", ".join(f":gene_{i}" for i in range(len(gene_symbols)))
        gene_params = {f"gene_{i}": g for i, g in enumerate(gene_symbols)}
        gwas_rows = db.execute(text(f"""
            SELECT rs_id, gene, trait_name, p_value, odds_ratio, risk_allele, population, pubmed_id
            FROM gwas_associations
            WHERE gene IN ({placeholders})
            ORDER BY p_value ASC LIMIT 10
        """), gene_params).fetchall()
        gwas_variants = [
            {"rsId": r[0], "gene": r[1], "trait": r[2], "pValue": r[3],
             "oddsRatio": r[4], "riskAllele": r[5], "population": r[6], "pubmedId": r[7]}
            for r in gwas_rows
        ]

    return {
        "gwasVariants": gwas_variants,
        "geneSymbols": gene_symbols,
    }


def fetch_publications(db: Session, indication: str, biomarker: str) -> list:
    """Fetch recent PubMed articles mentioning the biomarker and indication."""
    params = {"biomarker": biomarker, "indication": indication}

    pubmed_rows = db.execute(text("""
        SELECT pmid, title, journal, pub_date, authors
        FROM pubmed_articles
        WHERE :biomarker = ANY(biomarker_mentions)
        AND :indication = ANY(indication_mentions)
        ORDER BY pub_date DESC NULLS LAST
        LIMIT 10
    """), params).fetchall()

    return [
        {"pmid": r[0], "title": r[1], "journal": r[2],
         "pubDate": str(r[3]) if r[3] else None,
         "authors": r[4][:3] if r[4] else []}
        for r in pubmed_rows
    ]


def fetch_all_strategy_data(db: Session, indication: str, biomarker: str) -> dict:
    """Fetch all 7 data sections for a biomarker-indication pair."""
    return {
        "trialSummary": fetch_trial_summary(db, indication, biomarker),
        "cutoffLandscape": fetch_cutoff_landscape(db, indication, biomarker),
        "druggability": fetch_druggability(db, indication, biomarker),
        "evidence": fetch_evidence(db, indication, biomarker),
        "assayLandscape": fetch_assay_landscape(db, biomarker),
        "geneticContext": fetch_genetic_context(db, biomarker),
        "publications": fetch_publications(db, indication, biomarker),
    }
