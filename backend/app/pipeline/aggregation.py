"""Aggregation pipeline - computes cutoff trends and dashboard stats."""
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.database import SessionLocal
from app.models.pipeline import CutoffTrend


def run_aggregation():
    print("--- Running Aggregation ---")
    db = SessionLocal()

    # Clear existing trends
    db.execute(text("DELETE FROM cutoff_trends"))
    db.commit()

    # Compute cutoff trends from trial_biomarkers
    # Group by biomarker, tumor_type, year, cutoff_unit
    rows = db.execute(text("""
        SELECT
            tb.biomarker_name,
            tb.tumor_type,
            t.start_year,
            tb.cutoff_unit,
            AVG(CASE WHEN tb.cutoff_value ~ '^[0-9.]+$' THEN CAST(tb.cutoff_value AS FLOAT) ELSE NULL END) as avg_cutoff,
            COUNT(*) as trial_count,
            MODE() WITHIN GROUP (ORDER BY tb.assay_name) as dominant_assay
        FROM trial_biomarkers tb
        JOIN trials t ON tb.trial_id = t.id
        WHERE t.start_year IS NOT NULL
          AND tb.biomarker_name IS NOT NULL
          AND tb.tumor_type IS NOT NULL
          AND tb.tumor_type != 'Solid Tumor'
        GROUP BY tb.biomarker_name, tb.tumor_type, t.start_year, tb.cutoff_unit
        HAVING COUNT(*) >= 1
        ORDER BY tb.biomarker_name, tb.tumor_type, t.start_year
    """)).fetchall()

    count = 0
    for row in rows:
        stmt = pg_insert(CutoffTrend).values(
            biomarker_name=row[0],
            tumor_type=row[1],
            year=row[2],
            cutoff_unit=row[3] or "",
            cutoff_value=row[4] if row[4] is not None else 0,
            trial_count=row[5],
            dominant_assay=row[6] or "",
        ).on_conflict_do_nothing()
        db.execute(stmt)
        count += 1

    db.commit()
    db.close()
    print(f"  Computed {count} cutoff trend entries")


if __name__ == "__main__":
    run_aggregation()
