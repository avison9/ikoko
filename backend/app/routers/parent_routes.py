from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, get_optional_user
from app.models import Child, Collaborator, Comment, CommentReaction, Parent, ParentView, Reaction, User
from app.s3 import delete_prefix, presigned_url
from app.schemas import (
    ChildOut,
    CollaboratorAdd,
    CollaboratorOut,
    CommentCreate,
    CommentOut,
    CommentReactionOut,
    CommentReactionToggle,
    ParentCreate,
    ParentDetail,
    ParentOut,
    ParentUpdate,
    PublicParentDetail,
    ReactionOut,
    ReactionToggle,
)

router = APIRouter(prefix="/api/parents", tags=["parents"])


@router.get("/", response_model=list[ParentOut])
async def list_parents(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Own parents
    result = await db.execute(
        select(Parent)
        .where(Parent.user_id == user.id)
        .options(selectinload(Parent.children), selectinload(Parent.user))
        .order_by(Parent.created_at.desc())
    )
    owned = result.scalars().all()

    # Parents where user is a collaborator
    collab_result = await db.execute(
        select(Parent)
        .join(Collaborator, Collaborator.parent_id == Parent.id)
        .where(Collaborator.user_id == user.id)
        .options(selectinload(Parent.children), selectinload(Parent.user))
        .order_by(Parent.created_at.desc())
    )
    collab_parents = collab_result.scalars().all()

    # Merge, avoiding duplicates
    seen_ids = set()
    all_parents = []
    for p in owned:
        seen_ids.add(p.id)
        all_parents.append(
            ParentOut(
                id=p.id,
                label=p.label,
                children_count=len(p.children),
                is_owner=True,
                owner_name=p.user.full_name,
                is_shared=p.is_shared,
                created_at=p.created_at,
                updated_at=p.updated_at,
            )
        )
    for p in collab_parents:
        if p.id not in seen_ids:
            seen_ids.add(p.id)
            all_parents.append(
                ParentOut(
                    id=p.id,
                    label=p.label,
                    children_count=len(p.children),
                    is_owner=False,
                    owner_name=p.user.full_name,
                    is_shared=p.is_shared,
                    created_at=p.created_at,
                    updated_at=p.updated_at,
                )
            )

    return all_parents


@router.post("/", response_model=ParentOut, status_code=201)
async def create_parent(
    body: ParentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    parent = Parent(user_id=user.id, label=body.label)
    db.add(parent)
    await db.commit()
    await db.refresh(parent)
    return ParentOut(
        id=parent.id,
        label=parent.label,
        children_count=0,
        is_owner=True,
        owner_name=user.full_name,
        is_shared=parent.is_shared,
        created_at=parent.created_at,
        updated_at=parent.updated_at,
    )


@router.get("/{parent_id}", response_model=ParentDetail)
async def get_parent(
    parent_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Parent)
        .where(Parent.id == parent_id)
        .options(
            selectinload(Parent.children),
            selectinload(Parent.user),
            selectinload(Parent.collaborators).selectinload(Collaborator.user),
        )
    )
    parent = result.scalar_one_or_none()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent not found")

    is_owner = parent.user_id == user.id
    is_collaborator = any(c.user_id == user.id for c in parent.collaborators)

    # Access gate: non-owner/non-collaborator can only view if shared
    if not is_owner and not is_collaborator and not parent.is_shared:
        raise HTTPException(status_code=403, detail="This card has not been shared")

    # Track view if user is not the owner and not a collaborator
    if not is_owner and not is_collaborator:
        one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
        recent_view = await db.execute(
            select(ParentView).where(
                ParentView.user_id == user.id,
                ParentView.parent_id == parent_id,
                ParentView.viewed_at > one_hour_ago,
            )
        )
        if not recent_view.scalar_one_or_none():
            db.add(ParentView(user_id=user.id, parent_id=parent_id))
            await db.commit()

    children_out = []
    for c in parent.children:
        children_out.append(
            ChildOut(
                id=c.id,
                name=c.name,
                phonetic=c.phonetic,
                meaning=c.meaning,
                passage=c.passage,
                audio_url=presigned_url(c.audio_key),
                sort_order=c.sort_order,
                created_at=c.created_at,
            )
        )

    collaborator_names = [c.user.username for c in parent.collaborators]

    return ParentDetail(
        id=parent.id,
        label=parent.label,
        children=children_out,
        is_owner=is_owner,
        owner_name=parent.user.full_name,
        is_shared=parent.is_shared,
        is_collaborator=is_collaborator,
        collaborator_names=collaborator_names,
        created_at=parent.created_at,
    )


@router.put("/{parent_id}", response_model=ParentOut)
async def update_parent(
    parent_id: int,
    body: ParentUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Parent)
        .where(Parent.id == parent_id, Parent.user_id == user.id)
        .options(selectinload(Parent.children))
    )
    parent = result.scalar_one_or_none()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent not found")

    parent.label = body.label
    await db.commit()
    await db.refresh(parent)
    return ParentOut(
        id=parent.id,
        label=parent.label,
        children_count=len(parent.children),
        is_owner=True,
        owner_name=user.full_name,
        is_shared=parent.is_shared,
        created_at=parent.created_at,
        updated_at=parent.updated_at,
    )


@router.delete("/{parent_id}", status_code=204)
async def delete_parent(
    parent_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Parent).where(Parent.id == parent_id, Parent.user_id == user.id)
    )
    parent = result.scalar_one_or_none()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent not found")

    delete_prefix(f"users/{user.id}/parents/{parent_id}/")

    await db.delete(parent)
    await db.commit()


# ── Public (guest-friendly) view ─────────────────────
@router.get("/{parent_id}/public", response_model=PublicParentDetail)
async def get_parent_public(
    parent_id: int,
    user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Parent)
        .where(Parent.id == parent_id)
        .options(
            selectinload(Parent.children),
            selectinload(Parent.user),
            selectinload(Parent.collaborators).selectinload(Collaborator.user),
        )
    )
    parent = result.scalar_one_or_none()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent not found")

    if not parent.is_shared:
        raise HTTPException(status_code=403, detail="This card has not been shared")

    is_guest = user is None
    is_owner = False if is_guest else parent.user_id == user.id
    is_collaborator = False if is_guest else any(c.user_id == user.id for c in parent.collaborators)

    # Track view for non-owner/non-collaborator (both guests and logged-in users)
    if not is_owner and not is_collaborator:
        one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
        if is_guest:
            # For guests, just record (no user_id dedup — throttled by 1h per parent via session/IP in future)
            db.add(ParentView(user_id=None, parent_id=parent_id))
            await db.commit()
        else:
            recent_view = await db.execute(
                select(ParentView).where(
                    ParentView.user_id == user.id,
                    ParentView.parent_id == parent_id,
                    ParentView.viewed_at > one_hour_ago,
                )
            )
            if not recent_view.scalar_one_or_none():
                db.add(ParentView(user_id=user.id, parent_id=parent_id))
                await db.commit()

    children_out = []
    for c in parent.children:
        children_out.append(
            ChildOut(
                id=c.id,
                name=c.name,
                phonetic=c.phonetic,
                meaning=c.meaning,
                passage=c.passage,
                audio_url=presigned_url(c.audio_key),
                sort_order=c.sort_order,
                created_at=c.created_at,
            )
        )

    collaborator_names = [c.user.username for c in parent.collaborators]

    return PublicParentDetail(
        id=parent.id,
        label=parent.label,
        children=children_out,
        is_owner=is_owner,
        owner_name=parent.user.full_name,
        is_shared=parent.is_shared,
        is_collaborator=is_collaborator,
        collaborator_names=collaborator_names,
        is_guest=is_guest,
        created_at=parent.created_at,
    )


# ── Public read-only reactions & comments ────────────
@router.get("/{parent_id}/public/reactions", response_model=list[ReactionOut])
async def list_reactions_public(
    parent_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Parent).where(Parent.id == parent_id)
    )
    parent = result.scalar_one_or_none()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent not found")
    if not parent.is_shared:
        raise HTTPException(status_code=403, detail="This card has not been shared")

    result = await db.execute(
        select(Reaction)
        .where(Reaction.parent_id == parent_id)
        .options(selectinload(Reaction.user))
        .order_by(Reaction.created_at.desc())
    )
    reactions = result.scalars().all()
    return [
        ReactionOut(
            id=r.id,
            user_id=r.user_id,
            username=r.user.username,
            parent_id=r.parent_id,
            emoji=r.emoji,
        )
        for r in reactions
    ]


@router.get("/{parent_id}/public/comments", response_model=list[CommentOut])
async def list_comments_public(
    parent_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Parent).where(Parent.id == parent_id)
    )
    parent = result.scalar_one_or_none()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent not found")
    if not parent.is_shared:
        raise HTTPException(status_code=403, detail="This card has not been shared")

    result = await db.execute(
        select(Comment)
        .where(Comment.parent_id == parent_id)
        .options(selectinload(Comment.user), selectinload(Comment.parent))
        .order_by(Comment.created_at.desc())
    )
    comments = result.scalars().all()
    return [
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


# ── Share toggle ─────────────────────────────────────
@router.put("/{parent_id}/share")
async def toggle_share(
    parent_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Parent).where(Parent.id == parent_id, Parent.user_id == user.id)
    )
    parent = result.scalar_one_or_none()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent not found or not owner")

    parent.is_shared = not parent.is_shared
    await db.commit()
    await db.refresh(parent)
    return {"is_shared": parent.is_shared}


# ── Comments ──────────────────────────────────────────
@router.post("/{parent_id}/comments", response_model=CommentOut, status_code=201)
async def create_comment(
    parent_id: int,
    body: CommentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Parent)
        .where(Parent.id == parent_id)
        .options(selectinload(Parent.user), selectinload(Parent.collaborators))
    )
    parent = result.scalar_one_or_none()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent not found")

    is_owner = parent.user_id == user.id
    is_collaborator = any(c.user_id == user.id for c in parent.collaborators)
    if not is_owner and not is_collaborator and not parent.is_shared:
        raise HTTPException(status_code=403, detail="This card has not been shared")

    comment = Comment(user_id=user.id, parent_id=parent_id, text=body.text)
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    return CommentOut(
        id=comment.id,
        user_id=user.id,
        username=user.username,
        full_name=user.full_name,
        profile_picture_url=presigned_url(user.profile_picture) if user.profile_picture else None,
        parent_id=parent_id,
        parent_label=parent.label,
        text=comment.text,
        created_at=comment.created_at,
    )


@router.get("/{parent_id}/comments", response_model=list[CommentOut])
async def list_comments(
    parent_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Comment)
        .where(Comment.parent_id == parent_id)
        .options(selectinload(Comment.user), selectinload(Comment.parent))
        .order_by(Comment.created_at.desc())
    )
    comments = result.scalars().all()
    return [
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


# ── Comment Reactions ─────────────────────────────────
ALLOWED_COMMENT_EMOJIS = ["\u2764\uFE0F", "\U0001F44D", "\U0001F525", "\U0001F60D", "\U0001F4AF"]


@router.post("/{parent_id}/comments/{comment_id}/reactions", status_code=200)
async def toggle_comment_reaction(
    parent_id: int,
    comment_id: int,
    body: CommentReactionToggle,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.emoji not in ALLOWED_COMMENT_EMOJIS:
        raise HTTPException(status_code=400, detail="Emoji not allowed")

    # Verify comment belongs to parent
    result = await db.execute(
        select(Comment).where(Comment.id == comment_id, Comment.parent_id == parent_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Comment not found")

    # Toggle: if exists remove, else add
    existing = await db.execute(
        select(CommentReaction).where(
            CommentReaction.user_id == user.id,
            CommentReaction.comment_id == comment_id,
            CommentReaction.emoji == body.emoji,
        )
    )
    reaction = existing.scalar_one_or_none()

    if reaction:
        await db.delete(reaction)
        await db.commit()
        return {"action": "removed"}
    else:
        new_reaction = CommentReaction(
            user_id=user.id, comment_id=comment_id, emoji=body.emoji
        )
        db.add(new_reaction)
        await db.commit()
        return {"action": "added"}


@router.get(
    "/{parent_id}/comments/{comment_id}/reactions",
    response_model=list[CommentReactionOut],
)
async def list_comment_reactions(
    parent_id: int,
    comment_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CommentReaction)
        .where(CommentReaction.comment_id == comment_id)
        .options(selectinload(CommentReaction.user))
        .order_by(CommentReaction.created_at.desc())
    )
    reactions = result.scalars().all()
    return [
        CommentReactionOut(
            id=r.id,
            user_id=r.user_id,
            username=r.user.username,
            comment_id=r.comment_id,
            emoji=r.emoji,
        )
        for r in reactions
    ]


@router.get(
    "/{parent_id}/public/comments/{comment_id}/reactions",
    response_model=list[CommentReactionOut],
)
async def list_comment_reactions_public(
    parent_id: int,
    comment_id: int,
    db: AsyncSession = Depends(get_db),
):
    # Verify parent is shared
    result = await db.execute(select(Parent).where(Parent.id == parent_id))
    parent = result.scalar_one_or_none()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent not found")
    if not parent.is_shared:
        raise HTTPException(status_code=403, detail="This card has not been shared")

    result = await db.execute(
        select(CommentReaction)
        .where(CommentReaction.comment_id == comment_id)
        .options(selectinload(CommentReaction.user))
        .order_by(CommentReaction.created_at.desc())
    )
    reactions = result.scalars().all()
    return [
        CommentReactionOut(
            id=r.id,
            user_id=r.user_id,
            username=r.user.username,
            comment_id=r.comment_id,
            emoji=r.emoji,
        )
        for r in reactions
    ]


# ── Reactions ─────────────────────────────────────────
MAX_REACTIONS_PER_EMOJI = 10


@router.post("/{parent_id}/reactions", status_code=200)
async def add_reaction(
    parent_id: int,
    body: ReactionToggle,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Parent).where(Parent.id == parent_id).options(selectinload(Parent.collaborators))
    )
    parent = result.scalar_one_or_none()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent not found")

    is_owner = parent.user_id == user.id
    is_collaborator = any(c.user_id == user.id for c in parent.collaborators)
    if not is_owner and not is_collaborator and not parent.is_shared:
        raise HTTPException(status_code=403, detail="This card has not been shared")

    # Count how many times this user already reacted with this emoji
    from sqlalchemy import func as sa_func
    count_result = await db.execute(
        select(sa_func.count(Reaction.id)).where(
            Reaction.user_id == user.id,
            Reaction.parent_id == parent_id,
            Reaction.emoji == body.emoji,
        )
    )
    current_count = count_result.scalar() or 0

    if current_count >= MAX_REACTIONS_PER_EMOJI:
        raise HTTPException(status_code=409, detail="Maximum reactions reached for this emoji")

    new_reaction = Reaction(user_id=user.id, parent_id=parent_id, emoji=body.emoji)
    db.add(new_reaction)
    await db.commit()
    return {"action": "added", "emoji": body.emoji, "user_count": current_count + 1}


@router.delete("/{parent_id}/reactions", status_code=200)
async def remove_reaction(
    parent_id: int,
    body: ReactionToggle,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Access gate
    parent_result = await db.execute(
        select(Parent).where(Parent.id == parent_id).options(selectinload(Parent.collaborators))
    )
    parent = parent_result.scalar_one_or_none()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent not found")

    is_owner = parent.user_id == user.id
    is_collaborator = any(c.user_id == user.id for c in parent.collaborators)
    if not is_owner and not is_collaborator and not parent.is_shared:
        raise HTTPException(status_code=403, detail="This card has not been shared")

    # Remove one reaction row for this user+parent+emoji
    result = await db.execute(
        select(Reaction).where(
            Reaction.user_id == user.id,
            Reaction.parent_id == parent_id,
            Reaction.emoji == body.emoji,
        ).limit(1)
    )
    reaction = result.scalar_one_or_none()
    if not reaction:
        raise HTTPException(status_code=404, detail="No reaction to remove")

    await db.delete(reaction)
    await db.commit()
    return {"action": "removed", "emoji": body.emoji}


@router.get("/{parent_id}/reactions", response_model=list[ReactionOut])
async def list_reactions(
    parent_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Reaction)
        .where(Reaction.parent_id == parent_id)
        .options(selectinload(Reaction.user))
        .order_by(Reaction.created_at.desc())
    )
    reactions = result.scalars().all()
    return [
        ReactionOut(
            id=r.id,
            user_id=r.user_id,
            username=r.user.username,
            parent_id=r.parent_id,
            emoji=r.emoji,
        )
        for r in reactions
    ]


# ── Collaborators ─────────────────────────────────────
@router.post("/{parent_id}/collaborators", response_model=CollaboratorOut, status_code=201)
async def add_collaborator(
    parent_id: int,
    body: CollaboratorAdd,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Parent).where(Parent.id == parent_id, Parent.user_id == user.id)
    )
    parent = result.scalar_one_or_none()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent not found or not owner")

    target_result = await db.execute(
        select(User).where(User.username == body.username)
    )
    target_user = target_result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = await db.execute(
        select(Collaborator).where(
            Collaborator.user_id == target_user.id,
            Collaborator.parent_id == parent_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Already a collaborator")

    collab = Collaborator(user_id=target_user.id, parent_id=parent_id)
    db.add(collab)
    await db.commit()
    await db.refresh(collab)

    return CollaboratorOut(
        user_id=target_user.id,
        username=target_user.username,
        full_name=target_user.full_name,
        created_at=collab.created_at,
    )


@router.delete("/{parent_id}/collaborators/{collab_user_id}", status_code=204)
async def remove_collaborator(
    parent_id: int,
    collab_user_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Parent).where(Parent.id == parent_id, Parent.user_id == user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Parent not found or not owner")

    collab_result = await db.execute(
        select(Collaborator).where(
            Collaborator.user_id == collab_user_id,
            Collaborator.parent_id == parent_id,
        )
    )
    collab = collab_result.scalar_one_or_none()
    if not collab:
        raise HTTPException(status_code=404, detail="Collaborator not found")

    await db.delete(collab)
    await db.commit()


@router.get("/{parent_id}/collaborators", response_model=list[CollaboratorOut])
async def list_collaborators(
    parent_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Collaborator)
        .where(Collaborator.parent_id == parent_id)
        .options(selectinload(Collaborator.user))
        .order_by(Collaborator.created_at.desc())
    )
    collabs = result.scalars().all()
    return [
        CollaboratorOut(
            user_id=c.user_id,
            username=c.user.username,
            full_name=c.user.full_name,
            created_at=c.created_at,
        )
        for c in collabs
    ]
