"""Druggability API — serves Open Targets druggability data."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct, case, and_

from app.database import get_db
from app.models.external import OTTargetAssociation, OTKnownDrug, OTCancerBiomarkerEvidence

router = APIRouter(prefix="/api/druggability", tags=["druggability"])


@router.get("/{indication}")
def get_druggability_matrix(indication: str, db: Session = Depends(get_db)):
    """
    Return the druggability matrix for an indication.
    Each row = one biomarker target with:
      - association scores, tractability flags, drug counts
      - aggregated across sub-genes (e.g., NTRK = NTRK1 + NTRK2 + NTRK3)
    """
    rows = db.query(OTTargetAssociation).filter(
        OTTargetAssociation.indication_name == indication
    ).order_by(OTTargetAssociation.overall_score.desc()).all()

    if not rows:
        return []

    # Aggregate by biomarker_symbol (e.g. NTRK has 3 genes)
    bm_data: dict[str, dict] = {}
    for r in rows:
        bm = r.biomarker_symbol
        if bm not in bm_data:
            bm_data[bm] = {
                "biomarkerSymbol": bm,
                "genes": [],
                "overallScore": 0,
                "drugScore": 0,
                "cancerBiomarkerScore": 0,
                "cancerGeneCensusScore": 0,
                "intogenScore": 0,
                "literatureScore": 0,
                "smTractable": False,
                "smHasApprovedDrug": False,
                "abTractable": False,
                "abHasApprovedDrug": False,
                "protacTractable": False,
                "uniqueDrugs": 0,
                "approvedDrugCount": 0,
            }
        entry = bm_data[bm]
        entry["genes"].append({
            "geneSymbol": r.ensembl_id,
            "ensemblId": r.ensembl_id,
            "score": r.overall_score,
        })
        # Take the max score across sub-genes
        entry["overallScore"] = max(entry["overallScore"], r.overall_score)
        entry["drugScore"] = max(entry["drugScore"], r.drug_score or 0)
        entry["cancerBiomarkerScore"] = max(entry["cancerBiomarkerScore"], r.cancer_biomarker_score or 0)
        entry["cancerGeneCensusScore"] = max(entry["cancerGeneCensusScore"], r.cancer_gene_census_score or 0)
        entry["intogenScore"] = max(entry["intogenScore"], r.intogen_score or 0)
        entry["literatureScore"] = max(entry["literatureScore"], r.literature_score or 0)
        # OR for boolean flags
        entry["smTractable"] = entry["smTractable"] or r.sm_tractable
        entry["smHasApprovedDrug"] = entry["smHasApprovedDrug"] or r.sm_has_approved_drug
        entry["abTractable"] = entry["abTractable"] or r.ab_tractable
        entry["abHasApprovedDrug"] = entry["abHasApprovedDrug"] or r.ab_has_approved_drug
        entry["protacTractable"] = entry["protacTractable"] or r.protac_tractable
        # Sum drug counts
        entry["uniqueDrugs"] += r.unique_drugs or 0
        entry["approvedDrugCount"] += r.approved_drug_count or 0

    # Sort by overallScore descending
    result = sorted(bm_data.values(), key=lambda x: x["overallScore"], reverse=True)
    return result


@router.get("/{indication}/{biomarker}/drugs")
def get_drugs_for_biomarker(indication: str, biomarker: str, db: Session = Depends(get_db)):
    """
    Return all known drugs for a specific biomarker-indication pair.
    Deduplicates by drug name, picks highest phase per drug.
    """
    rows = db.query(OTKnownDrug).filter(
        OTKnownDrug.indication_name == indication,
        OTKnownDrug.biomarker_symbol == biomarker,
    ).order_by(OTKnownDrug.max_phase.desc().nullslast(), OTKnownDrug.drug_name).all()

    # Deduplicate by drug name — keep highest phase entry
    seen: dict[str, dict] = {}
    for r in rows:
        name = r.drug_name
        if name not in seen or (r.max_phase or 0) > (seen[name].get("maxPhase") or 0):
            seen[name] = {
                "drugName": r.drug_name,
                "drugChemblId": r.drug_chembl_id,
                "drugType": r.drug_type,
                "maxPhase": r.max_phase,
                "isApproved": r.is_approved,
                "yearApproved": r.year_approved,
                "mechanismOfAction": r.mechanism_of_action,
                "diseaseName": r.disease_name,
                "diseaseEfoId": r.disease_efo_id,
            }

    # Sort: approved first, then by phase desc
    result = sorted(seen.values(), key=lambda x: (-(1 if x["isApproved"] else 0), -(x["maxPhase"] or 0)))
    return result


@router.get("/{indication}/evidence")
def get_cancer_biomarker_evidence(indication: str, db: Session = Depends(get_db)):
    """
    Return cancer biomarker evidence (drug sensitivity/resistance) for an indication.
    Grouped by confidence level.
    """
    rows = db.query(OTCancerBiomarkerEvidence).filter(
        OTCancerBiomarkerEvidence.indication_name == indication
    ).order_by(OTCancerBiomarkerEvidence.confidence).all()

    # Group by confidence level
    confidence_order = ["FDA guidelines", "NCCN guidelines", "European LeukemiaNet guidelines",
                        "NCCN/CAP guidelines", "Late trials", "Early trials",
                        "Case report", "Pre-clinical"]
    result = []
    for r in rows:
        result.append({
            "biomarkerSymbol": r.biomarker_symbol,
            "drugName": r.drug_name,
            "confidence": r.confidence,
            "diseaseFromSource": r.disease_from_source,
        })

    # Sort by confidence order
    def conf_sort_key(x):
        c = x.get("confidence", "")
        if c in confidence_order:
            return confidence_order.index(c)
        return len(confidence_order)

    result.sort(key=conf_sort_key)
    return result
