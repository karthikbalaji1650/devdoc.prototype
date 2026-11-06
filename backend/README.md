# devdoc-studio-api

The DevDoc Studio backend, in Python on FastAPI: server-checked login,
shared document storage on Postgres, a key-holding AI proxy, and a mock
remote test-execution service. It replaced the original Node/Express API
with an identical HTTP contract ([docs/api-contract.md](../docs/api-contract.md)),
so the React frontend talks to it unchanged.

The frontend still runs without it: leave `VITE_API_BASE_URL` unset and
DevDoc Studio is the browser-only demo (mock login, localStorage).

## Layout

```
app/
  main.py          app factory: routers, middleware, exception handlers, lifespan
  core/            config, Express-compatible HTTP layer (errors, CORS, body parsing,
                   routing rules, cookies, rate limiting) and JS-semantics helpers
  routers/         thin HTTP layer, one module per route group
  services/        business logic: auth, documents (+ permissions), ai, test_exec
  repositories/    storage behind Protocols: postgres (production), memory (tests)
  models/          domain records (User, DocumentRecord, Job, ...)
  schemas/         Pydantic models describing the wire contract for /openapi.json
  db/              connection pool, node-postgres-compatible parameter coercion
sql/init.sql       Postgres schema + seed data (docker-compose runs it on first start)
tests/             pytest suite; parity/ compares against the old Node API
```

## Endpoints

| Route | Notes |
|---|---|
| `GET /api/health` | `{"ok": true}` |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | bcrypt check, random session id in an httpOnly `devdoc_sid` cookie, stored in `sessions` so logout revokes it at once. Login is rate-limited: 10 failures per IP per 15 min. |
| `GET/PUT/DELETE /api/documents[/:id]`, `DELETE /api/documents/:id/purge` | Each route re-checks the frontend's edit/visibility rules server-side. DELETE is a soft delete; purge removes the row. |
| `GET /api/ai/providers`, `POST /api/ai/rephrase`, `POST /api/ai/generate-test-cases` | Proxies Gemini/OpenAI with server-side keys. |
| `GET/POST /api/test-servers`, `PUT/DELETE /api/test-servers/:id`, `POST /api/test-servers/:id/check` | Remote test servers (DDS-SRS-019): endpoint URL, auth (none / API key / Basic / OAuth2 client credentials) and payload parameters. Admins manage them. Credentials are encrypted at rest with AES-256-GCM under `SECRETS_KEY` (DDS-SRS-075) and never returned. `check` authenticates and sends GET to the endpoint, reporting only status and timing. |
| `POST /api/test-exec/scripts`, `POST /api/test-exec/runs`, `GET /api/test-exec/runs/:jobId` | With `serverId`, the run goes to that registered test server using the [Test PC API](../docs/test-pc-api.md) (DDS-SRS-020). A background worker in the API polls it on the server's interval (5/10/30 s, DDS-SRS-021) and stores phase and progress (total, completed, passed, failed, %); status reads return that, never calling the Test PC, and the finished outcome is also written into the linked test run (`runId`). Status is `running`, `completed` (with results) or `failed` (with `error`). `GET /api/test-exec/runs/:jobId/events` pushes the same status as server-sent events, at once and on every change, until the run finishes (DDS-SRS-022); changes are announced over Redis pub/sub, so any API instance can serve the stream. Without it, a **mock** Test PC with in-memory state and randomized results. |

Interactive docs: `/docs`; schema: `/openapi.json`.

## Running it

With docker-compose, run `docker compose up` from the repo root. It starts Postgres, Redis, this API on port 8000, and the web app, already wired together.

Standalone, for development (needs [uv](https://docs.astral.sh/uv/)):

```
cp .env.example .env      # DATABASE_URL, REDIS_URL, CORS_ORIGINS, optional AI keys
uv sync
uv run uvicorn app.main:app --reload --port 8000 --no-proxy-headers --no-server-header
```

This needs a Postgres reachable at `DATABASE_URL`, seeded by the repo's
`sql/init.sql` (docker-compose does this on first start), and a Redis at
`REDIS_URL` for test management data (`docker compose up redis`). Tests
use an in-process fake Redis, so they need neither.

## Demo accounts

These are seeded by `sql/init.sql`. All three use the password `devdoc-demo` (local/demo use only).

| Email | Role |
|---|---|
| mani.thangavel@sanmina.com | admin |
| vaishnavi.aasaithambi@sanmina.com | release-manager |
| sahith.pattu@sanmina.com | firmware-lead |

## Tests

```
uv run pytest                     # unit + contract tests, in-memory repositories, no database
uv run ruff check . && uv run ruff format --check .
TEST_DATABASE_URL=postgresql://...  uv run pytest tests/test_postgres.py   # real SQL; wipes that database
```

`tests/e2e_server.py` is the API the Playwright specs `e2e/backend-login.spec.ts`
and `e2e/remote-test-execution.spec.ts` start. It runs on in-memory repositories,
so no database is needed.
