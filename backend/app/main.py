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
from redis.asyncio import Redis

from app.core.config import Settings, get_settings
from app.core.errors import register_exception_handlers
from app.core.middleware import ExpressCorsMiddleware, JsonBodyMiddleware
from app.core.rate_limit import login_rate_limiter
from app.core.routing import ExpressPathMiddleware, route_templates
from app.core.secrets import SecretBox
from app.db.pool import create_pool
from app.db.redis import create_redis
from app.dependencies import Services
from app.repositories.base import Repositories
from app.repositories.collections import CollectionStore
from app.repositories.document_cache import CachedDocumentRepository
from app.repositories.document_history import DocumentHistoryStore
from app.repositories.postgres import postgres_repositories
from app.repositories.releases import ReleaseStore
from app.repositories.session_audit import SessionAuditStore
from app.repositories.test_exec import RemoteJobStore, TestExecRepository
from app.repositories.test_management import TestManagementStore
from app.repositories.test_servers import TestServerStore
from app.routers import (
    admin,
    ai,
    audit,
    auth,
    collections,
    documents,
    health,
    releases,
    test_exec,
    test_management,
    test_servers,
)
from app.schemas.openapi import install_openapi
from app.services.admin import AdminService
from app.services.ai import AiService
from app.services.auth import AuthService
from app.services.collections import CollectionService
from app.services.documents import DocumentService
from app.services.releases import ReleaseService
from app.services.test_exec import TestExecService
from app.services.test_management import TestManagementService
from app.services.test_servers import TestServerService

logger = logging.getLogger("devdoc.api")


def build_services(settings: Settings, repos: Repositories, http_client: httpx.AsyncClient, redis: Redis) -> Services:
    session_audit = SessionAuditStore(redis)
    test_store = TestManagementStore(redis)
    documents = CachedDocumentRepository(repos.documents, redis)
    test_servers = TestServerService(TestServerStore(redis), SecretBox(settings.secrets_key), http_client)
    return Services(
        auth=AuthService(repos, session_audit),
        session_audit=session_audit,
        collections=CollectionService(CollectionStore(redis)),
        documents=DocumentService(documents, DocumentHistoryStore(redis)),
        admin=AdminService(documents, redis),
        ai=AiService(settings, http_client),
        test_management=TestManagementService(test_store),
        test_servers=test_servers,
        test_exec=TestExecService(TestExecRepository(), remote_jobs=RemoteJobStore(redis), servers=test_servers),
        releases=ReleaseService(ReleaseStore(redis), test_store),
        login_limiter=login_rate_limiter(),
        cookie_secure=settings.cookie_secure_enabled,
    )


def create_app(
    settings: Settings | None = None, repositories: Repositories | None = None, redis: Redis | None = None
) -> FastAPI:
    """`repositories` and `redis` are for tests and the browser-test harness;
    without them the app connects to Postgres at DATABASE_URL and Redis at
    REDIS_URL."""
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
        redis_client = redis
        owns_redis = redis_client is None
        if redis_client is None:
            if not settings.redis_url:
                print("REDIS_URL is required.", file=sys.stderr)
                sys.exit(1)
            redis_client = create_redis(settings.redis_url)
        async with httpx.AsyncClient() as http_client:
            app.state.services = build_services(settings, repos, http_client, redis_client)
            try:
                yield
            finally:
                if owns_redis:
                    await redis_client.aclose()
                if pool is not None:
                    await pool.close()

    app = FastAPI(title="DevDoc Studio API", version="1.0.0", lifespan=lifespan, redirect_slashes=False)
    routers = [
        m.router
        for m in (
            health,
            auth,
            documents,
            ai,
            test_exec,
            test_management,
            test_servers,
            audit,
            collections,
            admin,
            releases,
        )
    ]
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
