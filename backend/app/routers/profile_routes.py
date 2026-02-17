from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import hash_password, verify_password
from app.database import get_db
from app.dependencies import get_current_user
from app.models import User
from app.s3 import delete_object, presigned_url, upload_audio
from app.schemas import PasswordChange, ProfileUpdate, UserResponse

router = APIRouter(prefix="/api/profile", tags=["profile"])

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB


def _user_response(user: User) -> dict:
    data = {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "country": user.country,
        "username": user.username,
        "profile_picture_url": presigned_url(user.profile_picture) if user.profile_picture else None,
        "created_at": user.created_at,
    }
    return data


@router.get("/", response_model=UserResponse)
async def get_profile(user: User = Depends(get_current_user)):
    return _user_response(user)


@router.put("/", response_model=UserResponse)
async def update_profile(
    body: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        return _user_response(user)

    # Check uniqueness for username / email
    if "username" in updates and updates["username"] != user.username:
        existing = await db.execute(select(User).where(User.username == updates["username"]))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Username already taken")

    if "email" in updates and updates["email"] != user.email:
        existing = await db.execute(select(User).where(User.email == updates["email"]))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Email already taken")

    for key, value in updates.items():
        setattr(user, key, value)

    await db.commit()
    await db.refresh(user)
    return _user_response(user)


@router.post("/picture", response_model=UserResponse)
async def upload_picture(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, GIF, and WebP images are allowed")

    data = await file.read()
    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="Image must be under 5 MB")

    ext = ALLOWED_IMAGE_TYPES[file.content_type]
    key = f"users/{user.id}/profile/picture.{ext}"

    # Delete old picture if it exists and has a different key
    if user.profile_picture and user.profile_picture != key:
        delete_object(user.profile_picture)

    upload_audio(key, data, file.content_type)
    user.profile_picture = key
    await db.commit()
    await db.refresh(user)
    return _user_response(user)


@router.delete("/picture", response_model=UserResponse)
async def delete_picture(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.profile_picture:
        delete_object(user.profile_picture)
        user.profile_picture = None
        await db.commit()
        await db.refresh(user)
    return _user_response(user)


@router.put("/password")
async def change_password(
    body: PasswordChange,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"message": "Password changed successfully"}
