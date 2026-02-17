"""Allow multiple reactions per user per emoji

Revision ID: 003
Revises: 002
Create Date: 2026-02-17

"""
from typing import Sequence, Union

from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("uq_reaction_user_parent_emoji", "reactions", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint(
        "uq_reaction_user_parent_emoji", "reactions", ["user_id", "parent_id", "emoji"]
    )
