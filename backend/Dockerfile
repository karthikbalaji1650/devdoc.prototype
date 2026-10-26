# ==========================================
# Multi-stage Dockerfile for the DevDoc Studio API (FastAPI)
# ==========================================

# Stage 1: resolve and install dependencies from the lockfile with uv
FROM python:3.12-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never

COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project

# Stage 2: runtime image - the virtualenv and the app, no uv or build tools
FROM python:3.12-slim AS runner
WORKDIR /app

# Non-root (uid 1000), as the Node image was: this is the container
# holding credentials and the database connection.
RUN useradd --uid 1000 --no-create-home --shell /usr/sbin/nologin app

COPY --from=builder /app/.venv /app/.venv
COPY app ./app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 PORT=8000

USER app
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://localhost:%s/api/health' % os.environ.get('PORT', '8000'), timeout=4)"

# --no-proxy-headers: key the login rate limit on the real peer address
# (Express ran without `trust proxy`). --no-server-header: Node sent none.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port \"${PORT:-8000}\" --no-proxy-headers --no-server-header"]
