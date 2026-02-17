from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Child, Collaborator, Parent, User
from app.s3 import build_key, delete_object, presigned_url, upload_audio
from app.schemas import ChildCreate, ChildOut, ChildUpdate

router = APIRouter(prefix="/api/parents/{parent_id}/children", tags=["children"])

ALLOWED_AUDIO = {"audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/ogg"}
MAX_AUDIO_SIZE = 10 * 1024 * 1024  # 10 MB


async def _get_parent_owned(parent_id: int, user: User, db) -> Parent:
    result = await db.execute(
        select(Parent).where(Parent.id == parent_id)
    )
    parent = result.scalar_one_or_none()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent not found")

    # Allow if owner or collaborator
    if parent.user_id == user.id:
        return parent

    collab = await db.execute(
        select(Collaborator).where(
            Collaborator.user_id == user.id,
            Collaborator.parent_id == parent_id,
        )
    )
    if collab.scalar_one_or_none():
        return parent

    raise HTTPException(status_code=404, detail="Parent not found")


def _child_response(child: Child) -> ChildOut:
    return ChildOut(
        id=child.id,
        name=child.name,
        phonetic=child.phonetic,
        meaning=child.meaning,
        passage=child.passage,
        audio_url=presigned_url(child.audio_key),
        sort_order=child.sort_order,
        created_at=child.created_at,
    )


@router.post("/", response_model=ChildOut, status_code=201)
async def create_child(
    parent_id: int,
    body: ChildCreate,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    parent = await _get_parent_owned(parent_id, user, db)
    child = Child(
        parent_id=parent.id,
        name=body.name,
        phonetic=body.phonetic,
        meaning=body.meaning,
        passage=body.passage,
        sort_order=body.sort_order,
    )
    db.add(child)
    await db.commit()
    await db.refresh(child)
    return _child_response(child)


@router.post("/{child_id}/audio", response_model=ChildOut)
async def upload_child_audio(
    parent_id: int,
    child_id: int,
    file: UploadFile,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    await _get_parent_owned(parent_id, user, db)

    result = await db.execute(
        select(Child).where(Child.id == child_id, Child.parent_id == parent_id)
    )
    child = result.scalar_one_or_none()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    if file.content_type not in ALLOWED_AUDIO:
        raise HTTPException(status_code=400, detail="Unsupported audio format")

    data = await file.read()
    if len(data) > MAX_AUDIO_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "mp3"
    key = build_key(user.id, parent_id, child_id, ext)

    # Delete old audio if exists
    if child.audio_key:
        delete_object(child.audio_key)

    upload_audio(key, data, file.content_type)
    child.audio_key = key
    await db.commit()
    await db.refresh(child)
    return _child_response(child)


@router.put("/{child_id}", response_model=ChildOut)
async def update_child(
    parent_id: int,
    child_id: int,
    body: ChildUpdate,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    await _get_parent_owned(parent_id, user, db)

    result = await db.execute(
        select(Child).where(Child.id == child_id, Child.parent_id == parent_id)
    )
    child = result.scalar_one_or_none()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(child, field, value)

    await db.commit()
    await db.refresh(child)
    return _child_response(child)


@router.delete("/{child_id}", status_code=204)
async def delete_child(
    parent_id: int,
    child_id: int,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    await _get_parent_owned(parent_id, user, db)

    result = await db.execute(
        select(Child).where(Child.id == child_id, Child.parent_id == parent_id)
    )
    child = result.scalar_one_or_none()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    if child.audio_key:
        delete_object(child.audio_key)

    await db.delete(child)
    await db.commit()
