from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, Request

from app.core.cookies import session_id_from
from app.core.errors import NotSignedInError
from app.core.middleware import BODY_STATE_KEY
from app.core.rate_limit import RateLimiter
from app.core.security import SESSION_COOKIE
from app.models.user import User
from app.repositories.session_audit import SessionAuditStore
from app.services.admin import AdminService
from app.services.ai import AiService
from app.services.auth import AuthService
from app.services.collections import CollectionService
from app.services.documents import DocumentService
from app.services.test_exec import TestExecService
from app.services.test_management import TestManagementService


@dataclass
class Services:
    auth: AuthService
    session_audit: SessionAuditStore
    collections: CollectionService
    admin: AdminService
    documents: DocumentService
    ai: AiService
    test_exec: TestExecService
    test_management: TestManagementService
    login_limiter: RateLimiter
    cookie_secure: bool


def get_services(request: Request) -> Services:
    return request.app.state.services


def json_body(request: Request) -> Any:
    """`req.body`: the parsed JSON body, or {} when there was none."""
    return request.scope.get("state", {}).get(BODY_STATE_KEY, {})


def request_session_id(request: Request) -> str | None:
    # Node joined repeated Cookie headers with "; " before parsing.
    return session_id_from("; ".join(request.headers.getlist("cookie")), SESSION_COOKIE)


async def current_user_or_none(request: Request) -> User | None:
    state = request.scope.setdefault("state", {})  # cached for the request
    if "user" not in state:
        session_id = request_session_id(request)
        state["user"] = await get_services(request).auth.user_for_session(session_id) if session_id else None
    return state["user"]


async def require_user(request: Request) -> User:
    user = await current_user_or_none(request)
    if user is None:
        raise NotSignedInError()
    return user


ServicesDep = Annotated[Services, Depends(get_services)]
CurrentUser = Annotated[User, Depends(require_user)]
