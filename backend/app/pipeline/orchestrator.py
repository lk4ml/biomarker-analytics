"""Pipeline orchestrator - runs all pipeline stages in sequence."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from app.pipeline.ct_gov_ingestion import run_ingestion
from app.pipeline.llm_extraction import run_extraction
from app.pipeline.enrichment.opentargets import run_opentargets_enrichment
from app.pipeline.enrichment.pubmed import run_pubmed_enrichment
from app.pipeline.enrichment.gwas import run_gwas_enrichment
from app.pipeline.enrichment.civic import run_civic_enrichment
from app.pipeline.enrichment.cbioportal import run_cbioportal_enrichment
from app.pipeline.enrichment.oncokb import run_oncokb_enrichment
from app.pipeline.enrichment.openfda import run_openfda_enrichment
from app.pipeline.aggregation import run_aggregation
from app.pipeline.backfill_variants import run_backfill


def run_full_pipeline(use_llm: bool = True):
    print("=" * 70)
    print("  BiomarkerScope Full Pipeline")
    print("=" * 70)

    # Stage 1: Ingest trials from ClinicalTrials.gov
    print("\n[Stage 1/7] ClinicalTrials.gov Ingestion")
    run_ingestion()

    # Stage 2: Extract biomarkers using LLM or regex
    print("\n[Stage 2/7] Biomarker Extraction")
    run_extraction(use_llm=use_llm)

    # Stage 3: External enrichment (gene-level)
    print("\n[Stage 3/7] Gene-Level External Enrichment")
    run_opentargets_enrichment()
    run_pubmed_enrichment()
    run_gwas_enrichment()
    run_civic_enrichment()

    # Stage 4: Variant backfill from extracted data
    print("\n[Stage 4/7] Variant Name Backfill")
    run_backfill()

    # Stage 5: Mutation-level enrichment
    print("\n[Stage 5/7] Mutation-Level Enrichment")
    run_cbioportal_enrichment()
    run_oncokb_enrichment()
    run_openfda_enrichment()

    # Stage 6: Aggregation
    print("\n[Stage 6/7] Aggregation")
    run_aggregation()

    print("\n" + "=" * 70)
    print("  Pipeline Complete!")
    print("=" * 70)


if __name__ == "__main__":
    use_llm = "--no-llm" not in sys.argv
    run_full_pipeline(use_llm=use_llm)
