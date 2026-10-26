from dataclasses import dataclass


@dataclass(frozen=True)
class User:
    """A row of `users`, minus the password hash."""

    id: str
    name: str
    email: str
    title: str | None
    department: str | None
    role: str
    avatar_bg: str | None
    initials: str | None


@dataclass(frozen=True)
class LoginCandidate:
    id: str
    password_hash: str
