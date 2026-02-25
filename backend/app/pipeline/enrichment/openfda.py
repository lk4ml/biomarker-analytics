"""OpenFDA drug/CDx approval enrichment pipeline.

Fetches FDA drug approval data and companion diagnostic information
for biomarker-targeted oncology drugs from the OpenFDA API.

No API key required — uses the public OpenFDA REST API.
"""
import json
import subprocess
import time
import re
from datetime import date, datetime

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import SessionLocal
from app.models import FDAApproval, DataProvenance

OPENFDA_API = "https://api.fda.gov/drug/drugsfda.json"

# Biomarker-targeted drugs to look up, with known biomarker/variant associations.
# We search OpenFDA for each drug and cross-reference with known approvals.
DRUG_BIOMARKER_MAP = [
    # KRAS G12C
    {"generic_name": "sotorasib", "gene": "KRAS", "variant": "G12C",
     "indication_name": "NSCLC", "cdx_name": "therascreen KRAS RGQ PCR Kit", "cdx_pma": "P200001"},
    {"generic_name": "adagrasib", "gene": "KRAS", "variant": "G12C",
     "indication_name": "NSCLC", "cdx_name": "therascreen KRAS RGQ PCR Kit", "cdx_pma": "P200001"},
    # EGFR
    {"generic_name": "osimertinib", "gene": "EGFR", "variant": "L858R/exon19del/T790M",
     "indication_name": "NSCLC", "cdx_name": "cobas EGFR Mutation Test v2", "cdx_pma": "P120019"},
    {"generic_name": "erlotinib", "gene": "EGFR", "variant": "activating",
     "indication_name": "NSCLC", "cdx_name": "cobas EGFR Mutation Test v2", "cdx_pma": "P120019"},
    {"generic_name": "amivantamab", "gene": "EGFR", "variant": "exon 20 ins",
     "indication_name": "NSCLC", "cdx_name": "Guardant360 CDx", "cdx_pma": "P200010"},
    # BRAF
    {"generic_name": "dabrafenib", "gene": "BRAF", "variant": "V600E",
     "indication_name": "NSCLC", "cdx_name": "FoundationOne CDx", "cdx_pma": "P170019"},
    {"generic_name": "vemurafenib", "gene": "BRAF", "variant": "V600E",
     "indication_name": "Melanoma", "cdx_name": "cobas 4800 BRAF V600 Mutation Test", "cdx_pma": "P110020"},
    {"generic_name": "encorafenib", "gene": "BRAF", "variant": "V600E",
     "indication_name": "Colorectal Cancer", "cdx_name": "FoundationOne CDx", "cdx_pma": "P170019"},
    # ALK
    {"generic_name": "alectinib", "gene": "ALK", "variant": "fusion",
     "indication_name": "NSCLC", "cdx_name": "Ventana ALK (D5F3) CDx Assay", "cdx_pma": "P140025"},
    {"generic_name": "lorlatinib", "gene": "ALK", "variant": "fusion",
     "indication_name": "NSCLC", "cdx_name": "Vysis ALK Break Apart FISH Probe Kit", "cdx_pma": "P110012"},
    # ROS1
    {"generic_name": "entrectinib", "gene": "ROS1", "variant": "fusion",
     "indication_name": "NSCLC", "cdx_name": "FoundationOne CDx", "cdx_pma": "P170019"},
    # RET
    {"generic_name": "selpercatinib", "gene": "RET", "variant": "fusion",
     "indication_name": "NSCLC", "cdx_name": "FoundationOne CDx", "cdx_pma": "P170019"},
    {"generic_name": "pralsetinib", "gene": "RET", "variant": "fusion",
     "indication_name": "NSCLC", "cdx_name": "FoundationOne CDx", "cdx_pma": "P170019"},
    # MET
    {"generic_name": "capmatinib", "gene": "MET", "variant": "exon 14 skip",
     "indication_name": "NSCLC", "cdx_name": "FoundationOne CDx", "cdx_pma": "P170019"},
    {"generic_name": "tepotinib", "gene": "MET", "variant": "exon 14 skip",
     "indication_name": "NSCLC", "cdx_name": "FoundationOne CDx", "cdx_pma": "P170019"},
    # NTRK
    {"generic_name": "larotrectinib", "gene": "NTRK", "variant": "fusion",
     "indication_name": None, "cdx_name": "FoundationOne CDx", "cdx_pma": "P170019"},
    {"generic_name": "entrectinib", "gene": "NTRK", "variant": "fusion",
     "indication_name": None, "cdx_name": "FoundationOne CDx", "cdx_pma": "P170019"},
    # HER2 — Breast
    {"generic_name": "trastuzumab", "gene": "ERBB2", "variant": "amplification",
     "indication_name": "Breast Cancer", "cdx_name": "HercepTest", "cdx_pma": "P980018"},
    {"generic_name": "trastuzumab deruxtecan", "gene": "ERBB2", "variant": "amplification",
     "indication_name": "Breast Cancer", "cdx_name": "HercepTest", "cdx_pma": "P980018"},
    # PIK3CA
    {"generic_name": "alpelisib", "gene": "PIK3CA", "variant": "activating",
     "indication_name": "Breast Cancer", "cdx_name": "therascreen PIK3CA RGQ PCR Kit", "cdx_pma": "P190004"},
    # BRCA
    {"generic_name": "olaparib", "gene": "BRCA1", "variant": "pathogenic",
     "indication_name": "Breast Cancer", "cdx_name": "BRACAnalysis CDx", "cdx_pma": "P140020"},
]


def curl_get_json(url, timeout=30):
    """GET JSON via subprocess curl."""
    result = subprocess.run(
        ["curl", "-s", "--max-time", str(timeout), url],
        capture_output=True, text=True, timeout=timeout + 10
    )
    if result.returncode != 0:
        raise RuntimeError(f"curl failed: {result.stderr}")
    return json.loads(result.stdout)


def search_openfda_drug(generic_name: str) -> list[dict]:
    """Search OpenFDA for a drug by generic name."""
    import urllib.parse
    query = urllib.parse.quote(f'openfda.generic_name:"{generic_name}"')
    url = f"{OPENFDA_API}?search={query}&limit=5"
    try:
        data = curl_get_json(url, timeout=20)
        return data.get("results", [])
    except Exception as e:
        print(f"    OpenFDA error for {generic_name}: {e}")
        return []


def extract_approval_info(results: list[dict], generic_name: str) -> dict | None:
    """Extract approval date and application number from OpenFDA results."""
    for result in results:
        app_number = result.get("application_number", "")
        brand_name = ""
        openfda = result.get("openfda", {})
        brands = openfda.get("brand_name", [])
        if brands:
            brand_name = brands[0]

        # Find the original approval (not supplements)
        submissions = result.get("submissions", [])
        approval_date = None
        for sub in submissions:
            if sub.get("submission_type", "") == "ORIG" and sub.get("submission_status", "") == "AP":
                date_str = sub.get("submission_status_date", "")
                if date_str:
                    try:
                        approval_date = datetime.strptime(date_str, "%Y%m%d").date()
                    except ValueError:
                        pass
                break

        if not approval_date:
            # Try any approval
            for sub in sorted(submissions, key=lambda s: s.get("submission_status_date", "0")):
                if sub.get("submission_status", "") == "AP":
                    date_str = sub.get("submission_status_date", "")
                    if date_str:
                        try:
                            approval_date = datetime.strptime(date_str, "%Y%m%d").date()
                        except ValueError:
                            pass
                        break

        indication_text = ""
        products = result.get("products", [])
        for prod in products:
            if prod.get("active_ingredients"):
                for ai in prod["active_ingredients"]:
                    if generic_name.lower() in (ai.get("name", "") or "").lower():
                        indication_text = prod.get("marketing_status", "")
                        break

        return {
            "application_number": app_number,
            "drug_name": f"{brand_name} ({generic_name})" if brand_name else generic_name,
            "approval_date": approval_date,
            "indication_text": indication_text,
        }
    return None


def run_openfda_enrichment():
    """Fetch FDA approval data for biomarker-targeted drugs."""
    print("=" * 60)
    print("OpenFDA Drug/CDx Approval Enrichment")
    print("=" * 60)

    db = SessionLocal()
    today = date.today()
    total_inserted = 0
    seen_drugs = set()

    for entry in DRUG_BIOMARKER_MAP:
        generic_name = entry["generic_name"]

        # Skip duplicates (e.g., entrectinib appears for both ROS1 and NTRK)
        drug_key = f"{generic_name}_{entry['gene']}_{entry['variant']}"
        if drug_key in seen_drugs:
            continue
        seen_drugs.add(drug_key)

        print(f"  Searching: {generic_name} ({entry['gene']} {entry['variant']})...")

        results = search_openfda_drug(generic_name)
        approval_info = extract_approval_info(results, generic_name) if results else None

        drug_name = generic_name.title()
        app_number = ""
        approval_date = None

        if approval_info:
            drug_name = approval_info["drug_name"] or drug_name
            app_number = approval_info["application_number"]
            approval_date = approval_info["approval_date"]
            print(f"    Found: {drug_name} ({app_number}), approved {approval_date}")
        else:
            print(f"    Not found in OpenFDA — using curated data")

        source_url = f"https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo={app_number.replace('NDA','').replace('BLA','')}" if app_number else ""

        row = {
            "drug_name": drug_name,
            "generic_name": generic_name,
            "application_number": app_number or f"UNKNOWN_{generic_name}",
            "approval_date": approval_date,
            "supplement_number": "0",
            "biomarker_gene": entry["gene"],
            "biomarker_variant": entry["variant"],
            "indication_text": approval_info.get("indication_text", "") if approval_info else "",
            "indication_name": entry.get("indication_name"),
            "companion_dx_name": entry.get("cdx_name", ""),
            "companion_dx_pma": entry.get("cdx_pma", ""),
            "source_url": source_url,
        }

        stmt = pg_insert(FDAApproval).values(**row)
        stmt = stmt.on_conflict_do_nothing()
        result = db.execute(stmt)
        if result.rowcount > 0:
            total_inserted += 1
            db.flush()
            # Add provenance
            from sqlalchemy import text as sa_text
            prev = db.execute(sa_text(
                "SELECT id FROM fda_approvals "
                "WHERE application_number = :app AND biomarker_variant = :var"
            ), {"app": row["application_number"], "var": row["biomarker_variant"]}).fetchone()
            if prev:
                prov = {
                    "entity_type": "fda_approval",
                    "entity_id": prev[0],
                    "source_name": "openfda",
                    "source_id": row["application_number"],
                    "source_url": source_url,
                    "access_date": today,
                    "version_tag": "openfda_2025",
                }
                db.execute(pg_insert(DataProvenance).values(**prov))

        time.sleep(0.5)  # Rate limit

    db.commit()
    db.close()

    print(f"\n{'=' * 60}")
    print(f"OpenFDA enrichment complete!")
    print(f"  Total FDA approval records inserted: {total_inserted}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    import sys
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    run_openfda_enrichment()
