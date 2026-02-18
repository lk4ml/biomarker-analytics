"""CIViC (Clinical Interpretation of Variants in Cancer) enrichment pipeline."""
import json
import subprocess
import time
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.database import SessionLocal
from app.models.external import CivicEvidence

CIVIC_API = "https://civicdb.org/api/graphql"

GENES_TO_QUERY = ["EGFR", "BRAF", "KRAS", "ERBB2", "ALK", "BRCA1", "BRCA2", "PIK3CA", "NTRK1", "NTRK2", "NTRK3"]

QUERY = """
query GeneVariants($geneName: String!) {
  genes(name: $geneName) {
    nodes {
      name
      variants {
        nodes {
          id
          name
          evidenceItems {
            nodes {
              id
              evidenceType
              evidenceLevel
              evidenceDirection
              significance
              disease { name }
              therapies { name }
              source { citationId }
            }
          }
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


def run_civic_enrichment():
    print("--- CIViC Enrichment ---")
    db = SessionLocal()
    count = 0

    for gene in GENES_TO_QUERY:
        try:
            data = curl_post_json(CIVIC_API, {
                "query": QUERY,
                "variables": {"geneName": gene}
            })

            gene_nodes = data.get("data", {}).get("genes", {}).get("nodes", [])
            for gnode in gene_nodes:
                variants = gnode.get("variants", {}).get("nodes", [])
                for variant in variants[:20]:  # Limit per gene
                    evidence_items = variant.get("evidenceItems", {}).get("nodes", [])
                    for ev in evidence_items[:5]:  # Limit per variant
                        row = {
                            "civic_id": ev["id"],
                            "gene_name": gnode["name"],
                            "variant_name": variant["name"],
                            "disease_name": ev.get("disease", {}).get("name", ""),
                            "evidence_type": ev.get("evidenceType", ""),
                            "evidence_level": ev.get("evidenceLevel", ""),
                            "evidence_direction": ev.get("evidenceDirection", ""),
                            "significance": ev.get("significance", ""),
                            "drugs": [t["name"] for t in ev.get("therapies", [])],
                            "source_pmid": str(ev.get("source", {}).get("citationId", "")),
                        }
                        stmt = pg_insert(CivicEvidence).values(**row)
                        stmt = stmt.on_conflict_do_nothing(index_elements=["civic_id"])
                        db.execute(stmt)
                        count += 1

            db.commit()
            print(f"  {gene}: stored evidence items")
            time.sleep(0.5)

        except Exception as e:
            print(f"  CIViC error for {gene}: {e}")

    db.close()
    print(f"  Stored {count} CIViC evidence items")


if __name__ == "__main__":
    run_civic_enrichment()
