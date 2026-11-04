from datetime import UTC, datetime, timedelta
from typing import Any

from anyio import to_thread

from app.core.errors import ApiError
from app.core.jscompat import js_opt, js_trim
from app.core.security import SESSION_TTL_MS, generate_session_id, verify_password
from app.models.user import User
from app.repositories.base import Repositories
from app.repositories.session_audit import SessionAuditStore


class AuthService:
    def __init__(self, repos: Repositories, audit: SessionAuditStore) -> None:
        self._repos = repos
        self._audit = audit

    async def login(self, body: Any) -> tuple[str, User | None]:
        """Returns (session id, user) or raises ApiError(400/401)."""
        raw_email = js_opt(body, "email")
        raw_password = js_opt(body, "password")
        email = js_trim(raw_email).lower() if isinstance(raw_email, str) else ""
        password = raw_password if isinstance(raw_password, str) else ""
        if not email or not password:
            raise ApiError(400, "Email and password are required.")

        candidate = await self._repos.users.find_login_candidate(email)
        # Same response whether the email is unknown or the password is
        # wrong, so a caller can't use the error to discover accounts.
        if candidate is None or not await to_thread.run_sync(verify_password, password, candidate.password_hash):
            raise ApiError(401, "Invalid email or password.")

        session_id = generate_session_id()
        now = datetime.now(UTC)
        expires_at = now + timedelta(milliseconds=SESSION_TTL_MS)
        await self._repos.sessions.create(session_id, candidate.id, expires_at)
        user = await self._repos.sessions.find_active_user(session_id)
        if user is not None:
            await self._audit.record_login(session_id, user, now, expires_at)
        return session_id, user

    async def logout(self, session_id: str | None) -> None:
        if session_id:
            await self._repos.sessions.delete(session_id)
            await self._audit.record_logout(session_id, datetime.now(UTC))

    async def user_for_session(self, session_id: str) -> User | None:
        return await self._repos.sessions.find_active_user(session_id)
