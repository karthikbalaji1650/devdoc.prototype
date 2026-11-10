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
from app.services.ci import CiService
from app.services.collections import CollectionService
from app.services.documents import DocumentService
from app.services.releases import ReleaseService
from app.services.remote_runs import RemoteRunService
from app.services.repos import RepoService
from app.services.schedules import ScheduleService
from app.services.sso import SsoService
from app.services.test_exec import TestExecService
from app.services.test_management import TestManagementService
from app.services.test_servers import TestServerService
from app.services.tokens import TokenService
from app.services.trackers import TrackerService


@dataclass
class Services:
    auth: AuthService
    session_audit: SessionAuditStore
    collections: CollectionService
    admin: AdminService
    releases: ReleaseService
    documents: DocumentService
    ai: AiService
    test_exec: TestExecService
    test_management: TestManagementService
    test_servers: TestServerService
    remote_runs: RemoteRunService
    schedules: ScheduleService
    ci: CiService
    trackers: TrackerService
    repos: RepoService
    tokens: TokenService
    sso: SsoService
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


def bearer_token(request: Request) -> str | None:
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


async def current_user_or_none(request: Request) -> User | None:
    """The session cookie's user, or - without a cookie - the user of a JWT
    access token (DDS-SRS-076) whose session is still active."""
    state = request.scope.setdefault("state", {})  # cached for the request
    if "user" not in state:
        services = get_services(request)
        session_id = request_session_id(request)
        user = await services.auth.user_for_session(session_id) if session_id else None
        token = bearer_token(request) if session_id is None else None
        if token and not token.startswith("ddsci_"):  # CI tokens are for /api/ci only
            found = services.tokens.session_of(token)
            if found is not None:
                candidate = await services.auth.user_for_session(found[0])
                user = candidate if candidate is not None and candidate.id == found[1] else None
        state["user"] = user
    return state["user"]


async def require_user(request: Request) -> User:
    user = await current_user_or_none(request)
    if user is None:
        raise NotSignedInError()
    return user


ServicesDep = Annotated[Services, Depends(get_services)]
CurrentUser = Annotated[User, Depends(require_user)]
