"""OncoKB actionability enrichment pipeline.

Fetches variant-level therapeutic actionability from OncoKB.
Requires a free academic API token (register at oncokb.org).
Falls back to curated seed data when no token is available.
"""
import json
import subprocess
import time
from datetime import date

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import SessionLocal
from app.config import get_settings
from app.models import OncoKBActionability, DataProvenance

ONCOKB_API = "https://www.oncokb.org/api/v1"

# Curated actionability data from publicly documented OncoKB levels.
# This covers the most clinically important variants across our 5 indications.
# Source: OncoKB public website (oncokb.org), FDA labels, NCCN guidelines.
SEED_DATA = [
    # KRAS — NSCLC
    {"gene": "KRAS", "variant_name": "G12C", "cancer_type": "Non-Small Cell Lung Cancer",
     "indication_name": "NSCLC", "level": "LEVEL_1",
     "drugs": ["Sotorasib", "Adagrasib"],
     "description": "FDA-approved: Sotorasib (2021) and Adagrasib (2022) for KRAS G12C-mutated NSCLC after prior systemic therapy.",
     "citations": [{"pmid": "34726479", "title": "Sotorasib for KRAS G12C NSCLC (CodeBreaK 100)"},
                   {"pmid": "36546659", "title": "Adagrasib in KRAS G12C NSCLC (KRYSTAL-1)"}]},
    {"gene": "KRAS", "variant_name": "G12D", "cancer_type": "Non-Small Cell Lung Cancer",
     "indication_name": "NSCLC", "level": "LEVEL_3B",
     "drugs": ["MRTX1133"],
     "description": "Emerging evidence for KRAS G12D inhibitors in clinical development.",
     "citations": []},
    # KRAS — Colorectal
    {"gene": "KRAS", "variant_name": "G12C", "cancer_type": "Colorectal Cancer",
     "indication_name": "Colorectal Cancer", "level": "LEVEL_2",
     "drugs": ["Sotorasib + Panitumumab"],
     "description": "Sotorasib + panitumumab for KRAS G12C-mutated CRC (CodeBreaK 300).",
     "citations": [{"pmid": "37870976", "title": "Sotorasib + panitumumab in KRAS G12C CRC"}]},
    # EGFR — NSCLC
    {"gene": "EGFR", "variant_name": "L858R", "cancer_type": "Non-Small Cell Lung Cancer",
     "indication_name": "NSCLC", "level": "LEVEL_1",
     "drugs": ["Osimertinib", "Erlotinib", "Gefitinib", "Afatinib"],
     "description": "FDA-approved EGFR TKIs for EGFR L858R-mutated NSCLC.",
     "citations": [{"pmid": "29151359", "title": "Osimertinib in untreated EGFR-mutated NSCLC (FLAURA)"}]},
    {"gene": "EGFR", "variant_name": "exon 19 del", "cancer_type": "Non-Small Cell Lung Cancer",
     "indication_name": "NSCLC", "level": "LEVEL_1",
     "drugs": ["Osimertinib", "Erlotinib", "Gefitinib", "Afatinib"],
     "description": "FDA-approved EGFR TKIs for EGFR exon 19 deletion NSCLC.",
     "citations": []},
    {"gene": "EGFR", "variant_name": "T790M", "cancer_type": "Non-Small Cell Lung Cancer",
     "indication_name": "NSCLC", "level": "LEVEL_1",
     "drugs": ["Osimertinib"],
     "description": "FDA-approved: Osimertinib for T790M resistance mutation.",
     "citations": [{"pmid": "25923549", "title": "Osimertinib in EGFR T790M NSCLC (AURA3)"}]},
    {"gene": "EGFR", "variant_name": "exon 20 ins", "cancer_type": "Non-Small Cell Lung Cancer",
     "indication_name": "NSCLC", "level": "LEVEL_1",
     "drugs": ["Amivantamab", "Mobocertinib"],
     "description": "FDA-approved therapies for EGFR exon 20 insertion mutations.",
     "citations": []},
    # BRAF — NSCLC
    {"gene": "BRAF", "variant_name": "V600E", "cancer_type": "Non-Small Cell Lung Cancer",
     "indication_name": "NSCLC", "level": "LEVEL_1",
     "drugs": ["Dabrafenib + Trametinib"],
     "description": "FDA-approved: Dabrafenib + trametinib for BRAF V600E NSCLC.",
     "citations": [{"pmid": "27283860", "title": "Dabrafenib + trametinib in BRAF V600E NSCLC"}]},
    # BRAF — Melanoma
    {"gene": "BRAF", "variant_name": "V600E", "cancer_type": "Melanoma",
     "indication_name": "Melanoma", "level": "LEVEL_1",
     "drugs": ["Dabrafenib + Trametinib", "Vemurafenib + Cobimetinib", "Encorafenib + Binimetinib"],
     "description": "FDA-approved BRAF/MEK inhibitor combinations for BRAF V600E melanoma.",
     "citations": []},
    {"gene": "BRAF", "variant_name": "V600K", "cancer_type": "Melanoma",
     "indication_name": "Melanoma", "level": "LEVEL_1",
     "drugs": ["Dabrafenib + Trametinib"],
     "description": "FDA-approved for BRAF V600K melanoma.",
     "citations": []},
    # BRAF — Colorectal
    {"gene": "BRAF", "variant_name": "V600E", "cancer_type": "Colorectal Cancer",
     "indication_name": "Colorectal Cancer", "level": "LEVEL_1",
     "drugs": ["Encorafenib + Cetuximab"],
     "description": "FDA-approved: Encorafenib + cetuximab for BRAF V600E metastatic CRC (BEACON).",
     "citations": [{"pmid": "31566309", "title": "Encorafenib + cetuximab in BRAF V600E CRC (BEACON)"}]},
    # HER2 — Breast Cancer
    {"gene": "ERBB2", "variant_name": "amplification", "cancer_type": "Breast Cancer",
     "indication_name": "Breast Cancer", "level": "LEVEL_1",
     "drugs": ["Trastuzumab", "Pertuzumab", "T-DM1", "T-DXd"],
     "description": "FDA-approved HER2-targeted therapies for HER2+ breast cancer.",
     "citations": []},
    # HER2 — NSCLC
    {"gene": "ERBB2", "variant_name": "exon 20 ins", "cancer_type": "Non-Small Cell Lung Cancer",
     "indication_name": "NSCLC", "level": "LEVEL_1",
     "drugs": ["Trastuzumab deruxtecan"],
     "description": "FDA-approved: T-DXd for HER2-mutant NSCLC (DESTINY-Lung02).",
     "citations": []},
    # PIK3CA — Breast Cancer
    {"gene": "PIK3CA", "variant_name": "H1047R", "cancer_type": "Breast Cancer",
     "indication_name": "Breast Cancer", "level": "LEVEL_1",
     "drugs": ["Alpelisib + Fulvestrant"],
     "description": "FDA-approved: Alpelisib for PIK3CA-mutated HR+/HER2- breast cancer.",
     "citations": []},
    {"gene": "PIK3CA", "variant_name": "E545K", "cancer_type": "Breast Cancer",
     "indication_name": "Breast Cancer", "level": "LEVEL_1",
     "drugs": ["Alpelisib + Fulvestrant"],
     "description": "FDA-approved: Alpelisib for PIK3CA-mutated HR+/HER2- breast cancer.",
     "citations": []},
    # ALK — NSCLC
    {"gene": "ALK", "variant_name": "fusion", "cancer_type": "Non-Small Cell Lung Cancer",
     "indication_name": "NSCLC", "level": "LEVEL_1",
     "drugs": ["Alectinib", "Lorlatinib", "Crizotinib", "Ceritinib", "Brigatinib"],
     "description": "FDA-approved ALK inhibitors for ALK fusion-positive NSCLC.",
     "citations": []},
    # ROS1 — NSCLC
    {"gene": "ROS1", "variant_name": "fusion", "cancer_type": "Non-Small Cell Lung Cancer",
     "indication_name": "NSCLC", "level": "LEVEL_1",
     "drugs": ["Crizotinib", "Entrectinib"],
     "description": "FDA-approved: Crizotinib and entrectinib for ROS1 fusion-positive NSCLC.",
     "citations": []},
    # RET — NSCLC
    {"gene": "RET", "variant_name": "fusion", "cancer_type": "Non-Small Cell Lung Cancer",
     "indication_name": "NSCLC", "level": "LEVEL_1",
     "drugs": ["Selpercatinib", "Pralsetinib"],
     "description": "FDA-approved RET inhibitors for RET fusion-positive NSCLC.",
     "citations": []},
    # MET — NSCLC
    {"gene": "MET", "variant_name": "exon 14 skip", "cancer_type": "Non-Small Cell Lung Cancer",
     "indication_name": "NSCLC", "level": "LEVEL_1",
     "drugs": ["Capmatinib", "Tepotinib"],
     "description": "FDA-approved MET inhibitors for MET exon 14 skipping mutations.",
     "citations": []},
    # NTRK — Pan-cancer
    {"gene": "NTRK1", "variant_name": "fusion", "cancer_type": "All Solid Tumors",
     "indication_name": None, "level": "LEVEL_1",
     "drugs": ["Larotrectinib", "Entrectinib"],
     "description": "FDA-approved tumor-agnostic NTRK inhibitors.",
     "citations": []},
]


def curl_get_json_auth(url, token, timeout=30):
    """GET JSON with Bearer token via subprocess curl."""
    result = subprocess.run(
        ["curl", "-s", "--max-time", str(timeout),
         "-H", f"Authorization: Bearer {token}",
         url],
        capture_output=True, text=True, timeout=timeout + 10
    )
    if result.returncode != 0:
        raise RuntimeError(f"curl failed: {result.stderr}")
    return json.loads(result.stdout)


def run_oncokb_enrichment():
    """Fetch variant actionability from OncoKB API or seed data."""
    print("=" * 60)
    print("OncoKB Actionability Enrichment")
    print("=" * 60)

    settings = get_settings()
    db = SessionLocal()
    today = date.today()
    total_inserted = 0

    if settings.oncokb_api_token:
        print("OncoKB API token found — fetching live data...")
        try:
            data = curl_get_json_auth(
                f"{ONCOKB_API}/utils/allActionableVariants",
                settings.oncokb_api_token,
                timeout=60,
            )
            if isinstance(data, list):
                print(f"  Fetched {len(data)} actionable variants from OncoKB")
                for entry in data:
                    gene_info = entry.get("gene", {})
                    variant_info = entry.get("variant", {})
                    gene = gene_info.get("hugoSymbol", "")
                    variant = variant_info.get("name", "")
                    level = entry.get("level", "")

                    if not gene or not variant or not level:
                        continue

                    for ct in entry.get("cancerTypes", []):
                        cancer_type = ct.get("mainType", "")
                        if not cancer_type:
                            continue

                        # Map cancer type to our indication
                        indication = _map_cancer_type(cancer_type)

                        drugs_list = []
                        for treatment in entry.get("treatments", []):
                            for drug in treatment.get("drugs", []):
                                name = drug.get("drugName", "")
                                if name and name not in drugs_list:
                                    drugs_list.append(name)

                        row = {
                            "gene": gene,
                            "variant_name": variant,
                            "cancer_type": cancer_type,
                            "indication_name": indication,
                            "level": level,
                            "drugs": drugs_list,
                            "description": entry.get("description", ""),
                            "citations": entry.get("articles", []),
                            "source_url": f"https://www.oncokb.org/gene/{gene}/{variant}",
                        }

                        stmt = pg_insert(OncoKBActionability).values(**row)
                        stmt = stmt.on_conflict_do_nothing()
                        result = db.execute(stmt)
                        if result.rowcount > 0:
                            total_inserted += 1
                            db.flush()
                            _add_provenance(db, "oncokb_api", row, today)

                db.commit()
            else:
                print(f"  Unexpected response: {json.dumps(data)[:200]}")
                print("  Falling back to seed data...")
                total_inserted = _insert_seed_data(db, today)
        except Exception as e:
            print(f"  OncoKB API error: {e}")
            print("  Falling back to seed data...")
            total_inserted = _insert_seed_data(db, today)
    else:
        print("No ONCOKB_API_TOKEN set — using curated seed data.")
        print("Register at oncokb.org for free academic access to live data.")
        total_inserted = _insert_seed_data(db, today)

    db.close()
    print(f"\n{'=' * 60}")
    print(f"OncoKB enrichment complete!")
    print(f"  Total actionability records inserted: {total_inserted}")
    print(f"{'=' * 60}")


def _insert_seed_data(db, today):
    """Insert curated seed data into oncokb_actionability."""
    inserted = 0
    for entry in SEED_DATA:
        row = {
            "gene": entry["gene"],
            "variant_name": entry["variant_name"],
            "cancer_type": entry["cancer_type"],
            "indication_name": entry.get("indication_name"),
            "level": entry["level"],
            "drugs": entry.get("drugs", []),
            "description": entry.get("description", ""),
            "citations": entry.get("citations"),
            "source_url": f"https://www.oncokb.org/gene/{entry['gene']}/{entry['variant_name']}",
        }
        stmt = pg_insert(OncoKBActionability).values(**row)
        stmt = stmt.on_conflict_do_nothing()
        result = db.execute(stmt)
        if result.rowcount > 0:
            inserted += 1
            db.flush()
            _add_provenance(db, "oncokb_curated", row, today)

    db.commit()
    print(f"  Inserted {inserted} curated actionability records")
    return inserted


def _add_provenance(db, source_name, row, today):
    """Add a data_provenance record for an oncokb_actionability entry."""
    from sqlalchemy import text
    prev = db.execute(text(
        "SELECT id FROM oncokb_actionability "
        "WHERE gene = :gene AND variant_name = :variant AND cancer_type = :ct"
    ), {"gene": row["gene"], "variant": row["variant_name"], "ct": row["cancer_type"]}).fetchone()
    if prev:
        prov = {
            "entity_type": "actionability",
            "entity_id": prev[0],
            "source_name": source_name,
            "source_id": f"{row['gene']}_{row['variant_name']}",
            "source_url": row.get("source_url", ""),
            "access_date": today,
            "version_tag": "seed_v1" if "curated" in source_name else "api_live",
        }
        db.execute(pg_insert(DataProvenance).values(**prov))


def _map_cancer_type(cancer_type: str) -> str | None:
    """Map OncoKB cancer type to our indication name."""
    mapping = {
        "Non-Small Cell Lung Cancer": "NSCLC",
        "Lung Adenocarcinoma": "NSCLC",
        "Lung Squamous Cell Carcinoma": "NSCLC",
        "Breast Cancer": "Breast Cancer",
        "Breast Invasive Carcinoma": "Breast Cancer",
        "Colorectal Cancer": "Colorectal Cancer",
        "Colon Adenocarcinoma": "Colorectal Cancer",
        "Melanoma": "Melanoma",
        "Skin Cutaneous Melanoma": "Melanoma",
        "Gastric Cancer": "Gastric Cancer",
        "Stomach Adenocarcinoma": "Gastric Cancer",
    }
    return mapping.get(cancer_type)


if __name__ == "__main__":
    import sys
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    run_oncokb_enrichment()
