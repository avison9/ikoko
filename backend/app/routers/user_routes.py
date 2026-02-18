from fastapi import APIRouter, HTTPException
from fastapi.params import Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Parent, User
from app.s3 import presigned_url
from app.schemas import PublicUserProfile

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/{username}", response_model=PublicUserProfile)
async def get_public_profile(username: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    count_result = await db.execute(
        select(func.count()).select_from(Parent).where(Parent.user_id == user.id)
    )
    parent_count = count_result.scalar()

    return PublicUserProfile(
        username=user.username,
        full_name=user.full_name,
        country=user.country,
        profile_picture_url=presigned_url(user.profile_picture) if user.profile_picture else None,
        created_at=user.created_at,
        parent_count=parent_count,
    )
