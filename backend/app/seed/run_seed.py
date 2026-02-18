"""Seed the database with reference data."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.database import SessionLocal, engine, Base
from app.models import Indication, Biomarker, Assay
from app.seed.data import INDICATIONS, BIOMARKERS, ASSAYS


def seed_all():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Seed indications
        for ind in INDICATIONS:
            stmt = pg_insert(Indication).values(**ind).on_conflict_do_nothing(index_elements=["name"])
            db.execute(stmt)
        db.commit()
        print(f"Seeded {len(INDICATIONS)} indications")

        # Seed biomarkers
        for bm in BIOMARKERS:
            stmt = pg_insert(Biomarker).values(**bm).on_conflict_do_nothing(index_elements=["name"])
            db.execute(stmt)
        db.commit()
        print(f"Seeded {len(BIOMARKERS)} biomarkers")

        # Seed assays
        for assay in ASSAYS:
            stmt = pg_insert(Assay).values(**assay).on_conflict_do_nothing(index_elements=["name"])
            db.execute(stmt)
        db.commit()
        print(f"Seeded {len(ASSAYS)} assays")

        print("Seeding complete!")
    finally:
        db.close()


if __name__ == "__main__":
    seed_all()
