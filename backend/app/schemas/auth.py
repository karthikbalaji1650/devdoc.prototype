from app.models.user import User
from app.schemas.common import WireModel


class LoginRequest(WireModel):
    email: str
    password: str


class SessionUser(WireModel):
    id: str
    name: str
    email: str
    title: str | None
    department: str | None
    role: str
    avatarBg: str | None
    initials: str | None


class UserResponse(WireModel):
    user: SessionUser


def session_user(user: User) -> dict[str, str | None]:
    """The `user` object, in the key order the Node API emitted."""
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "title": user.title,
        "department": user.department,
        "role": user.role,
        "avatarBg": user.avatar_bg,
        "initials": user.initials,
    }
