from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Child, Comment, Parent, ParentView, Reaction, User
from app.s3 import presigned_url
from app.schemas import AnalyticsSummary, CommentOut, ReactionOut, SharedParentSummary

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/summary", response_model=AnalyticsSummary)
async def get_summary(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Total names created across all owned parents
    names_result = await db.execute(
        select(func.count(Child.id))
        .join(Parent, Child.parent_id == Parent.id)
        .where(Parent.user_id == user.id)
    )
    total_names = names_result.scalar() or 0

    # Shared parents with view counts
    shared_result = await db.execute(
        select(
            Parent.id,
            Parent.label,
            func.count(ParentView.id).label("view_count"),
        )
        .outerjoin(ParentView, ParentView.parent_id == Parent.id)
        .where(Parent.user_id == user.id)
        .group_by(Parent.id, Parent.label)
        .having(func.count(ParentView.id) > 0)
    )
    shared_rows = shared_result.all()

    shared_parents = [
        SharedParentSummary(parent_id=row[0], label=row[1], view_count=row[2])
        for row in shared_rows
    ]

    return AnalyticsSummary(
        total_names_created=total_names,
        total_shared_parents=len(shared_parents),
        shared_parents=shared_parents,
    )


@router.get("/comments")
async def get_all_comments(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # All comments on user's owned parents
    comment_result = await db.execute(
        select(Comment)
        .join(Parent, Comment.parent_id == Parent.id)
        .where(Parent.user_id == user.id)
        .options(selectinload(Comment.user), selectinload(Comment.parent))
        .order_by(Comment.created_at.desc())
    )
    comments = comment_result.scalars().all()

    comments_out = [
        CommentOut(
            id=c.id,
            user_id=c.user_id,
            username=c.user.username,
            full_name=c.user.full_name,
            profile_picture_url=presigned_url(c.user.profile_picture) if c.user.profile_picture else None,
            parent_id=c.parent_id,
            parent_label=c.parent.label,
            text=c.text,
            created_at=c.created_at,
        )
        for c in comments
    ]

    # All reactions on user's owned parents
    reaction_result = await db.execute(
        select(Reaction)
        .join(Parent, Reaction.parent_id == Parent.id)
        .where(Parent.user_id == user.id)
        .options(selectinload(Reaction.user))
        .order_by(Reaction.created_at.desc())
    )
    reactions = reaction_result.scalars().all()

    reactions_out = [
        ReactionOut(
            id=r.id,
            user_id=r.user_id,
            username=r.user.username,
            parent_id=r.parent_id,
            emoji=r.emoji,
        )
        for r in reactions
    ]

    return {"comments": comments_out, "reactions": reactions_out}
