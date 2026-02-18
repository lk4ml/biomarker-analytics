"""Open Targets Platform enrichment pipeline."""
import json
import subprocess
import time
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.database import SessionLocal
from app.models import OpenTargetsAssociation

OT_API = "https://api.platform.opentargets.org/api/v4/graphql"

GENE_ENSEMBL_MAP = {
    "CD274": "ENSG00000120217",    # PD-L1
    "ERBB2": "ENSG00000141736",    # HER2
    "EGFR": "ENSG00000146648",
    "KRAS": "ENSG00000133703",
    "BRAF": "ENSG00000157764",
    "ALK": "ENSG00000171094",
    "BRCA1": "ENSG00000012048",
    "BRCA2": "ENSG00000139618",
    "MKI67": "ENSG00000148773",    # Ki-67
    "ESR1": "ENSG00000091831",     # ER
    "PGR": "ENSG00000082175",      # PR
    "PIK3CA": "ENSG00000121879",
}

DISEASE_EFO_MAP = {
    "NSCLC": "EFO_0003060",
    "Breast Cancer": "EFO_0000305",
    "Melanoma": "EFO_0000389",
    "Colorectal Cancer": "EFO_0005842",
    "Gastric Cancer": "EFO_0000178",
}

QUERY = """
query TargetDiseaseAssociation($ensemblId: String!, $efoId: String!) {
  disease(efoId: $efoId) {
    name
    associatedTargets(page: {index: 0, size: 1}, Bs: {targetIds: [$ensemblId]}) {
      rows {
        target { id approvedSymbol approvedName }
        score
        datatypeScores {
          id
          score
        }
      }
    }
  }
}
"""


def curl_post_json(url, body, timeout=30):
    """POST JSON via subprocess curl to avoid 403 from httpx."""
    result = subprocess.run(
        ["curl", "-s", "--max-time", str(timeout), "-X", "POST",
         "-H", "Content-Type: application/json",
         "-d", json.dumps(body), url],
        capture_output=True, text=True, timeout=timeout + 10
    )
    if result.returncode != 0:
        raise RuntimeError(f"curl failed: {result.stderr}")
    return json.loads(result.stdout)


def fetch_association(ensembl_id: str, gene_symbol: str, efo_id: str, disease_name: str):
    try:
        data = curl_post_json(OT_API, {
            "query": QUERY,
            "variables": {"ensemblId": ensembl_id, "efoId": efo_id}
        })
        disease = data.get("data", {}).get("disease")
        if not disease:
            return None
        rows = disease.get("associatedTargets", {}).get("rows", [])
        if not rows:
            return None
        row = rows[0]
        dt_scores = {s["id"]: s["score"] for s in row.get("datatypeScores", [])}
        return {
            "target_ensembl_id": ensembl_id,
            "target_symbol": gene_symbol,
            "target_name": row["target"].get("approvedName", ""),
            "disease_efo_id": efo_id,
            "disease_name": disease.get("name", disease_name),
            "association_score": row.get("score"),
            "datatype_scores": {
                "literature": dt_scores.get("literature", 0),
                "rna_expression": dt_scores.get("expression", 0),
                "genetic_association": dt_scores.get("genetic_association", 0),
                "somatic_mutation": dt_scores.get("somatic_mutation", 0),
                "known_drug": dt_scores.get("known_drug", 0),
                "animal_model": dt_scores.get("animal_model", 0),
                "affected_pathway": dt_scores.get("affected_pathway", 0),
            },
        }
    except Exception as e:
        print(f"  OT error for {gene_symbol}/{disease_name}: {e}")
        return None


def run_opentargets_enrichment():
    print("--- Open Targets Enrichment ---")
    db = SessionLocal()
    count = 0

    for gene, ensembl_id in GENE_ENSEMBL_MAP.items():
        for disease, efo_id in DISEASE_EFO_MAP.items():
            result = fetch_association(ensembl_id, gene, efo_id, disease)
            if result:
                stmt = pg_insert(OpenTargetsAssociation).values(**result)
                stmt = stmt.on_conflict_do_update(
                    constraint="uq_ot_target_disease",
                    set_={"association_score": stmt.excluded.association_score,
                          "datatype_scores": stmt.excluded.datatype_scores}
                )
                db.execute(stmt)
                count += 1
            time.sleep(0.2)

    db.commit()
    db.close()
    print(f"  Stored {count} Open Targets associations")


if __name__ == "__main__":
    run_opentargets_enrichment()
