"""Trial and trial-biomarker API endpoints."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.responses import TrialBiomarkerUsageResponse, PaginatedTrialBiomarkers
from app.api.strategy import BIOMARKER_GENE_MAP

router = APIRouter(prefix="/api", tags=["trials"])


@router.get("/trial-biomarkers", response_model=PaginatedTrialBiomarkers)
def get_trial_biomarkers(
    indication: str | None = Query(None),
    biomarker: str | None = Query(None),
    phase: str | None = Query(None),
    setting: str | None = Query(None),
    sponsor: str | None = Query(None),
    status: str | None = Query(None),
    year_from: int | None = Query(None),
    year_to: int | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    conditions = []
    params = {}

    if indication and indication != "All":
        conditions.append("tb.tumor_type = :indication")
        params["indication"] = indication
    if biomarker and biomarker != "All":
        conditions.append("tb.biomarker_name = :biomarker")
        params["biomarker"] = biomarker
    if phase and phase != "All":
        conditions.append("t.phase = :phase")
        params["phase"] = phase
    if setting and setting != "All":
        conditions.append("tb.therapeutic_setting = :setting")
        params["setting"] = setting
    if sponsor:
        conditions.append("t.lead_sponsor_name ILIKE :sponsor")
        params["sponsor"] = f"%{sponsor}%"
    if status and status != "All":
        conditions.append("t.overall_status = :status")
        params["status"] = status
    if year_from:
        conditions.append("t.start_year >= :year_from")
        params["year_from"] = year_from
    if year_to:
        conditions.append("t.start_year <= :year_to")
        params["year_to"] = year_to
    if search:
        conditions.append("(t.brief_title ILIKE :search OR t.nct_id ILIKE :search)")
        params["search"] = f"%{search}%"

    where_clause = " AND ".join(conditions) if conditions else "1=1"

    # Count query
    count_q = f"""
        SELECT COUNT(*)
        FROM trial_biomarkers tb
        JOIN trials t ON tb.trial_id = t.id
        WHERE {where_clause}
    """
    total = db.execute(text(count_q), params).scalar() or 0

    # Data query
    offset = (page - 1) * page_size
    data_q = f"""
        SELECT
            t.nct_id, t.brief_title, tb.biomarker_name,
            COALESCE(tb.therapeutic_setting, '1L') as setting,
            COALESCE(tb.tumor_type, 'Solid Tumor') as tumor_type,
            t.phase, tb.cutoff_value, tb.cutoff_unit, tb.cutoff_operator,
            tb.assay_name, COALESCE(tb.assay_manufacturer, 'Various'),
            COALESCE(tb.companion_diagnostic, false),
            COALESCE(t.lead_sponsor_name, 'Unknown'),
            t.overall_status, t.start_year,
            EXTRACT(YEAR FROM t.completion_date)::INTEGER as end_year
        FROM trial_biomarkers tb
        JOIN trials t ON tb.trial_id = t.id
        WHERE {where_clause}
        ORDER BY t.start_year DESC, t.nct_id
        LIMIT :limit OFFSET :offset
    """
    params["limit"] = page_size
    params["offset"] = offset

    rows = db.execute(text(data_q), params).fetchall()

    items = [
        TrialBiomarkerUsageResponse(
            nctId=r[0] or "",
            trialTitle=r[1] or "",
            biomarkerName=r[2] or "",
            setting=r[3] or "1L",
            tumorType=r[4] or "",
            phase=r[5] or "",
            cutoffValue=r[6] or "",
            cutoffUnit=r[7] or "",
            cutoffOperator=r[8] or ">=",
            assayName=r[9] or "",
            assayManufacturer=r[10] or "Various",
            companionDiagnostic=r[11] or False,
            sponsor=r[12] or "Unknown",
            status=r[13] or "",
            startYear=r[14] or 2020,
            endYear=r[15],
        )
        for r in rows
    ]

    total_pages = max(1, (total + page_size - 1) // page_size)
    return PaginatedTrialBiomarkers(
        items=items, total=total, page=page, pageSize=page_size, totalPages=total_pages
    )


@router.get("/trials/{nct_id}")
def get_trial_detail(nct_id: str, db: Session = Depends(get_db)):
    row = db.execute(text("""
        SELECT nct_id, brief_title, official_title, overall_status, phase,
               lead_sponsor_name, lead_sponsor_class, start_date, start_year,
               completion_date, enrollment_count, brief_summary,
               eligibility_criteria, conditions, interventions,
               primary_outcomes, secondary_outcomes
        FROM trials WHERE nct_id = :nct_id
    """), {"nct_id": nct_id}).fetchone()

    if not row:
        return {"error": "Trial not found"}

    biomarkers = db.execute(text("""
        SELECT biomarker_name, cutoff_value, cutoff_unit, cutoff_operator,
               assay_name, assay_platform, companion_diagnostic,
               biomarker_role, therapeutic_setting, raw_snippet
        FROM trial_biomarkers tb
        JOIN trials t ON tb.trial_id = t.id
        WHERE t.nct_id = :nct_id
    """), {"nct_id": nct_id}).fetchall()

    return {
        "nctId": row[0], "briefTitle": row[1], "officialTitle": row[2],
        "status": row[3], "phase": row[4], "sponsor": row[5],
        "sponsorClass": row[6],
        "startDate": str(row[7]) if row[7] else None,
        "startYear": row[8],
        "completionDate": str(row[9]) if row[9] else None,
        "enrollmentCount": row[10],
        "briefSummary": row[11], "eligibilityCriteria": row[12],
        "conditions": row[13], "interventions": row[14],
        "primaryOutcomes": row[15], "secondaryOutcomes": row[16],
        "biomarkers": [
            {
                "biomarkerName": b[0], "cutoffValue": b[1], "cutoffUnit": b[2],
                "cutoffOperator": b[3], "assayName": b[4], "assayPlatform": b[5],
                "companionDiagnostic": b[6], "biomarkerRole": b[7],
                "therapeuticSetting": b[8], "rawSnippet": b[9],
            }
            for b in biomarkers
        ],
    }


@router.get("/trials/{nct_id}/enriched")
def get_enriched_trial_detail(nct_id: str, db: Session = Depends(get_db)):
    """
    Enriched trial detail with cross-references from all data sources.
    For each biomarker × indication, pulls druggability, drugs, evidence,
    assays, GWAS, and PubMed data.
    """
    # ── 1. FULL TRIAL DATA ──
    row = db.execute(text("""
        SELECT id, nct_id, brief_title, official_title, overall_status, phase,
               lead_sponsor_name, lead_sponsor_class, start_date, start_year,
               completion_date, enrollment_count, enrollment_type, brief_summary,
               eligibility_criteria, conditions, interventions,
               primary_outcomes, secondary_outcomes,
               allocation, intervention_model, primary_purpose, masking,
               sex, minimum_age, maximum_age, study_type
        FROM trials WHERE nct_id = :nct_id
    """), {"nct_id": nct_id}).fetchone()

    if not row:
        return {"error": "Trial not found"}

    trial_id = row[0]
    trial = {
        "nctId": row[1], "briefTitle": row[2], "officialTitle": row[3],
        "status": row[4], "phase": row[5], "sponsor": row[6],
        "sponsorClass": row[7],
        "startDate": str(row[8]) if row[8] else None,
        "startYear": row[9],
        "completionDate": str(row[10]) if row[10] else None,
        "enrollmentCount": row[11], "enrollmentType": row[12],
        "briefSummary": row[13], "eligibilityCriteria": row[14],
        "conditions": row[15] or [], "interventions": row[16] or [],
        "primaryOutcomes": row[17] or [], "secondaryOutcomes": row[18] or [],
        "allocation": row[19], "interventionModel": row[20],
        "primaryPurpose": row[21], "masking": row[22],
        "sex": row[23], "minimumAge": row[24], "maximumAge": row[25],
        "studyType": row[26],
    }

    # ── 2. BIOMARKERS (with extraction metadata) ──
    bm_rows = db.execute(text("""
        SELECT biomarker_name, cutoff_value, cutoff_unit, cutoff_operator,
               assay_name, assay_platform, companion_diagnostic,
               biomarker_role, therapeutic_setting, raw_snippet,
               extraction_confidence, extraction_source, biomarker_context
        FROM trial_biomarkers tb
        WHERE tb.trial_id = :trial_id
    """), {"trial_id": trial_id}).fetchall()

    biomarkers = [
        {
            "biomarkerName": b[0], "cutoffValue": b[1], "cutoffUnit": b[2],
            "cutoffOperator": b[3], "assayName": b[4], "assayPlatform": b[5],
            "companionDiagnostic": b[6], "biomarkerRole": b[7],
            "therapeuticSetting": b[8], "rawSnippet": b[9],
            "extractionConfidence": float(b[10]) if b[10] else 0.5,
            "extractionSource": b[11], "biomarkerContext": b[12],
        }
        for b in bm_rows
    ]

    # ── 3. INDICATIONS ──
    ind_rows = db.execute(text("""
        SELECT i.name, i.display_name
        FROM trial_indications ti
        JOIN indications i ON ti.indication_id = i.id
        WHERE ti.trial_id = :trial_id
    """), {"trial_id": trial_id}).fetchall()

    indications = [{"name": r[0], "displayName": r[1]} for r in ind_rows]

    # ── 4. CROSS-REFERENCES ──
    # Get unique biomarker names and indication names
    bm_names = list(set(b["biomarkerName"] for b in biomarkers if b["biomarkerName"]))
    ind_names = [i["name"] for i in indications]

    if not bm_names or not ind_names:
        return {
            "trial": trial, "biomarkers": biomarkers,
            "indications": indications, "crossReferences": {}
        }

    cross_refs: dict[str, dict] = {}

    # 4a. Druggability (batched)
    ot_rows = db.execute(text("""
        SELECT biomarker_symbol, indication_name,
               MAX(overall_score), MAX(drug_score), MAX(cancer_biomarker_score),
               BOOL_OR(sm_tractable), BOOL_OR(sm_has_approved_drug),
               BOOL_OR(ab_tractable), BOOL_OR(ab_has_approved_drug),
               BOOL_OR(protac_tractable),
               SUM(unique_drugs), SUM(approved_drug_count)
        FROM ot_target_associations
        WHERE biomarker_symbol = ANY(:bm_names) AND indication_name = ANY(:ind_names)
        GROUP BY biomarker_symbol, indication_name
    """), {"bm_names": bm_names, "ind_names": ind_names}).fetchall()

    ot_map: dict[str, dict] = {}
    for r in ot_rows:
        key = f"{r[0]}:{r[1]}"
        ot_map[key] = {
            "overallScore": float(r[2]) if r[2] else 0,
            "drugScore": float(r[3]) if r[3] else 0,
            "cancerBiomarkerScore": float(r[4]) if r[4] else 0,
            "smTractable": bool(r[5]), "smHasApprovedDrug": bool(r[6]),
            "abTractable": bool(r[7]), "abHasApprovedDrug": bool(r[8]),
            "protacTractable": bool(r[9]),
            "totalDrugCandidates": int(r[10]) if r[10] else 0,
            "totalApproved": int(r[11]) if r[11] else 0,
        }

    # 4b. Approved drugs (batched)
    drug_rows = db.execute(text("""
        SELECT DISTINCT ON (biomarker_symbol, indication_name, drug_name)
            biomarker_symbol, indication_name,
            drug_name, drug_type, year_approved, mechanism_of_action, max_phase
        FROM ot_known_drugs
        WHERE biomarker_symbol = ANY(:bm_names) AND indication_name = ANY(:ind_names)
        AND is_approved = true
        ORDER BY biomarker_symbol, indication_name, drug_name, max_phase DESC
    """), {"bm_names": bm_names, "ind_names": ind_names}).fetchall()

    drugs_map: dict[str, list] = {}
    for r in drug_rows:
        key = f"{r[0]}:{r[1]}"
        if key not in drugs_map:
            drugs_map[key] = []
        drugs_map[key].append({
            "name": r[2], "type": r[3], "yearApproved": r[4],
            "moa": r[5], "phase": float(r[6]) if r[6] else None,
        })

    # 4c. Cancer biomarker evidence (batched)
    ev_rows = db.execute(text("""
        SELECT biomarker_symbol, indication_name, drug_name, confidence, disease_from_source
        FROM ot_cancer_biomarker_evidence
        WHERE biomarker_symbol = ANY(:bm_names) AND indication_name = ANY(:ind_names)
        ORDER BY
            CASE confidence
                WHEN 'FDA guidelines' THEN 1 WHEN 'NCCN guidelines' THEN 2
                WHEN 'Late trials' THEN 3 WHEN 'Early trials' THEN 4
                WHEN 'Case report' THEN 5 WHEN 'Pre-clinical' THEN 6
                ELSE 7
            END
    """), {"bm_names": bm_names, "ind_names": ind_names}).fetchall()

    evidence_map: dict[str, list] = {}
    for r in ev_rows:
        key = f"{r[0]}:{r[1]}"
        if key not in evidence_map:
            evidence_map[key] = []
        evidence_map[key].append({
            "biomarker": r[0], "drug": r[2], "confidence": r[3], "disease": r[4],
        })

    # 4d. Assays (per biomarker, not per indication)
    assay_rows = db.execute(text("""
        SELECT name, manufacturer, platform, fda_approved, companion_dx_for,
               biomarker_names
        FROM assays
        ORDER BY fda_approved DESC, name
    """)).fetchall()

    assay_map: dict[str, list] = {}
    for r in assay_rows:
        bm_list = r[5] or []
        for bm in bm_names:
            if bm in bm_list:
                if bm not in assay_map:
                    assay_map[bm] = []
                assay_map[bm].append({
                    "name": r[0], "manufacturer": r[1], "platform": r[2],
                    "fdaApproved": r[3], "cdxFor": r[4] or [],
                })

    # 4e. GWAS variants (per biomarker gene symbols)
    all_gene_symbols = []
    gene_to_bm: dict[str, str] = {}
    for bm in bm_names:
        genes = BIOMARKER_GENE_MAP.get(bm, [])
        for g in genes:
            all_gene_symbols.append(g)
            gene_to_bm[g] = bm

    gwas_map: dict[str, list] = {}
    if all_gene_symbols:
        gwas_rows = db.execute(text("""
            SELECT rs_id, gene, trait_name, p_value, odds_ratio, risk_allele, population, pubmed_id
            FROM gwas_associations
            WHERE gene = ANY(:genes)
            ORDER BY p_value ASC
        """), {"genes": all_gene_symbols}).fetchall()

        for r in gwas_rows:
            bm = gene_to_bm.get(r[1], r[1])
            if bm not in gwas_map:
                gwas_map[bm] = []
            gwas_map[bm].append({
                "rsId": r[0], "gene": r[1], "trait": r[2], "pValue": r[3],
                "oddsRatio": r[4], "riskAllele": r[5], "population": r[6], "pubmedId": r[7],
            })

    # 4f. PubMed articles (batched by biomarker + indication)
    pubmed_map: dict[str, list] = {}
    for bm in bm_names:
        for ind in ind_names:
            pm_rows = db.execute(text("""
                SELECT pmid, title, journal, pub_date, authors
                FROM pubmed_articles
                WHERE :bm = ANY(biomarker_mentions)
                AND :ind = ANY(indication_mentions)
                ORDER BY pub_date DESC NULLS LAST
                LIMIT 5
            """), {"bm": bm, "ind": ind}).fetchall()

            if pm_rows:
                key = f"{bm}:{ind}"
                pubmed_map[key] = [
                    {
                        "pmid": r[0], "title": r[1], "journal": r[2],
                        "pubDate": str(r[3]) if r[3] else None,
                        "authors": r[4][:3] if r[4] else [],
                    }
                    for r in pm_rows
                ]

    # ── BUILD CROSS-REFERENCES ──
    for bm in bm_names:
        for ind in ind_names:
            key = f"{bm}:{ind}"
            cross_refs[key] = {
                "druggability": ot_map.get(key),
                "approvedDrugs": drugs_map.get(key, []),
                "cancerEvidence": evidence_map.get(key, []),
                "assays": assay_map.get(bm, []),
                "gwasVariants": gwas_map.get(bm, [])[:5],
                "pubmedArticles": pubmed_map.get(key, []),
            }

    return {
        "trial": trial,
        "biomarkers": biomarkers,
        "indications": indications,
        "crossReferences": cross_refs,
    }
