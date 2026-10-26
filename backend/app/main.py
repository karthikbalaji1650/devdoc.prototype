"""DevDoc Studio API.

Run: uv run uvicorn app.main:app --port 8000 --no-proxy-headers --no-server-header
(`--no-proxy-headers` keeps the login rate limit keyed on the real peer
address, as Express did without `trust proxy`.)
"""

import logging
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from app.core.config import Settings, get_settings
from app.core.errors import register_exception_handlers
from app.core.middleware import ExpressCorsMiddleware, JsonBodyMiddleware
from app.core.rate_limit import login_rate_limiter
from app.core.routing import ExpressPathMiddleware, route_templates
from app.db.pool import create_pool
from app.dependencies import Services
from app.repositories.base import Repositories
from app.repositories.postgres import postgres_repositories
from app.repositories.test_exec import TestExecRepository
from app.routers import ai, auth, documents, health, test_exec
from app.schemas.openapi import install_openapi
from app.services.ai import AiService
from app.services.auth import AuthService
from app.services.documents import DocumentService
from app.services.test_exec import TestExecService

logger = logging.getLogger("devdoc.api")


def build_services(settings: Settings, repos: Repositories, http_client: httpx.AsyncClient) -> Services:
    return Services(
        auth=AuthService(repos),
        documents=DocumentService(repos.documents),
        ai=AiService(settings, http_client),
        test_exec=TestExecService(TestExecRepository()),
        login_limiter=login_rate_limiter(),
        cookie_secure=settings.cookie_secure_enabled,
    )


def create_app(settings: Settings | None = None, repositories: Repositories | None = None) -> FastAPI:
    """`repositories` is for tests and the browser-test harness; without it
    the app connects to Postgres at DATABASE_URL."""
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        pool = None
        repos = repositories
        if repos is None:
            if not settings.database_url:
                print("DATABASE_URL is required.", file=sys.stderr)
                sys.exit(1)
            pool = create_pool(settings.database_url)
            await pool.open(wait=False)
            repos = postgres_repositories(pool)
        async with httpx.AsyncClient() as http_client:
            app.state.services = build_services(settings, repos, http_client)
            try:
                yield
            finally:
                if pool is not None:
                    await pool.close()

    app = FastAPI(title="DevDoc Studio API", version="1.0.0", lifespan=lifespan, redirect_slashes=False)
    routers = [m.router for m in (health, auth, documents, ai, test_exec)]
    for router in routers:
        app.include_router(router)

    register_exception_handlers(app)
    install_openapi(app)

    # Added inner-first: JsonBodyMiddleware ends up outermost, as
    # express.json() ran before cors() in the Node app.
    origins = settings.cors_origin_list
    if origins:
        app.add_middleware(ExpressCorsMiddleware, origins=origins)
    app.add_middleware(ExpressPathMiddleware, templates=route_templates(routers))
    app.add_middleware(JsonBodyMiddleware)
    return app


app = create_app()
