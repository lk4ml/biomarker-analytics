"""Backfill variant_name column on trial_biomarkers from existing cutoff_value data.

For rows where cutoff_unit = 'mutation' and cutoff_value is a specific mutation
(not just 'mutated'), populate variant_name from cutoff_value.
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from sqlalchemy import text
from app.database import SessionLocal


# Known specific mutation values (not generic statuses)
GENERIC_VALUES = {"mutated", "mutation", "positive", "negative", "wild-type", "wildtype",
                  "wt", "assessed", "present", "absent", "detected", "not detected",
                  "pathogenic", "deleterious", "any"}


def run_backfill():
    """Populate trial_biomarkers.variant_name from cutoff_value where appropriate."""
    print("=" * 60)
    print("Variant Name Backfill")
    print("=" * 60)

    db = SessionLocal()

    # Step 1: Backfill from mutation-type cutoffs
    # Where cutoff_unit contains 'mutation' and cutoff_value is a specific variant
    result = db.execute(text("""
        SELECT id, biomarker_name, cutoff_value, cutoff_unit
        FROM trial_biomarkers
        WHERE variant_name IS NULL
        AND cutoff_value IS NOT NULL
        AND cutoff_value != ''
        AND (
            cutoff_unit ILIKE '%mutation%'
            OR cutoff_unit ILIKE '%variant%'
            OR cutoff_unit ILIKE '%fusion%'
        )
    """)).fetchall()

    print(f"Found {len(result)} rows with mutation/variant/fusion cutoff_unit and no variant_name")

    updated = 0
    for row in result:
        row_id, bm_name, cutoff_val, cutoff_unit = row
        val_lower = cutoff_val.strip().lower()

        # Skip generic values
        if val_lower in GENERIC_VALUES:
            continue

        # This is a specific variant (e.g., "G12C", "V600E", "L858R", "exon 19 del")
        db.execute(
            text("UPDATE trial_biomarkers SET variant_name = :variant WHERE id = :id"),
            {"variant": cutoff_val.strip(), "id": row_id}
        )
        updated += 1

    db.commit()
    print(f"Updated {updated} rows with specific mutation variant_name")

    # Step 2: Also backfill from well-known patterns in cutoff_value
    # These are common mutation designations even when cutoff_unit isn't 'mutation'
    known_patterns = [
        ("BRAF", "V600E"), ("BRAF", "V600K"), ("BRAF", "V600"),
        ("EGFR", "L858R"), ("EGFR", "T790M"), ("EGFR", "exon 19 del"),
        ("EGFR", "exon 20 ins"), ("EGFR", "C797S"),
        ("KRAS", "G12C"), ("KRAS", "G12D"), ("KRAS", "G12V"),
        ("KRAS", "G12A"), ("KRAS", "G12R"), ("KRAS", "G12S"),
        ("KRAS", "G13D"), ("KRAS", "Q61H"), ("KRAS", "Q61R"),
        ("ALK", "rearrangement"), ("ALK", "fusion"),
        ("ROS1", "rearrangement"), ("ROS1", "fusion"),
        ("RET", "rearrangement"), ("RET", "fusion"),
        ("NTRK", "fusion"),
        ("MSI", "MSI-H"), ("MSI", "dMMR"),
    ]

    pattern_updated = 0
    for bm_name, variant in known_patterns:
        result = db.execute(text("""
            UPDATE trial_biomarkers
            SET variant_name = :variant
            WHERE biomarker_name = :bm
            AND variant_name IS NULL
            AND cutoff_value ILIKE :pattern
        """), {"variant": variant, "bm": bm_name, "pattern": f"%{variant}%"})
        pattern_updated += result.rowcount

    db.commit()
    print(f"Updated {pattern_updated} additional rows from known mutation patterns")

    # Report summary
    total_with_variant = db.execute(text(
        "SELECT COUNT(*) FROM trial_biomarkers WHERE variant_name IS NOT NULL"
    )).scalar()
    total_rows = db.execute(text("SELECT COUNT(*) FROM trial_biomarkers")).scalar()
    print(f"\nTotal trial_biomarkers: {total_rows}")
    print(f"Rows with variant_name: {total_with_variant} ({total_with_variant/total_rows*100:.1f}%)" if total_rows else "")

    # Show variant distribution
    top_variants = db.execute(text("""
        SELECT biomarker_name, variant_name, COUNT(*) as cnt
        FROM trial_biomarkers
        WHERE variant_name IS NOT NULL
        GROUP BY biomarker_name, variant_name
        ORDER BY cnt DESC
        LIMIT 20
    """)).fetchall()
    print("\nTop variants:")
    for r in top_variants:
        print(f"  {r[0]} {r[1]}: {r[2]} trial entries")

    db.close()
    print(f"\n{'=' * 60}")
    print("Backfill complete!")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    run_backfill()
