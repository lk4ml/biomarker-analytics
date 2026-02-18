"""
LLM-based biomarker extraction pipeline.
Uses Claude API to extract biomarker data from trial eligibility criteria.
Falls back to regex-based extraction when LLM is unavailable.
"""
import json
import re
import time
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import SessionLocal
from app.config import get_settings
from app.models import TrialBiomarker, PipelineRun

# Biomarker keywords for pre-filtering (cheap, no LLM cost)
BIOMARKER_KEYWORDS = [
    "pd-l1", "pdl1", "cd274", "pembrolizumab", "nivolumab", "atezolizumab", "durvalumab",
    "her2", "erbb2", "trastuzumab", "t-dxd", "her2-low",
    "egfr", "osimertinib", "erlotinib", "gefitinib", "amivantamab",
    "kras", "sotorasib", "adagrasib", "g12c",
    "braf", "v600e", "v600k", "vemurafenib", "dabrafenib", "encorafenib",
    "alk fusion", "alk rearrangement", "alectinib", "lorlatinib", "crizotinib",
    "brca", "olaparib", "rucaparib", "niraparib", "parp", "hrd",
    "msi-h", "msi", "dmmr", "microsatellite", "mismatch repair",
    "tmb", "tumor mutational burden", "mutational load",
    "ntrk", "larotrectinib", "entrectinib",
    "ctdna", "cell-free dna", "liquid biopsy", "mrd", "minimal residual",
    "tumor infiltrating lymphocytes", "tils",
    "pik3ca", "pi3k", "alpelisib",
    "ki-67", "ki67",
    "estrogen receptor", "er-positive", "er+",
    "progesterone receptor", "pr-positive", "pr+",
]

EXTRACTION_PROMPT = """You are an expert oncology clinical trial analyst. Extract ALL biomarker information from this clinical trial.

Trial: {nct_id} - {title}

Eligibility Criteria:
{eligibility_criteria}

Brief Summary: {summary}

Interventions: {interventions}

Extract a JSON array of biomarker usages. For EACH biomarker mentioned, extract:
{{
  "biomarker_name": "<one of: PD-L1, HER2, EGFR, KRAS, BRAF, ALK, BRCA1/2, MSI, TMB, NTRK, ctDNA, TILs, ER, PR, PIK3CA, Ki-67>",
  "cutoff_value": "<specific cutoff e.g. '50', 'G12C', '3+', 'positive', 'MSI-H'>",
  "cutoff_unit": "<unit e.g. '% TPS', 'CPS', 'mut/Mb', 'IHC score', 'mutation', 'fusion', 'status'>",
  "cutoff_operator": "<one of: >=, >, <=, <, =, positive, negative, high, low>",
  "assay_name": "<specific assay if mentioned e.g. '22C3 pharmDx', 'FoundationOne CDx', or empty string>",
  "assay_platform": "<one of: IHC, NGS, PCR, FISH, ctDNA NGS, H&E, or empty string>",
  "companion_diagnostic": <true or false>,
  "biomarker_role": "<one of: predictive, prognostic, diagnostic, monitoring>",
  "biomarker_context": "<one of: inclusion_criterion, exclusion_criterion, stratification_factor, endpoint, exploratory>",
  "therapeutic_setting": "<one of: 1L, 2L, 3L+, Neoadjuvant, Adjuvant, Maintenance, Combination, Monotherapy>",
  "raw_snippet": "<the exact text snippet where this biomarker info was found, max 200 chars>"
}}

Rules:
- Biomarker in INCLUSION criteria used to SELECT patients -> role is "predictive"
- Biomarker in EXCLUSION criteria -> role is "predictive" (negative selection)
- Biomarker in ENDPOINTS only -> role is "prognostic" or "monitoring"
- Biomarker for STRATIFICATION -> role is "prognostic"
- Extract the MOST SPECIFIC cutoff (e.g. "TPS >= 50%" not just "PD-L1 positive")
- If multiple cutoffs exist for same biomarker (e.g. TPS >= 1% and TPS >= 50% subgroups), create separate entries
- Return empty array [] if NO oncology biomarkers are mentioned
- Only extract biomarkers from the list above, not arbitrary lab values

Return ONLY valid JSON array, no other text."""


# ========== Regex-based fallback extraction ==========

BIOMARKER_DETECT = [
    ("PD-L1", ["pd-l1", "pdl1", "cd274", "pembrolizumab", "nivolumab", "atezolizumab", "durvalumab"]),
    ("HER2", ["her2", "erbb2", "trastuzumab", "her2-low", "her2-ultralow", "t-dxd"]),
    ("EGFR", ["egfr", "osimertinib", "erlotinib", "gefitinib", "exon 19", "l858r", "exon20"]),
    ("KRAS", ["kras", "sotorasib", "adagrasib", "g12c", "g12d"]),
    ("BRAF", ["braf", "v600e", "v600k", "vemurafenib", "dabrafenib", "encorafenib"]),
    ("ALK", ["alk fusion", "alk rearrangement", "alectinib", "lorlatinib", "crizotinib", "eml4-alk"]),
    ("BRCA1/2", ["brca", "brca1", "brca2", "olaparib", "rucaparib", "niraparib", "parp"]),
    ("MSI", ["msi-h", "msi", "dmmr", "mmr", "microsatellite", "mismatch repair"]),
    ("TMB", ["tmb", "tumor mutational burden", "mutational load"]),
    ("NTRK", ["ntrk", "trk fusion", "larotrectinib", "entrectinib"]),
    ("ctDNA", ["ctdna", "cell-free dna", "cfdna", "liquid biopsy", "mrd", "minimal residual"]),
    ("TILs", ["tumor infiltrating lymphocytes", "tils", "til therapy"]),
    ("PIK3CA", ["pik3ca", "pi3k", "alpelisib"]),
    ("Ki-67", ["ki-67", "ki67", "mib-1", "proliferation index"]),
    ("ER", ["estrogen receptor", "er-positive", "er+", "esr1"]),
    ("PR", ["progesterone receptor", "pr-positive", "pr+", "pgr"]),
]

CUTOFF_DEFAULTS = {
    "PD-L1": {"value": "assessed", "unit": "PD-L1", "operator": ">="},
    "TMB": {"value": "10", "unit": "mut/Mb", "operator": ">="},
    "HER2": {"value": "positive", "unit": "IHC", "operator": "positive"},
    "MSI": {"value": "MSI-H/dMMR", "unit": "status", "operator": "positive"},
    "KRAS": {"value": "mutated", "unit": "mutation", "operator": "positive"},
    "BRAF": {"value": "V600", "unit": "mutation", "operator": "positive"},
    "EGFR": {"value": "mutated", "unit": "mutation", "operator": "positive"},
    "ALK": {"value": "rearrangement", "unit": "fusion", "operator": "positive"},
    "BRCA1/2": {"value": "pathogenic", "unit": "mutation", "operator": "positive"},
    "NTRK": {"value": "fusion", "unit": "fusion", "operator": "positive"},
    "ctDNA": {"value": "detectable", "unit": "detection", "operator": "positive"},
    "TILs": {"value": "present", "unit": "presence", "operator": "positive"},
    "ER": {"value": "positive", "unit": "IHC", "operator": "positive"},
    "PR": {"value": "positive", "unit": "IHC", "operator": "positive"},
    "PIK3CA": {"value": "mutated", "unit": "mutation", "operator": "positive"},
    "Ki-67": {"value": "assessed", "unit": "%", "operator": ">="},
}

ASSAY_DETECT = [
    ("22C3 pharmDx", ["22c3"]),
    ("28-8 pharmDx", ["28-8"]),
    ("SP142", ["sp142"]),
    ("SP263", ["sp263"]),
    ("FoundationOne Liquid CDx", ["foundationone liquid", "foundation one liquid"]),
    ("FoundationOne CDx", ["foundationone", "foundation one"]),
    ("Signatera", ["signatera"]),
    ("Guardant360 CDx", ["guardant360", "guardant"]),
    ("HercepTest", ["herceptest"]),
    ("cobas EGFR Mutation Test v2", ["cobas egfr", "cobas"]),
    ("therascreen KRAS RGQ PCR", ["therascreen"]),
    ("BRACAnalysis CDx", ["bracanalysis"]),
    ("Ventana ALK (D5F3)", ["ventana alk", "d5f3"]),
    ("TSO500", ["tso500", "tso 500"]),
]

ASSAY_DEFAULTS = {
    "PD-L1": "PD-L1 IHC", "TMB": "NGS Panel", "MSI": "MSI PCR/IHC",
    "HER2": "HER2 IHC/FISH", "EGFR": "EGFR PCR/NGS", "ALK": "ALK IHC/FISH",
    "BRCA1/2": "BRCA Sequencing", "KRAS": "KRAS PCR/NGS", "BRAF": "BRAF PCR/NGS",
    "NTRK": "NGS/FISH", "ctDNA": "ctDNA NGS", "TILs": "H&E / IHC",
    "ER": "ER IHC", "PR": "PR IHC", "PIK3CA": "PIK3CA PCR/NGS", "Ki-67": "Ki-67 IHC",
}


def regex_fallback_extract(trial: dict) -> list[dict]:
    """Fallback regex-based extraction when LLM is unavailable."""
    title = trial.get("brief_title", "") or ""
    summary = trial.get("brief_summary", "") or ""
    eligibility = trial.get("eligibility_criteria", "") or ""
    interventions_raw = trial.get("interventions") or []
    interv_text = " ".join(
        f"{i.get('name', '')} {i.get('description', '')}" for i in interventions_raw
    )
    full_text = f"{title} {summary} {eligibility} {interv_text}".lower()

    results = []
    for biomarker_name, keywords in BIOMARKER_DETECT:
        if any(kw in full_text for kw in keywords):
            defaults = CUTOFF_DEFAULTS.get(biomarker_name, {"value": "assessed", "unit": "various", "operator": ">="})

            # Detect assay
            assay_name = ASSAY_DEFAULTS.get(biomarker_name, "Various")
            for aname, akeywords in ASSAY_DETECT:
                if any(ak in full_text for ak in akeywords):
                    assay_name = aname
                    break

            # Detect setting
            setting = trial.get("detected_setting", "1L")

            results.append({
                "biomarker_name": biomarker_name,
                "cutoff_value": defaults["value"],
                "cutoff_unit": defaults["unit"],
                "cutoff_operator": defaults["operator"],
                "assay_name": assay_name,
                "assay_platform": "",
                "companion_diagnostic": False,
                "biomarker_role": "predictive",
                "biomarker_context": "inclusion_criterion",
                "therapeutic_setting": setting,
                "raw_snippet": "",
            })

    return results


# ========== LLM extraction ==========

def llm_extract_single(trial: dict) -> list[dict]:
    """Extract biomarker info from a single trial using Claude."""
    settings = get_settings()

    nct_id = trial["nct_id"]
    title = trial.get("brief_title", "") or ""
    eligibility = trial.get("eligibility_criteria", "") or ""
    summary = trial.get("brief_summary", "") or ""
    interventions_raw = trial.get("interventions") or []
    interv_text = ", ".join(i.get("name", "") for i in interventions_raw)

    # Truncate very long text
    eligibility = eligibility[:4000]
    summary = summary[:1000]

    prompt = EXTRACTION_PROMPT.format(
        nct_id=nct_id,
        title=title,
        eligibility_criteria=eligibility or "Not provided",
        summary=summary or "Not provided",
        interventions=interv_text or "Not provided",
    )

    try:
        from anthropic import Anthropic
        anthropic = Anthropic(api_key=settings.anthropic_api_key)

        response = anthropic.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )

        content = response.content[0].text.strip()

        # Try to parse JSON from the response
        # Handle cases where LLM wraps in markdown code blocks
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\n?", "", content)
            content = re.sub(r"\n?```$", "", content)

        extracted = json.loads(content)
        if not isinstance(extracted, list):
            extracted = [extracted] if isinstance(extracted, dict) else []

        return extracted

    except json.JSONDecodeError:
        print(f"    JSON parse error for {nct_id}, using regex fallback")
        return regex_fallback_extract(trial)
    except Exception as e:
        print(f"    LLM error for {nct_id}: {e}, using regex fallback")
        return regex_fallback_extract(trial)


def has_biomarker_keywords(text: str) -> bool:
    """Quick pre-filter: does this trial text mention any biomarker keywords?"""
    text_lower = text.lower()
    return any(kw in text_lower for kw in BIOMARKER_KEYWORDS)


def run_extraction(use_llm: bool = True, batch_size: int = 20, limit: int | None = None):
    """Run the biomarker extraction pipeline on all unprocessed trials."""
    print("=" * 60)
    print("Biomarker Extraction Pipeline")
    print(f"Mode: {'LLM (Claude)' if use_llm else 'Regex fallback'}")
    print("=" * 60)

    settings = get_settings()
    if use_llm and not settings.anthropic_api_key:
        print("WARNING: No ANTHROPIC_API_KEY set. Falling back to regex extraction.")
        use_llm = False

    db = SessionLocal()

    # Log pipeline run
    run = PipelineRun(pipeline_name="llm_extraction", status="running")
    db.add(run)
    db.commit()
    run_id = run.id

    try:
        # Get unprocessed trials that have biomarker keywords
        query = """
            SELECT id, nct_id, brief_title, brief_summary, eligibility_criteria,
                   interventions, detected_tumor_type, detected_setting
            FROM trials
            WHERE nlp_processed_at IS NULL
        """
        if limit:
            query += f" LIMIT {limit}"

        trials = db.execute(text(query)).fetchall()
        print(f"Total unprocessed trials: {len(trials)}")

        # Pre-filter
        candidates = []
        for t in trials:
            combined = " ".join(filter(None, [t[2], t[3], t[4]]))  # title, summary, eligibility
            if has_biomarker_keywords(combined):
                candidates.append({
                    "id": t[0], "nct_id": t[1], "brief_title": t[2],
                    "brief_summary": t[3], "eligibility_criteria": t[4],
                    "interventions": t[5], "detected_tumor_type": t[6],
                    "detected_setting": t[7],
                })

        print(f"Candidates after keyword pre-filter: {len(candidates)}")

        total_extracted = 0
        total_biomarkers = 0
        errors = 0

        # Get biomarker name->id mapping
        bm_rows = db.execute(text("SELECT id, name FROM biomarkers")).fetchall()
        bm_map = {row[1]: row[0] for row in bm_rows}

        if use_llm:
            from anthropic import Anthropic
            anthropic_client = Anthropic(api_key=settings.anthropic_api_key)

        for i in range(0, len(candidates), batch_size):
            batch = candidates[i:i + batch_size]
            print(f"\nProcessing batch {i // batch_size + 1} ({len(batch)} trials)...")

            for trial in batch:
                try:
                    if use_llm:
                        extractions = llm_extract_single(trial)
                    else:
                        extractions = regex_fallback_extract(trial)

                    for ext in extractions:
                        bm_name = ext.get("biomarker_name", "")
                        bm_id = bm_map.get(bm_name)
                        if not bm_id:
                            continue

                        row = {
                            "trial_id": trial["id"],
                            "biomarker_id": bm_id,
                            "biomarker_name": bm_name,
                            "cutoff_value": ext.get("cutoff_value", ""),
                            "cutoff_unit": ext.get("cutoff_unit", ""),
                            "cutoff_operator": ext.get("cutoff_operator", ""),
                            "assay_name": ext.get("assay_name", ""),
                            "assay_manufacturer": "",
                            "assay_platform": ext.get("assay_platform", ""),
                            "companion_diagnostic": ext.get("companion_diagnostic", False),
                            "biomarker_role": ext.get("biomarker_role", "predictive"),
                            "biomarker_context": ext.get("biomarker_context", ""),
                            "tumor_type": trial.get("detected_tumor_type", ""),
                            "therapeutic_setting": ext.get("therapeutic_setting", trial.get("detected_setting", "1L")),
                            "extraction_source": "eligibility",
                            "extraction_confidence": 0.9 if use_llm else 0.6,
                            "extraction_method": "llm_claude" if use_llm else "regex",
                            "raw_snippet": (ext.get("raw_snippet", "") or "")[:500],
                        }

                        stmt = pg_insert(TrialBiomarker).values(**row)
                        stmt = stmt.on_conflict_do_nothing()
                        db.execute(stmt)
                        total_biomarkers += 1

                    # Mark trial as processed
                    db.execute(
                        text("UPDATE trials SET nlp_processed_at = NOW(), nlp_version = :ver WHERE id = :id"),
                        {"ver": "llm_v1" if use_llm else "regex_v1", "id": trial["id"]}
                    )
                    total_extracted += 1

                except Exception as e:
                    print(f"    Error on {trial['nct_id']}: {e}")
                    errors += 1

            db.commit()
            print(f"  Batch done: {total_extracted} trials processed, {total_biomarkers} biomarker entries")

            if use_llm:
                time.sleep(0.5)  # Rate limiting for LLM API

        # Also mark trials with no biomarker keywords as processed (no biomarkers found)
        db.execute(text("""
            UPDATE trials SET nlp_processed_at = NOW(), nlp_version = 'no_biomarkers'
            WHERE nlp_processed_at IS NULL
        """))
        db.commit()

        # Update pipeline run
        db.execute(
            text("""
                UPDATE pipeline_runs SET status = 'completed',
                completed_at = NOW(), records_processed = :processed,
                records_created = :created
                WHERE id = :id
            """),
            {"processed": total_extracted, "created": total_biomarkers, "id": run_id}
        )
        db.commit()

        print(f"\n{'=' * 60}")
        print(f"Extraction complete!")
        print(f"  Trials processed: {total_extracted}")
        print(f"  Biomarker entries created: {total_biomarkers}")
        print(f"  Errors: {errors}")
        print(f"{'=' * 60}")

    except Exception as e:
        print(f"Pipeline error: {e}")
        db.execute(
            text("UPDATE pipeline_runs SET status = 'failed', error_message = :err WHERE id = :id"),
            {"err": str(e), "id": run_id}
        )
        db.commit()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run_extraction(use_llm=True)
