"""Add article fields (title, content_format) to posts

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
Create Date: 2026-03-10 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'o5p6q7r8s9t0'
down_revision: Union[str, None] = 'n4o5p6q7r8s9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add title column (nullable, for articles only)
    op.add_column('posts', sa.Column('title', sa.String(200), nullable=True))
    
    # Add content_format column (plain or markdown)
    op.add_column('posts', sa.Column(
        'content_format', 
        sa.String(20), 
        nullable=False, 
        server_default='plain'
    ))


def downgrade() -> None:
    op.drop_column('posts', 'content_format')
    op.drop_column('posts', 'title')
