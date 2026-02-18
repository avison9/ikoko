"""Make parent_views.user_id nullable for guest view tracking

Revision ID: 006
Revises: 005
Create Date: 2026-02-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("parent_views", "user_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    op.execute("DELETE FROM parent_views WHERE user_id IS NULL")
    op.alter_column("parent_views", "user_id", existing_type=sa.Integer(), nullable=False)
