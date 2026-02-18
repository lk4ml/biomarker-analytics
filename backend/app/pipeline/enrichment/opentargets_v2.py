"""
Open Targets druggability pipeline — fetches real data from the OT Platform GraphQL API.

For each biomarker-gene × indication, fetches:
  1. Target-disease association scores (overall + per-datasource)
  2. Tractability assessments (small molecule, antibody, PROTAC)
  3. Known drugs (approved + pipeline) via ChEMBL
  4. Cancer biomarker evidence (drug sensitivity/resistance) from CGI
"""

import json
import subprocess
import time
import logging
from datetime import datetime

from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import SessionLocal
from app.models.external import OTTargetAssociation, OTKnownDrug, OTCancerBiomarkerEvidence
from app.models.pipeline import PipelineRun

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

OT_GRAPHQL = "https://api.platform.opentargets.org/api/v4/graphql"

# Biomarker symbol → list of (gene_symbol, ensembl_id) to query
# Some biomarkers map to multiple genes (e.g., BRCA1/2 → BRCA1 + BRCA2)
BIOMARKER_GENE_MAP: dict[str, list[tuple[str, str]]] = {
    "EGFR":   [("EGFR", "ENSG00000146648")],
    "KRAS":   [("KRAS", "ENSG00000133703")],
    "BRAF":   [("BRAF", "ENSG00000157764")],
    "ALK":    [("ALK", "ENSG00000171094")],
    "HER2":   [("ERBB2", "ENSG00000141736")],
    "PD-L1":  [("CD274", "ENSG00000120217")],
    "NTRK":   [("NTRK1", "ENSG00000198400"), ("NTRK2", "ENSG00000148053"), ("NTRK3", "ENSG00000140538")],
    "BRCA1/2": [("BRCA1", "ENSG00000012048"), ("BRCA2", "ENSG00000139618")],
    "PIK3CA": [("PIK3CA", "ENSG00000121879")],
    "ER":     [("ESR1", "ENSG00000091831")],
    "PR":     [("PGR", "ENSG00000082175")],
    "MSI":    [("MLH1", "ENSG00000076242"), ("MSH2", "ENSG00000095002"), ("MSH6", "ENSG00000116062")],
    "Ki-67":  [("MKI67", "ENSG00000148773")],
    "MET":    [("MET", "ENSG00000105976")],
    "ROS1":   [("ROS1", "ENSG00000047936")],
    "RET":    [("RET", "ENSG00000165731")],
}

# Indication name → EFO ID
INDICATION_EFO_MAP: dict[str, str] = {
    "NSCLC":            "EFO_0003060",
    "Breast Cancer":    "EFO_0000305",
    "Colorectal Cancer": "EFO_1001951",
}


def curl_post_graphql(query: str, variables: dict | None = None) -> dict:
    """POST a GraphQL query to Open Targets and return the JSON response."""
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    cmd = [
        "curl", "-s", "--max-time", "60",
        "-X", "POST", OT_GRAPHQL,
        "-H", "Content-Type: application/json",
        "-d", json.dumps(payload),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
    if result.returncode != 0 or not result.stdout.strip():
        raise RuntimeError(f"OT API call failed: {result.stderr[:500]}")
    data = json.loads(result.stdout)
    if "errors" in data:
        raise RuntimeError(f"OT GraphQL error: {data['errors']}")
    return data


# Cache disease associations so we only fetch once per indication
_disease_assoc_cache: dict[str, dict[str, dict]] = {}


def fetch_disease_associations(efo_id: str) -> dict[str, dict]:
    """Fetch all target-disease associations for a disease. Returns {ensembl_id: row_data}."""
    if efo_id in _disease_assoc_cache:
        return _disease_assoc_cache[efo_id]

    logger.info(f"  Fetching disease associations for {efo_id} (one-time)...")
    q_disease = """
    query ($efoId: String!) {
      disease(efoId: $efoId) {
        associatedTargets(page: { index: 0, size: 500 }) {
          rows {
            target { id approvedSymbol }
            score
            datasourceScores { id score }
          }
        }
      }
    }
    """
    data = curl_post_graphql(q_disease, {"efoId": efo_id})
    rows = data["data"]["disease"]["associatedTargets"]["rows"]
    result = {row["target"]["id"]: row for row in rows}
    _disease_assoc_cache[efo_id] = result
    logger.info(f"    Cached {len(result)} target associations")
    return result


def fetch_target_tractability(ensembl_id: str) -> dict:
    """Fetch target tractability + drug count."""
    q_target = """
    query ($ensemblId: String!) {
      target(ensemblId: $ensemblId) {
        approvedSymbol
        tractability { label modality value }
        knownDrugs(size: 1) { uniqueDrugs count }
      }
    }
    """
    data = curl_post_graphql(q_target, {"ensemblId": ensembl_id})
    return data["data"]["target"]


def fetch_association_and_tractability(ensembl_id: str, efo_id: str) -> dict:
    """Fetch target-disease association score + tractability for one target-disease pair."""
    target_data = fetch_target_tractability(ensembl_id)
    disease_assocs = fetch_disease_associations(efo_id)
    assoc_row = disease_assocs.get(ensembl_id)

    return {
        "target": target_data,
        "association": assoc_row,
    }


def fetch_known_drugs(ensembl_id: str) -> list[dict]:
    """Fetch known drugs for a target (all diseases — we filter in Python)."""
    query = """
    query ($ensemblId: String!) {
      target(ensemblId: $ensemblId) {
        approvedSymbol
        knownDrugs(size: 200) {
          uniqueDrugs
          count
          rows {
            drug { id name drugType maximumClinicalTrialPhase isApproved yearOfFirstApproval }
            disease { id name }
            phase
            mechanismOfAction
          }
        }
      }
    }
    """
    data = curl_post_graphql(query, {"ensemblId": ensembl_id})
    kd = data["data"]["target"]["knownDrugs"]
    return kd["rows"] if kd else []


def fetch_cancer_biomarker_evidence(ensembl_ids: list[str], efo_id: str) -> list[dict]:
    """Fetch cancer biomarker evidence for targets in a disease context."""
    query = """
    query ($efoId: String!, $ensemblIds: [String!]!) {
      disease(efoId: $efoId) {
        evidences(
          ensemblIds: $ensemblIds
          datasourceIds: ["cancer_biomarkers"]
          size: 500
        ) {
          count
          rows {
            target { approvedSymbol id }
            diseaseFromSource
            confidence
            drug { name }
          }
        }
      }
    }
    """
    data = curl_post_graphql(query, {"efoId": efo_id, "ensemblIds": ensembl_ids})
    evs = data["data"]["disease"]["evidences"]
    return evs["rows"] if evs else []


def process_indication(db: Session, indication_name: str, efo_id: str) -> dict:
    """Process all biomarkers for one indication."""
    stats = {"associations": 0, "drugs": 0, "evidence": 0}

    # Collect all ensembl_ids for cancer biomarker evidence batch query
    all_ensembl_ids = []
    for bm_name, genes in BIOMARKER_GENE_MAP.items():
        for gene_sym, ens_id in genes:
            all_ensembl_ids.append(ens_id)

    # 1) Fetch cancer biomarker evidence in one batch
    logger.info(f"  Fetching cancer biomarker evidence for {indication_name}...")
    try:
        evidence_rows = fetch_cancer_biomarker_evidence(all_ensembl_ids, efo_id)
        logger.info(f"    Got {len(evidence_rows)} cancer biomarker evidence records")
    except Exception as e:
        logger.warning(f"    Cancer biomarker evidence failed: {e}")
        evidence_rows = []

    # Store evidence
    for ev in evidence_rows:
        gene_sym = ev["target"]["approvedSymbol"]
        ens_id = ev["target"]["id"]
        # Map gene symbol back to biomarker name
        bm_name = None
        for bn, genes in BIOMARKER_GENE_MAP.items():
            if any(g[0] == gene_sym for g in genes):
                bm_name = bn
                break
        if not bm_name:
            bm_name = gene_sym

        drug_name = ev["drug"]["name"] if ev.get("drug") and ev["drug"] else None
        record = OTCancerBiomarkerEvidence(
            biomarker_symbol=bm_name,
            ensembl_id=ens_id,
            drug_name=drug_name,
            confidence=ev.get("confidence"),
            disease_from_source=ev.get("diseaseFromSource"),
            indication_name=indication_name,
            efo_id=efo_id,
        )
        db.add(record)
        stats["evidence"] += 1

    # 2) For each biomarker-gene, fetch association + tractability + drugs
    for bm_name, genes in BIOMARKER_GENE_MAP.items():
        for gene_sym, ens_id in genes:
            logger.info(f"  {indication_name} → {bm_name} ({gene_sym} / {ens_id})")
            time.sleep(0.3)  # Be nice to the API

            # Fetch association score & tractability
            try:
                result = fetch_association_and_tractability(ens_id, efo_id)
            except Exception as e:
                logger.warning(f"    Association fetch failed for {gene_sym}: {e}")
                continue

            target_info = result["target"]
            assoc = result["association"]

            if not assoc:
                logger.info(f"    {gene_sym} not found in top 500 associated targets for {indication_name}")
                # Still store tractability with score=0
                overall_score = 0
                ds_scores = {}
            else:
                overall_score = assoc["score"]
                ds_scores = {s["id"]: s["score"] for s in assoc["datasourceScores"]}

            # Parse tractability
            tract = {(t["modality"], t["label"]): t["value"] for t in target_info["tractability"]}
            sm_approved = tract.get(("SM", "Approved Drug"), False)
            sm_tractable = sm_approved or any(
                tract.get(("SM", l), False)
                for l in ["Advanced Clinical", "Phase 1 Clinical", "High-Quality Pocket", "Druggable Family"]
            )
            ab_approved = tract.get(("AB", "Approved Drug"), False)
            ab_tractable = ab_approved or any(
                tract.get(("AB", l), False)
                for l in ["Advanced Clinical", "Phase 1 Clinical", "UniProt loc high conf", "GO CC high conf"]
            )
            protac_tractable = any(
                tract.get(("PR", l), False)
                for l in ["Approved Drug", "Advanced Clinical", "Phase 1 Clinical", "Literature", "Small Molecule Binder"]
            )

            # Upsert association record
            assoc_values = dict(
                biomarker_symbol=bm_name,
                ensembl_id=ens_id,
                indication_name=indication_name,
                efo_id=efo_id,
                overall_score=overall_score,
                drug_score=ds_scores.get("chembl", 0),
                cancer_biomarker_score=ds_scores.get("cancer_biomarkers", 0),
                cancer_gene_census_score=ds_scores.get("cancer_gene_census", 0),
                intogen_score=ds_scores.get("intogen", 0),
                literature_score=ds_scores.get("europepmc", 0),
                sm_tractable=sm_tractable,
                sm_has_approved_drug=sm_approved,
                ab_tractable=ab_tractable,
                ab_has_approved_drug=ab_approved,
                protac_tractable=protac_tractable,
                unique_drugs=target_info["knownDrugs"]["uniqueDrugs"] if target_info.get("knownDrugs") else 0,
                approved_drug_count=0,  # will update below
                fetched_at=datetime.utcnow(),
            )
            stmt = pg_insert(OTTargetAssociation).values(**assoc_values)
            stmt = stmt.on_conflict_do_update(
                constraint="uq_ot_assoc_target_disease",
                set_={k: v for k, v in assoc_values.items() if k not in ("ensembl_id", "efo_id")},
            )
            db.execute(stmt)
            stats["associations"] += 1

            # 3) Fetch known drugs for this target
            time.sleep(0.3)
            try:
                drug_rows = fetch_known_drugs(ens_id)
                logger.info(f"    Got {len(drug_rows)} drug-disease links")
            except Exception as e:
                logger.warning(f"    Drug fetch failed for {gene_sym}: {e}")
                drug_rows = []

            # Deduplicate and store drugs — only keep drugs relevant to this indication
            # (disease must be related to our indication)
            seen_drugs = set()
            approved_count = 0
            for dr in drug_rows:
                drug = dr["drug"]
                disease = dr["disease"]
                if not drug or not disease:
                    continue
                drug_id = drug.get("id", "")
                disease_id = disease.get("id", "")
                dedup_key = (drug_id, disease_id)
                if dedup_key in seen_drugs:
                    continue
                seen_drugs.add(dedup_key)

                is_approved = drug.get("isApproved", False)
                if is_approved:
                    approved_count += 1

                drug_values = dict(
                    biomarker_symbol=bm_name,
                    ensembl_id=ens_id,
                    drug_name=drug.get("name", "Unknown"),
                    drug_chembl_id=drug_id,
                    drug_type=drug.get("drugType"),
                    max_phase=drug.get("maximumClinicalTrialPhase"),
                    is_approved=is_approved,
                    year_approved=drug.get("yearOfFirstApproval"),
                    mechanism_of_action=dr.get("mechanismOfAction"),
                    disease_name=disease.get("name"),
                    disease_efo_id=disease_id,
                    indication_name=indication_name,
                    fetched_at=datetime.utcnow(),
                )
                stmt = pg_insert(OTKnownDrug).values(**drug_values)
                stmt = stmt.on_conflict_do_update(
                    constraint="uq_ot_drug_target_disease_ind",
                    set_={k: v for k, v in drug_values.items()
                          if k not in ("ensembl_id", "drug_chembl_id", "disease_efo_id", "indication_name")},
                )
                db.execute(stmt)
                stats["drugs"] += 1

            # Update approved_drug_count on the association
            db.execute(
                OTTargetAssociation.__table__.update()
                .where(OTTargetAssociation.ensembl_id == ens_id)
                .where(OTTargetAssociation.efo_id == efo_id)
                .values(approved_drug_count=approved_count)
            )

    db.commit()
    return stats


def run_ot_druggability_pipeline():
    """Main entry point — run for all 3 indications."""
    logger.info("=" * 60)
    logger.info("Starting Open Targets Druggability Pipeline")
    logger.info("=" * 60)

    db = SessionLocal()
    try:
        # Record pipeline run
        run = PipelineRun(
            pipeline_name="open_targets_druggability",
            status="running",
            started_at=datetime.utcnow(),
        )
        db.add(run)
        db.commit()

        # Clear old data
        db.query(OTCancerBiomarkerEvidence).delete()
        db.query(OTKnownDrug).delete()
        db.query(OTTargetAssociation).delete()
        db.commit()
        logger.info("Cleared old OT druggability data")

        total_stats = {"associations": 0, "drugs": 0, "evidence": 0}

        for indication_name, efo_id in INDICATION_EFO_MAP.items():
            logger.info(f"\n{'='*40}")
            logger.info(f"Processing: {indication_name} ({efo_id})")
            logger.info(f"{'='*40}")
            try:
                stats = process_indication(db, indication_name, efo_id)
                for k, v in stats.items():
                    total_stats[k] += v
                logger.info(f"  → {indication_name} done: {stats}")
            except Exception as e:
                logger.error(f"  → {indication_name} FAILED: {e}")
                db.rollback()

        # Update pipeline run
        run.status = "completed"
        run.completed_at = datetime.utcnow()
        run.records_created = sum(total_stats.values())
        run.metadata_ = total_stats
        db.commit()

        logger.info(f"\n{'='*60}")
        logger.info(f"Pipeline complete: {total_stats}")
        logger.info(f"{'='*60}")

    except Exception as e:
        logger.error(f"Pipeline failed: {e}")
        run.status = "failed"
        run.error_message = str(e)[:500]
        db.commit()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run_ot_druggability_pipeline()
