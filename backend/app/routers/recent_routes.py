from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Child, Parent, ParentView, User
from app.schemas import RecentParentOut

router = APIRouter(prefix="/api/recent", tags=["recent"])


@router.get("/", response_model=list[RecentParentOut])
async def get_recent_parents(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return recently viewed parents that belong to other users."""
    children_count = (
        select(func.count(Child.id))
        .where(Child.parent_id == Parent.id)
        .correlate(Parent)
        .scalar_subquery()
    )

    stmt = (
        select(
            Parent.id.label("parent_id"),
            Parent.label,
            Parent.is_shared,
            User.full_name.label("owner_name"),
            func.max(ParentView.viewed_at).label("last_viewed_at"),
            children_count.label("children_count"),
        )
        .join(Parent, ParentView.parent_id == Parent.id)
        .join(User, Parent.user_id == User.id)
        .where(ParentView.user_id == user.id)
        .where(Parent.user_id != user.id)
        .group_by(Parent.id, Parent.label, Parent.is_shared, User.full_name)
        .order_by(func.max(ParentView.viewed_at).desc())
    )

    result = await db.execute(stmt)
    rows = result.all()

    return [
        RecentParentOut(
            parent_id=row.parent_id,
            label=row.label,
            owner_name=row.owner_name,
            children_count=row.children_count,
            is_shared=row.is_shared,
            last_viewed_at=row.last_viewed_at,
        )
        for row in rows
    ]
