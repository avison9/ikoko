from datetime import datetime

from pydantic import BaseModel, EmailStr


# ── Auth ──────────────────────────────────────────────
class RegisterRequest(BaseModel):
    full_name: str
    email: EmailStr
    country: str
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    full_name: str
    email: str
    country: str
    username: str
    profile_picture_url: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    username: str | None = None
    email: EmailStr | None = None
    country: str | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


# ── Parent ────────────────────────────────────────────
class ParentCreate(BaseModel):
    label: str


class ParentUpdate(BaseModel):
    label: str


class ChildOut(BaseModel):
    id: int
    name: str
    phonetic: str | None = None
    meaning: str
    passage: str | None = None
    audio_url: str | None = None
    sort_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ParentOut(BaseModel):
    id: int
    label: str
    children_count: int = 0
    is_owner: bool = True
    owner_name: str = ""
    is_shared: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ParentDetail(BaseModel):
    id: int
    label: str
    children: list[ChildOut] = []
    is_owner: bool = True
    owner_name: str = ""
    is_shared: bool = False
    is_collaborator: bool = False
    collaborator_names: list[str] = []
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Child ─────────────────────────────────────────────
class ChildCreate(BaseModel):
    name: str
    phonetic: str | None = None
    meaning: str
    passage: str | None = None
    sort_order: int = 0


class ChildUpdate(BaseModel):
    name: str | None = None
    phonetic: str | None = None
    meaning: str | None = None
    passage: str | None = None
    sort_order: int | None = None


# ── Analytics ─────────────────────────────────────────
class SharedParentSummary(BaseModel):
    parent_id: int
    label: str
    view_count: int


class AnalyticsSummary(BaseModel):
    total_names_created: int
    total_shared_parents: int
    shared_parents: list[SharedParentSummary]


# ── Comments ──────────────────────────────────────────
class CommentCreate(BaseModel):
    text: str


class CommentOut(BaseModel):
    id: int
    user_id: int
    username: str
    full_name: str
    profile_picture_url: str | None = None
    parent_id: int
    parent_label: str
    text: str
    created_at: datetime


# ── Reactions ─────────────────────────────────────────
class ReactionToggle(BaseModel):
    emoji: str


class ReactionOut(BaseModel):
    id: int
    user_id: int
    username: str
    parent_id: int
    emoji: str


# ── Collaborators ─────────────────────────────────────
class CollaboratorAdd(BaseModel):
    username: str


class CollaboratorOut(BaseModel):
    user_id: int
    username: str
    full_name: str
    created_at: datetime
