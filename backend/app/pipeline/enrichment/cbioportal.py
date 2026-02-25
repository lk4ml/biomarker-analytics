"""cBioPortal mutation prevalence enrichment pipeline.

Fetches mutation-level frequency data from cBioPortal public API using
TCGA PanCancer Atlas and MSK-IMPACT datasets. Computes per-variant
prevalence across cancer types and co-mutation frequencies.

No API key required — uses the public cBioPortal REST API.
"""
import json
import subprocess
import time
from collections import Counter
from datetime import date

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import SessionLocal
from app.models import MutationPrevalence, DataProvenance

CBIOPORTAL_API = "https://www.cbioportal.org/api"

# Studies to query: TCGA PanCancer Atlas (disease-specific) + MSK-IMPACT (pan-cancer)
# Each entry: (study_id, cancer_type, mapped indication name)
STUDY_CANCER_MAP = [
    # NSCLC (Lung Adenocarcinoma + Squamous)
    ("luad_tcga_pan_can_atlas_2018", "Lung Adenocarcinoma", "NSCLC"),
    ("lusc_tcga_pan_can_atlas_2018", "Lung Squamous Cell Carcinoma", "NSCLC"),
    # Breast Cancer
    ("brca_tcga_pan_can_atlas_2018", "Breast Invasive Carcinoma", "Breast Cancer"),
    # Colorectal Cancer
    ("coadread_tcga_pan_can_atlas_2018", "Colorectal Adenocarcinoma", "Colorectal Cancer"),
    # Melanoma
    ("skcm_tcga_pan_can_atlas_2018", "Skin Cutaneous Melanoma", "Melanoma"),
    # Gastric Cancer
    ("stad_tcga_pan_can_atlas_2018", "Stomach Adenocarcinoma", "Gastric Cancer"),
    # MSK-IMPACT (pan-cancer, large cohort)
    ("msk_impact_2017", "Pan-Cancer (MSK-IMPACT)", None),
]

# Genes to profile
GENE_SYMBOLS = ["KRAS", "EGFR", "BRAF", "ALK", "PIK3CA", "ERBB2", "MET", "RET", "ROS1", "NTRK1", "NTRK2", "NTRK3"]

# Minimum mutation count to store (filters out ultra-rare variants)
MIN_MUTATION_COUNT = 2


def curl_get_json(url, timeout=30):
    """GET JSON via subprocess curl."""
    result = subprocess.run(
        ["curl", "-s", "--max-time", str(timeout), url],
        capture_output=True, text=True, timeout=timeout + 10
    )
    if result.returncode != 0:
        raise RuntimeError(f"curl failed: {result.stderr}")
    return json.loads(result.stdout)


def get_entrez_gene_id(gene_symbol: str) -> int | None:
    """Look up the Entrez gene ID for a HUGO gene symbol."""
    try:
        data = curl_get_json(f"{CBIOPORTAL_API}/genes/{gene_symbol}")
        return data.get("entrezGeneId")
    except Exception:
        return None


def get_sample_count(study_id: str) -> int:
    """Get total profiled sample count for a study."""
    try:
        data = curl_get_json(f"{CBIOPORTAL_API}/sample-lists/{study_id}_all")
        return data.get("sampleCount", 0)
    except Exception:
        return 0


def fetch_mutations_for_gene(study_id: str, entrez_id: int) -> list[dict]:
    """Fetch all mutations for a gene in a given study."""
    url = (
        f"{CBIOPORTAL_API}/molecular-profiles/{study_id}_mutations/mutations"
        f"?entrezGeneId={entrez_id}"
        f"&sampleListId={study_id}_all"
        f"&projection=SUMMARY"
    )
    try:
        data = curl_get_json(url, timeout=60)
        if isinstance(data, list):
            return data
        return []
    except Exception as e:
        print(f"    Error fetching {study_id}/{entrez_id}: {e}")
        return []


def compute_co_mutations(study_id: str, gene_symbol: str, variant_name: str,
                          mutated_sample_ids: set, all_gene_ids: dict) -> list[dict]:
    """For samples with a specific mutation, check co-occurring mutations in other genes.

    Returns top co-mutated genes with their frequencies.
    """
    co_mutations = []
    if len(mutated_sample_ids) < 5:
        return co_mutations

    # Check a subset of key oncology genes for co-mutations
    co_genes = ["TP53", "STK11", "KEAP1", "CDKN2A", "RB1", "NF1", "PTEN", "APC", "SMAD4"]

    for co_gene in co_genes:
        if co_gene == gene_symbol:
            continue
        co_entrez = all_gene_ids.get(co_gene)
        if not co_entrez:
            continue

        try:
            muts = fetch_mutations_for_gene(study_id, co_entrez)
            co_mutated = set(m.get("sampleId", "") for m in muts if isinstance(m, dict))
            overlap = mutated_sample_ids & co_mutated
            if overlap:
                freq = len(overlap) / len(mutated_sample_ids)
                if freq >= 0.05:  # Only report if >= 5% co-occurrence
                    co_mutations.append({"gene": co_gene, "freq": round(freq, 3)})
        except Exception:
            continue

        time.sleep(0.3)  # Rate limiting

    co_mutations.sort(key=lambda x: x["freq"], reverse=True)
    return co_mutations[:10]


def run_cbioportal_enrichment():
    """Main enrichment function: fetch mutation prevalence from cBioPortal."""
    print("=" * 60)
    print("cBioPortal Mutation Prevalence Enrichment")
    print("=" * 60)

    db = SessionLocal()
    today = date.today()
    total_inserted = 0

    # Pre-fetch entrez gene IDs
    print("\nResolving gene IDs...")
    gene_ids: dict[str, int] = {}
    for gene in GENE_SYMBOLS:
        eid = get_entrez_gene_id(gene)
        if eid:
            gene_ids[gene] = eid
            print(f"  {gene}: {eid}")
        else:
            print(f"  {gene}: NOT FOUND, skipping")
        time.sleep(0.2)

    # Also fetch IDs for co-mutation genes
    co_gene_symbols = ["TP53", "STK11", "KEAP1", "CDKN2A", "RB1", "NF1", "PTEN", "APC", "SMAD4"]
    all_gene_ids = dict(gene_ids)
    for gene in co_gene_symbols:
        if gene not in all_gene_ids:
            eid = get_entrez_gene_id(gene)
            if eid:
                all_gene_ids[gene] = eid
            time.sleep(0.2)

    # Process each study
    for study_id, cancer_type, indication_name in STUDY_CANCER_MAP:
        print(f"\n--- {study_id} ({cancer_type}) ---")

        total_profiled = get_sample_count(study_id)
        if total_profiled == 0:
            print(f"  No sample list found, skipping")
            continue
        print(f"  Total profiled samples: {total_profiled}")
        time.sleep(0.3)

        for gene, entrez_id in gene_ids.items():
            print(f"  Fetching {gene} mutations...")
            mutations = fetch_mutations_for_gene(study_id, entrez_id)

            if not mutations:
                print(f"    No mutations found")
                time.sleep(0.3)
                continue

            # Group by proteinChange
            variant_counts = Counter()
            variant_samples: dict[str, set] = {}
            for m in mutations:
                if not isinstance(m, dict):
                    continue
                pc = m.get("proteinChange", "")
                if not pc or pc == "NA":
                    continue
                variant_counts[pc] += 1
                if pc not in variant_samples:
                    variant_samples[pc] = set()
                variant_samples[pc].add(m.get("sampleId", ""))

            total_mutated = len(set(m.get("sampleId", "") for m in mutations if isinstance(m, dict)))
            print(f"    {len(mutations)} mutations across {total_mutated} samples, {len(variant_counts)} unique variants")

            # Insert each variant
            for variant, count in variant_counts.most_common():
                if count < MIN_MUTATION_COUNT:
                    continue

                frequency = count / total_profiled
                unique_samples = variant_samples.get(variant, set())

                # Compute co-mutations only for high-frequency variants in disease-specific studies
                co_muts = None
                if count >= 10 and indication_name and gene in ["KRAS", "EGFR", "BRAF"]:
                    print(f"    Computing co-mutations for {gene} {variant}...")
                    co_muts = compute_co_mutations(
                        study_id, gene, variant, unique_samples, all_gene_ids
                    )

                source_url = f"https://www.cbioportal.org/study/summary?id={study_id}"

                row = {
                    "gene": gene,
                    "variant_name": variant,
                    "hgvs_p": f"p.{variant}" if variant else None,
                    "cancer_type": cancer_type,
                    "indication_name": indication_name,
                    "sample_count": len(unique_samples),
                    "total_profiled": total_profiled,
                    "frequency": round(frequency, 6),
                    "dataset": study_id,
                    "co_mutations": co_muts,
                    "source_url": source_url,
                }

                stmt = pg_insert(MutationPrevalence).values(**row)
                stmt = stmt.on_conflict_do_nothing()
                result = db.execute(stmt)

                if result.rowcount > 0:
                    total_inserted += 1
                    # Add provenance
                    db.flush()
                    # Get the inserted row's ID
                    prev_row = db.execute(text(
                        "SELECT id FROM mutation_prevalence "
                        "WHERE gene = :gene AND variant_name = :variant AND cancer_type = :ct AND dataset = :ds"
                    ), {"gene": gene, "variant": variant, "ct": cancer_type, "ds": study_id}).fetchone()
                    if prev_row:
                        prov = {
                            "entity_type": "prevalence",
                            "entity_id": prev_row[0],
                            "source_name": "cbioportal",
                            "source_id": study_id,
                            "source_url": source_url,
                            "access_date": today,
                            "version_tag": study_id,
                        }
                        db.execute(pg_insert(DataProvenance).values(**prov))

            db.commit()
            time.sleep(0.5)  # Rate limiting between genes

    db.close()

    print(f"\n{'=' * 60}")
    print(f"cBioPortal enrichment complete!")
    print(f"  Total prevalence records inserted: {total_inserted}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    import sys
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    run_cbioportal_enrichment()
