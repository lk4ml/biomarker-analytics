"""
ClinicalTrials.gov ingestion pipeline.
Pulls industry-sponsored Phase 1-3 trials from the last 15 years for target indications.
Uses subprocess curl because CT.gov blocks Python HTTP libraries (httpx/requests).
"""
import asyncio
import json
import subprocess
import time
import urllib.parse
from datetime import datetime, date

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import SessionLocal
from app.models import Trial, TrialIndication, Indication, PipelineRun

CT_GOV_BASE = "https://clinicaltrials.gov/api/v2"

# Map our indication names to CT.gov search queries
INDICATION_QUERIES = {
    "NSCLC": "non-small cell lung cancer",
    "Breast Cancer": "breast cancer",
    "Melanoma": "melanoma",
    "Colorectal Cancer": "colorectal cancer",
    "Gastric Cancer": "gastric cancer OR stomach cancer",
}

TUMOR_TYPE_KEYWORDS = {
    "NSCLC": ["nsclc", "non-small cell lung", "non small cell lung"],
    "Breast Cancer": ["breast cancer", "breast carcinoma", "tnbc", "triple negative breast"],
    "Melanoma": ["melanoma"],
    "Colorectal Cancer": ["colorectal", "colon cancer", "rectal cancer", "crc"],
    "Gastric Cancer": ["gastric", "stomach cancer", "gastroesophageal"],
}

SETTING_KEYWORDS = [
    ("Neoadjuvant", ["neoadjuvant", "neo-adjuvant", "preoperative"]),
    ("Adjuvant", ["adjuvant"]),
    ("Maintenance", ["maintenance"]),
    ("1L", ["first-line", "first line", "1l ", "frontline", "treatment-naive", "treatment naive"]),
    ("2L", ["second-line", "second line", "2l "]),
    ("3L+", ["third-line", "third line", "3l", "pre-treated", "pretreated", "heavily pretreated"]),
]


def detect_tumor_type(conditions: list[str], title: str) -> str:
    combined = " ".join(conditions).lower() + " " + title.lower()
    for tumor, keywords in TUMOR_TYPE_KEYWORDS.items():
        if any(kw in combined for kw in keywords):
            return tumor
    return "Solid Tumor"


def detect_setting(title: str, summary: str) -> str:
    combined = (title + " " + summary).lower()
    for setting, keywords in SETTING_KEYWORDS:
        if setting == "Adjuvant" and "neoadjuvant" in combined:
            continue
        if any(kw in combined for kw in keywords):
            return setting
    return "1L"


def map_phase(phases: list[str] | None) -> str:
    if not phases:
        return "Phase 1"
    phase_map = {
        "EARLY_PHASE1": "Phase 1", "PHASE1": "Phase 1",
        "PHASE2": "Phase 2", "PHASE3": "Phase 3", "PHASE4": "Phase 4",
    }
    # Pick highest phase
    for p in ["PHASE3", "PHASE2", "PHASE1", "EARLY_PHASE1"]:
        if p in phases:
            return phase_map[p]
    return "Phase 1"


def map_status(status: str) -> str:
    status_map = {
        "RECRUITING": "Recruiting",
        "ACTIVE_NOT_RECRUITING": "Active",
        "COMPLETED": "Completed",
        "TERMINATED": "Terminated",
        "WITHDRAWN": "Withdrawn",
        "SUSPENDED": "Suspended",
        "NOT_YET_RECRUITING": "Not Yet Recruiting",
        "ENROLLING_BY_INVITATION": "Enrolling by Invitation",
        "UNKNOWN": "Unknown",
    }
    return status_map.get(status, status)


def extract_year(date_str: str | None) -> int | None:
    if not date_str:
        return None
    try:
        for fmt in ["%Y-%m-%d", "%Y-%m", "%Y"]:
            try:
                return datetime.strptime(date_str, fmt).year
            except ValueError:
                continue
    except Exception:
        pass
    return None


def parse_date(date_str: str | None) -> date | None:
    if not date_str:
        return None
    try:
        for fmt in ["%Y-%m-%d", "%Y-%m", "%Y"]:
            try:
                return datetime.strptime(date_str, fmt).date()
            except ValueError:
                continue
    except Exception:
        pass
    return None


def parse_study(study: dict, indication_name: str) -> dict:
    """Parse a CT.gov API v2 study response into a trial row dict."""
    proto = study.get("protocolSection", {})
    ident = proto.get("identificationModule", {})
    status_mod = proto.get("statusModule", {})
    design = proto.get("designModule", {})
    sponsor_mod = proto.get("sponsorCollaboratorsModule", {})
    desc = proto.get("descriptionModule", {})
    elig = proto.get("eligibilityModule", {})
    arms = proto.get("armsInterventionsModule", {})
    outcomes = proto.get("outcomesModule", {})
    cond_mod = proto.get("conditionsModule", {})

    nct_id = ident.get("nctId", "")
    title = ident.get("briefTitle", "") or ident.get("officialTitle", "")
    conditions = cond_mod.get("conditions", [])
    summary = desc.get("briefSummary", "")

    # Parse interventions
    interventions = []
    for interv in arms.get("interventions", []):
        interventions.append({
            "type": interv.get("type", ""),
            "name": interv.get("name", ""),
            "description": (interv.get("description", "") or "")[:500],
        })

    # Parse outcomes
    primary_outcomes = []
    for out in outcomes.get("primaryOutcomes", []):
        primary_outcomes.append({
            "measure": out.get("measure", ""),
            "timeFrame": out.get("timeFrame", ""),
        })

    secondary_outcomes = []
    for out in outcomes.get("secondaryOutcomes", []):
        secondary_outcomes.append({
            "measure": out.get("measure", ""),
            "timeFrame": out.get("timeFrame", ""),
        })

    # Sponsor
    lead_sponsor = sponsor_mod.get("leadSponsor", {})
    collaborators = [
        {"name": c.get("name", ""), "class": c.get("class", "")}
        for c in sponsor_mod.get("collaborators", [])
    ]

    phases = design.get("phases", [])
    start_date_str = status_mod.get("startDateStruct", {}).get("date")
    completion_date_str = status_mod.get("completionDateStruct", {}).get("date")
    primary_completion_str = status_mod.get("primaryCompletionDateStruct", {}).get("date")

    enrollment_info = design.get("enrollmentInfo", {}) if design else {}

    design_info = design.get("designInfo", {}) if design else {}

    return {
        "nct_id": nct_id,
        "brief_title": title,
        "official_title": ident.get("officialTitle"),
        "overall_status": map_status(status_mod.get("overallStatus", "UNKNOWN")),
        "phase": map_phase(phases),
        "phases_raw": phases,
        "study_type": design.get("studyType"),
        "lead_sponsor_name": lead_sponsor.get("name"),
        "lead_sponsor_class": lead_sponsor.get("class"),
        "collaborators": collaborators if collaborators else None,
        "start_date": parse_date(start_date_str),
        "start_year": extract_year(start_date_str),
        "completion_date": parse_date(completion_date_str),
        "primary_completion": parse_date(primary_completion_str),
        "enrollment_count": enrollment_info.get("count"),
        "enrollment_type": enrollment_info.get("type"),
        "brief_summary": summary,
        "eligibility_criteria": elig.get("eligibilityCriteria"),
        "conditions": conditions,
        "keywords": cond_mod.get("keywords", []),
        "interventions": interventions if interventions else None,
        "primary_outcomes": primary_outcomes if primary_outcomes else None,
        "secondary_outcomes": secondary_outcomes if secondary_outcomes else None,
        "allocation": design_info.get("allocation"),
        "intervention_model": design_info.get("interventionModel"),
        "primary_purpose": design_info.get("primaryPurpose"),
        "masking": design_info.get("maskingInfo", {}).get("masking") if design_info.get("maskingInfo") else None,
        "sex": elig.get("sex"),
        "minimum_age": elig.get("minimumAge"),
        "maximum_age": elig.get("maximumAge"),
        "detected_tumor_type": detect_tumor_type(conditions, title),
        "detected_setting": detect_setting(title, summary),
        "raw_json": study,
    }


def fetch_ctgov_page(query: str, page_token: str | None = None) -> dict:
    """Fetch a page from CT.gov API using subprocess curl with --data-urlencode.

    CT.gov v2 API requires phase filtering inside filter.advanced (not filter.phase).
    We use curl's --data-urlencode -G to properly encode parameters with brackets/spaces.
    """
    advanced = "AREA[Phase](PHASE1 OR PHASE2 OR PHASE3) AND AREA[LeadSponsorClass]INDUSTRY AND AREA[StartDate]RANGE[2011-01-01,MAX]"

    cmd = [
        "curl", "-s", "--max-time", "120", "-G",
        "--data-urlencode", f"query.cond={query}",
        "--data-urlencode", f"filter.advanced={advanced}",
        "--data-urlencode", "pageSize=1000",
        "--data-urlencode", "countTotal=true",
    ]
    if page_token:
        cmd.extend(["--data-urlencode", f"pageToken={page_token}"])
    cmd.append(f"{CT_GOV_BASE}/studies")

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=150)
    if result.returncode != 0:
        raise RuntimeError(f"curl failed with code {result.returncode}: {result.stderr}")

    if not result.stdout or not result.stdout.strip():
        raise RuntimeError(f"curl returned empty response. stderr: {result.stderr[:200]}")

    return json.loads(result.stdout)


def ingest_indication(indication_name: str, query: str) -> dict:
    """Ingest all trials for one indication from ClinicalTrials.gov."""
    db = SessionLocal()
    total_ingested = 0
    total_created = 0

    try:
        # Get indication ID
        ind = db.execute(
            text("SELECT id FROM indications WHERE name = :name"),
            {"name": indication_name}
        ).fetchone()
        if not ind:
            print(f"  Indication {indication_name} not found in DB, skipping")
            return {"ingested": 0, "created": 0}
        indication_id = ind[0]

        page_token = None
        page_num = 0

        while True:
            page_num += 1
            print(f"  Fetching page {page_num} for {indication_name}...")

            data = fetch_ctgov_page(query, page_token)

            total_count = data.get("totalCount", 0)
            if page_num == 1:
                print(f"  Total trials on CT.gov for {indication_name}: {total_count}")

            studies = data.get("studies", [])
            if not studies:
                break

            for study in studies:
                try:
                    row = parse_study(study, indication_name)
                    if not row["nct_id"]:
                        continue

                    # Upsert trial
                    stmt = pg_insert(Trial).values(**row)
                    stmt = stmt.on_conflict_do_update(
                        index_elements=["nct_id"],
                        set_={
                            "brief_title": stmt.excluded.brief_title,
                            "overall_status": stmt.excluded.overall_status,
                            "phase": stmt.excluded.phase,
                            "raw_json": stmt.excluded.raw_json,
                            "enrollment_count": stmt.excluded.enrollment_count,
                            "completion_date": stmt.excluded.completion_date,
                            "eligibility_criteria": stmt.excluded.eligibility_criteria,
                            "primary_outcomes": stmt.excluded.primary_outcomes,
                            "secondary_outcomes": stmt.excluded.secondary_outcomes,
                        }
                    )
                    result = db.execute(stmt)

                    # Get trial ID
                    trial = db.execute(
                        text("SELECT id FROM trials WHERE nct_id = :nct_id"),
                        {"nct_id": row["nct_id"]}
                    ).fetchone()

                    if trial:
                        # Link to indication
                        ind_stmt = pg_insert(TrialIndication).values(
                            trial_id=trial[0], indication_id=indication_id
                        ).on_conflict_do_nothing()
                        db.execute(ind_stmt)

                    total_ingested += 1
                    if result.rowcount > 0:
                        total_created += 1
                except Exception as e:
                    print(f"    Error processing study: {e}")
                    continue

            db.commit()
            print(f"  Page {page_num}: processed {len(studies)} studies (total: {total_ingested})")

            page_token = data.get("nextPageToken")
            if not page_token:
                break

            # Rate limiting
            time.sleep(0.5)

    except Exception as e:
        print(f"  ERROR ingesting {indication_name}: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

    return {"ingested": total_ingested, "created": total_created}


def run_ingestion():
    """Run the full ingestion pipeline for all indications."""
    print("=" * 60)
    print("ClinicalTrials.gov Ingestion Pipeline")
    print("=" * 60)

    db = SessionLocal()
    run = PipelineRun(pipeline_name="ct_gov_ingestion", status="running")
    db.add(run)
    db.commit()
    run_id = run.id
    db.close()

    total_all = 0
    start_time = time.time()

    for indication, query in INDICATION_QUERIES.items():
        print(f"\n--- Ingesting: {indication} ---")
        result = ingest_indication(indication, query)
        total_all += result["ingested"]
        print(f"  Done: {result['ingested']} trials ingested")

    elapsed = time.time() - start_time

    # Update pipeline run
    db = SessionLocal()
    db.execute(
        text("""
            UPDATE pipeline_runs SET status = 'completed',
            completed_at = NOW(), records_processed = :count
            WHERE id = :id
        """),
        {"count": total_all, "id": run_id}
    )
    db.commit()
    db.close()

    print(f"\n{'=' * 60}")
    print(f"Ingestion complete: {total_all} total trials in {elapsed:.1f}s")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    run_ingestion()
