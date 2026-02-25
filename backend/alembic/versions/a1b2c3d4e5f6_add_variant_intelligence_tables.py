"""add_variant_intelligence_tables

Revision ID: a1b2c3d4e5f6
Revises: ef1f4e3e547a
Create Date: 2026-02-17 10:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, ARRAY


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'ef1f4e3e547a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- New column on trial_biomarkers ---
    op.add_column('trial_biomarkers',
        sa.Column('variant_name', sa.String(100), nullable=True)
    )
    op.create_index('ix_trial_biomarkers_variant_name', 'trial_biomarkers', ['variant_name'])

    # --- New column on ot_known_drugs ---
    op.add_column('ot_known_drugs',
        sa.Column('target_variant', sa.String(100), nullable=True)
    )

    # --- mutation_prevalence (cBioPortal GENIE) ---
    op.create_table('mutation_prevalence',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('gene', sa.String(50), nullable=False, index=True),
        sa.Column('variant_name', sa.String(100), nullable=False, index=True),
        sa.Column('hgvs_p', sa.String(200)),
        sa.Column('cancer_type', sa.String(200), nullable=False),
        sa.Column('indication_name', sa.String(100), index=True),
        sa.Column('sample_count', sa.Integer, nullable=False),
        sa.Column('total_profiled', sa.Integer, nullable=False),
        sa.Column('frequency', sa.Float, nullable=False),
        sa.Column('dataset', sa.String(100), nullable=False),
        sa.Column('co_mutations', JSONB),
        sa.Column('source_url', sa.Text),
        sa.Column('fetched_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('gene', 'variant_name', 'cancer_type', 'dataset',
                            name='uq_mutation_prev_gene_var_cancer_ds'),
    )

    # --- oncokb_actionability ---
    op.create_table('oncokb_actionability',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('gene', sa.String(50), nullable=False, index=True),
        sa.Column('variant_name', sa.String(100), nullable=False, index=True),
        sa.Column('cancer_type', sa.String(200), nullable=False),
        sa.Column('indication_name', sa.String(100), index=True),
        sa.Column('level', sa.String(20), nullable=False),
        sa.Column('drugs', ARRAY(sa.String), nullable=False, server_default='{}'),
        sa.Column('description', sa.Text),
        sa.Column('citations', JSONB),
        sa.Column('source_url', sa.Text),
        sa.Column('fetched_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('gene', 'variant_name', 'cancer_type',
                            name='uq_oncokb_gene_var_cancer'),
    )

    # --- fda_approvals ---
    op.create_table('fda_approvals',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('drug_name', sa.String(300), nullable=False),
        sa.Column('generic_name', sa.String(300)),
        sa.Column('application_number', sa.String(50), nullable=False, index=True),
        sa.Column('approval_date', sa.Date),
        sa.Column('supplement_number', sa.String(20)),
        sa.Column('biomarker_gene', sa.String(50), index=True),
        sa.Column('biomarker_variant', sa.String(100)),
        sa.Column('indication_text', sa.Text),
        sa.Column('indication_name', sa.String(100), index=True),
        sa.Column('companion_dx_name', sa.String(300)),
        sa.Column('companion_dx_pma', sa.String(50)),
        sa.Column('source_url', sa.Text),
        sa.Column('fetched_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('application_number', 'supplement_number', 'biomarker_variant',
                            name='uq_fda_app_supp_variant'),
    )

    # --- data_provenance ---
    op.create_table('data_provenance',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('entity_type', sa.String(50), nullable=False, index=True),
        sa.Column('entity_id', sa.Integer, nullable=False),
        sa.Column('source_name', sa.String(100), nullable=False),
        sa.Column('source_id', sa.String(200)),
        sa.Column('source_url', sa.Text),
        sa.Column('access_date', sa.Date, nullable=False),
        sa.Column('version_tag', sa.String(50)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_data_provenance_entity', 'data_provenance', ['entity_type', 'entity_id'])


def downgrade() -> None:
    op.drop_table('data_provenance')
    op.drop_table('fda_approvals')
    op.drop_table('oncokb_actionability')
    op.drop_table('mutation_prevalence')
    op.drop_index('ix_trial_biomarkers_variant_name', table_name='trial_biomarkers')
    op.drop_column('trial_biomarkers', 'variant_name')
    op.drop_column('ot_known_drugs', 'target_variant')
