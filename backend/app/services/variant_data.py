"""Variant-level data service.

Cross-source joins for mutation-level intelligence: prevalence (cBioPortal),
actionability (OncoKB), FDA approvals, trial counts, CIViC evidence, and provenance.
"""
from sqlalchemy import text
from sqlalchemy.orm import Session


def fetch_variant_card(db: Session, gene: str, variant: str) -> dict:
    """Unified variant intelligence card joining all data sources."""

    # 1. Prevalence per cancer type (from mutation_prevalence)
    prevalence_rows = db.execute(text("""
        SELECT cancer_type, indication_name, sample_count, total_profiled,
               frequency, dataset, co_mutations, source_url
        FROM mutation_prevalence
        WHERE gene = :gene AND variant_name = :variant
        ORDER BY frequency DESC
    """), {"gene": gene, "variant": variant}).fetchall()

    prevalence = {}
    co_mutations = None
    for r in prevalence_rows:
        key = r[1] or r[0]  # Use indication_name if available, else cancer_type
        if key not in prevalence:
            prevalence[key] = {
                "cancerType": r[0],
                "frequency": r[4],
                "sampleCount": r[2],
                "totalProfiled": r[3],
                "dataset": r[5],
                "sourceUrl": r[7],
            }
        # Use co-mutations from first (highest frequency) entry
        if co_mutations is None and r[6]:
            co_mutations = r[6]

    # 2. Actionability levels (from oncokb_actionability)
    actionability_rows = db.execute(text("""
        SELECT cancer_type, indication_name, level, drugs, description,
               citations, source_url
        FROM oncokb_actionability
        WHERE gene = :gene AND variant_name = :variant
        ORDER BY level
    """), {"gene": gene, "variant": variant}).fetchall()

    actionability = {}
    for r in actionability_rows:
        key = r[1] or r[0]
        actionability[key] = {
            "cancerType": r[0],
            "level": r[2],
            "drugs": r[3] or [],
            "description": r[4],
            "citations": r[5],
            "sourceUrl": r[6],
        }

    # 3. FDA approvals (from fda_approvals)
    fda_rows = db.execute(text("""
        SELECT drug_name, generic_name, application_number, approval_date,
               biomarker_variant, indication_name, companion_dx_name,
               companion_dx_pma, source_url
        FROM fda_approvals
        WHERE biomarker_gene = :gene
        AND (biomarker_variant = :variant OR biomarker_variant ILIKE :variant_pattern)
        ORDER BY approval_date
    """), {"gene": gene, "variant": variant, "variant_pattern": f"%{variant}%"}).fetchall()

    fda_approvals = [
        {
            "drugName": r[0],
            "genericName": r[1],
            "applicationNumber": r[2],
            "approvalDate": str(r[3]) if r[3] else None,
            "variant": r[4],
            "indication": r[5],
            "companionDxName": r[6],
            "companionDxPma": r[7],
            "sourceUrl": r[8],
        }
        for r in fda_rows
    ]

    # 4. Trial counts with variant filter
    trial_params = {"gene": gene, "variant": variant}

    # Try exact match on variant_name first, then fallback to cutoff_value
    trial_total = db.execute(text("""
        SELECT COUNT(DISTINCT t.id)
        FROM trial_biomarkers tb
        JOIN trials t ON tb.trial_id = t.id
        WHERE tb.biomarker_name = :gene
        AND (tb.variant_name = :variant OR tb.cutoff_value ILIKE :pattern)
    """), {**trial_params, "pattern": f"%{variant}%"}).scalar() or 0

    trial_recruiting = db.execute(text("""
        SELECT COUNT(DISTINCT t.id)
        FROM trial_biomarkers tb
        JOIN trials t ON tb.trial_id = t.id
        WHERE tb.biomarker_name = :gene
        AND (tb.variant_name = :variant OR tb.cutoff_value ILIKE :pattern)
        AND t.overall_status = 'Recruiting'
    """), {**trial_params, "pattern": f"%{variant}%"}).scalar() or 0

    trial_by_phase = db.execute(text("""
        SELECT t.phase, COUNT(DISTINCT t.id) as cnt
        FROM trial_biomarkers tb
        JOIN trials t ON tb.trial_id = t.id
        WHERE tb.biomarker_name = :gene
        AND (tb.variant_name = :variant OR tb.cutoff_value ILIKE :pattern)
        AND t.phase IS NOT NULL
        GROUP BY t.phase ORDER BY cnt DESC
    """), {**trial_params, "pattern": f"%{variant}%"}).fetchall()

    trial_top_sponsors = db.execute(text("""
        SELECT t.lead_sponsor_name, COUNT(DISTINCT t.id) as cnt
        FROM trial_biomarkers tb
        JOIN trials t ON tb.trial_id = t.id
        WHERE tb.biomarker_name = :gene
        AND (tb.variant_name = :variant OR tb.cutoff_value ILIKE :pattern)
        AND t.lead_sponsor_name IS NOT NULL
        GROUP BY t.lead_sponsor_name ORDER BY cnt DESC LIMIT 10
    """), {**trial_params, "pattern": f"%{variant}%"}).fetchall()

    trials = {
        "total": trial_total,
        "recruiting": trial_recruiting,
        "byPhase": [{"phase": r[0] or "Unknown", "count": r[1]} for r in trial_by_phase],
        "topSponsors": [{"name": r[0], "count": r[1]} for r in trial_top_sponsors],
    }

    # 5. CIViC evidence
    civic_rows = db.execute(text("""
        SELECT evidence_level, evidence_direction, significance, drugs,
               disease_name, source_pmid, evidence_type
        FROM civic_evidence
        WHERE gene_name = :gene AND variant_name = :variant
        ORDER BY evidence_level
    """), {"gene": gene, "variant": variant}).fetchall()

    civic_evidence = [
        {
            "level": r[0],
            "direction": r[1],
            "significance": r[2],
            "drugs": r[3] or [],
            "disease": r[4],
            "pmid": r[5],
            "type": r[6],
        }
        for r in civic_rows
    ]

    # 6. Provenance
    provenance_rows = db.execute(text("""
        SELECT DISTINCT source_name, version_tag, access_date
        FROM data_provenance
        WHERE (entity_type = 'prevalence' AND entity_id IN (
            SELECT id FROM mutation_prevalence WHERE gene = :gene AND variant_name = :variant
        ))
        OR (entity_type = 'actionability' AND entity_id IN (
            SELECT id FROM oncokb_actionability WHERE gene = :gene AND variant_name = :variant
        ))
        OR (entity_type = 'fda_approval' AND entity_id IN (
            SELECT id FROM fda_approvals WHERE biomarker_gene = :gene AND biomarker_variant = :variant
        ))
        ORDER BY access_date DESC
    """), {"gene": gene, "variant": variant}).fetchall()

    provenance = [
        {"source": r[0], "version": r[1], "accessed": str(r[2]) if r[2] else None}
        for r in provenance_rows
    ]

    return {
        "gene": gene,
        "variant": variant,
        "prevalence": prevalence,
        "actionability": actionability,
        "fdaApprovals": fda_approvals,
        "trials": trials,
        "coMutations": co_mutations or [],
        "civicEvidence": civic_evidence,
        "provenance": provenance,
    }


def fetch_variant_landscape(db: Session, gene: str) -> dict:
    """All known variants for a gene across cancer types."""

    # Variants from prevalence data
    prev_rows = db.execute(text("""
        SELECT variant_name, indication_name, cancer_type, frequency, sample_count, total_profiled
        FROM mutation_prevalence
        WHERE gene = :gene AND indication_name IS NOT NULL
        ORDER BY frequency DESC
    """), {"gene": gene}).fetchall()

    # Build heatmap: variant x indication -> frequency
    variants_set = set()
    indications_set = set()
    heatmap: dict[str, dict[str, float]] = {}

    for r in prev_rows:
        variant, indication = r[0], r[1]
        variants_set.add(variant)
        indications_set.add(indication)
        if variant not in heatmap:
            heatmap[variant] = {}
        heatmap[variant][indication] = r[3]

    # Actionability levels per variant
    act_rows = db.execute(text("""
        SELECT variant_name, indication_name, level, drugs
        FROM oncokb_actionability
        WHERE gene = :gene AND indication_name IS NOT NULL
        ORDER BY level
    """), {"gene": gene}).fetchall()

    actionability_map: dict[str, dict] = {}
    for r in act_rows:
        variant, indication = r[0], r[1]
        variants_set.add(variant)
        indications_set.add(indication)
        if variant not in actionability_map:
            actionability_map[variant] = {}
        actionability_map[variant][indication] = {"level": r[2], "drugs": r[3] or []}

    # Sort variants by total frequency descending
    variant_totals = {}
    for variant in variants_set:
        variant_totals[variant] = sum(heatmap.get(variant, {}).values())
    sorted_variants = sorted(variants_set, key=lambda v: variant_totals.get(v, 0), reverse=True)

    return {
        "gene": gene,
        "variants": sorted_variants,
        "indications": sorted(indications_set),
        "prevalenceHeatmap": heatmap,
        "actionabilityMap": actionability_map,
    }


def fetch_patient_funnel(db: Session, gene: str, variant: str, indication: str) -> dict:
    """Patient funnel data for a specific variant in a specific indication.

    Uses GENIE prevalence data + published reference estimates for testing rates
    and treatment penetration.
    """

    # Reference incidence data (approximate annual US estimates, sourced from SEER/NCI)
    INCIDENCE_ESTIMATES = {
        "NSCLC": 228000,
        "Breast Cancer": 310000,
        "Colorectal Cancer": 153000,
        "Melanoma": 100000,
        "Gastric Cancer": 27000,
    }

    # Approximate testing rates for molecular profiling (published literature estimates)
    TESTING_RATES = {
        "NSCLC": {"KRAS": 0.70, "EGFR": 0.75, "BRAF": 0.65, "ALK": 0.75, "ROS1": 0.60,
                   "RET": 0.55, "MET": 0.55, "NTRK": 0.50, "ERBB2": 0.50},
        "Breast Cancer": {"ERBB2": 0.95, "PIK3CA": 0.60, "BRCA1": 0.40},
        "Colorectal Cancer": {"KRAS": 0.80, "BRAF": 0.70, "ERBB2": 0.30},
        "Melanoma": {"BRAF": 0.85},
        "Gastric Cancer": {"ERBB2": 0.70},
    }

    incidence = INCIDENCE_ESTIMATES.get(indication, 0)
    testing_rate = TESTING_RATES.get(indication, {}).get(gene, 0.5)

    # Get prevalence from our data
    prev_row = db.execute(text("""
        SELECT frequency, sample_count, total_profiled, dataset
        FROM mutation_prevalence
        WHERE gene = :gene AND variant_name = :variant AND indication_name = :indication
        ORDER BY total_profiled DESC
        LIMIT 1
    """), {"gene": gene, "variant": variant, "indication": indication}).fetchone()

    # Gene-level mutation rate (all variants of this gene)
    gene_freq_row = db.execute(text("""
        SELECT SUM(sample_count)::float / MAX(total_profiled) as gene_freq
        FROM mutation_prevalence
        WHERE gene = :gene AND indication_name = :indication
    """), {"gene": gene, "indication": indication}).fetchone()

    gene_mutation_rate = float(gene_freq_row[0]) if gene_freq_row and gene_freq_row[0] else 0.25
    variant_freq = float(prev_row[0]) if prev_row else 0.0

    # Count recruiting trials for this variant
    trial_count = db.execute(text("""
        SELECT COUNT(DISTINCT t.id)
        FROM trial_biomarkers tb
        JOIN trials t ON tb.trial_id = t.id
        JOIN trial_indications ti ON t.id = ti.trial_id
        JOIN indications i ON ti.indication_id = i.id
        WHERE tb.biomarker_name = :gene
        AND (tb.variant_name = :variant OR tb.cutoff_value ILIKE :pattern)
        AND i.name = :indication
        AND t.overall_status = 'Recruiting'
    """), {"gene": gene, "variant": variant, "pattern": f"%{variant}%",
           "indication": indication}).scalar() or 0

    # Build funnel stages
    tested = int(incidence * testing_rate)
    gene_positive = int(tested * gene_mutation_rate)
    variant_positive = int(tested * variant_freq) if variant_freq > 0 else int(gene_positive * 0.3)

    # Estimate eligibility (~60-70% of variant-positive patients meet trial criteria)
    eligible = int(variant_positive * 0.65)
    # Estimate on-treatment (~25-35% treatment penetration for targeted therapies)
    on_treatment = int(variant_positive * 0.30)

    stages = [
        {"name": f"All {indication}", "count": incidence, "source": "SEER/NCI Annual Estimates"},
        {"name": f"Tested for {gene}", "count": tested, "pct": testing_rate,
         "source": "Published testing rate estimates"},
        {"name": f"{gene} Mutated", "count": gene_positive, "pct": gene_mutation_rate,
         "source": f"cBioPortal ({prev_row[3] if prev_row else 'estimate'})"},
        {"name": f"{gene} {variant}+", "count": variant_positive, "pct": variant_freq if variant_freq > 0 else None,
         "source": f"cBioPortal ({prev_row[3] if prev_row else 'estimate'})"},
        {"name": "Eligible for Therapy", "count": eligible, "pct": 0.65,
         "source": "Estimated from trial eligibility criteria"},
        {"name": "On Treatment", "count": on_treatment, "pct": 0.30,
         "source": "Treatment penetration estimate"},
    ]

    return {
        "gene": gene,
        "variant": variant,
        "indication": indication,
        "stages": stages,
        "recruitingTrials": trial_count,
        "datasetUsed": prev_row[3] if prev_row else None,
    }
