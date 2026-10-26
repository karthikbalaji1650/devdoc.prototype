# Backend migration report: Node/Express → Python/FastAPI

**Date:** 2026-10-26 · **Branch:** `dev`
**Last commit with the Node backend:** `0e0b2fb`. Check it out to re-run the parity suite.

## What moved

All 13 endpoints in [api-contract.md](api-contract.md) are implemented in `backend/`, across 4 route groups plus health:

| Group | Routes |
|---|---|
| health | `GET /api/health` |
| auth | `POST /login`, `POST /logout`, `GET /me` |
| documents | `GET /`, `GET /:id`, `PUT /:id`, `DELETE /:id`, `DELETE /:id/purge` |
| ai | `GET /providers`, `POST /rephrase`, `POST /generate-test-cases` |
| test-exec | `POST /scripts`, `POST /runs`, `GET /runs/:jobId` |

The structure is routers (thin HTTP), services (logic and permissions), repositories (Protocol-based: Postgres, plus an in-memory set for tests), models, schemas (the wire contract for `/openapi.json`), `core/` (config and the Express-compatible HTTP layer) and `db/`.

**Removed:**
- `server/`, including the Node API, its tests and its Dockerfile.
- The unused `express`, `express-rate-limit` and `@types/express` from the root `package.json`.

Node remains only as frontend tooling (Vite, Vitest, Playwright, oxlint).

**Repointed at `backend/`:**
- `docker-compose.yml` (API on port 8000)
- `.env.example`
- the CI workflow: `backend-tests` replaces `server-tests`, the browser job installs the backend with uv, and the API image builds from `backend/`
- the two Playwright specs that need a real API
- README, plus a note in SECURITY.md

## Verification

| Check | Result |
|---|---|
| `uv run pytest`: every Node test case ported, plus contract and JS-semantics tests | 123 passed |
| `tests/test_postgres.py`: the real SQL against Postgres 16, seeded from `init.sql` | 4 passed |
| `tests/parity/`: identical request sequences against Node (`NODE_ENV=production`) and FastAPI, each on its own `init.sql` database, comparing status, headers and body | 9 suites, 80+ request pairs, all passed |
| Playwright, Chromium: `backend-login.spec.ts` and `remote-test-execution.spec.ts` against FastAPI (sign-in error message, login/logout revocation, a document shared across two browsers, the Test Management "Run Test" remote run) | 4 passed |
| Frontend `npm run lint`, `npm test` (208), `npm run build` | passed |
| Backend Docker image: builds, runs as uid 1000, healthcheck healthy, logs in against Postgres | passed |
| `docker compose config` | valid |

**Not run:**
- The full Playwright suite on all engines. Port 5173 was held by the running docker-compose web app, so Playwright would have tested that container instead of this checkout.
- A full `docker compose up --build`. The individual images were built instead.

**Parity normalizations.** These fields are volatile by design:
- session id and `Expires` date in `Set-Cookie`
- `updatedAt`, `jobId`, `executedAt`
- the mock's random per-test `status`, `elapsedTimeMs`, `failureMessage` (whose presence is itself random), and the derived `passed`/`failed` counts
- `RateLimit-Reset` and `Retry-After`, compared within ±1 s
- `Content-Length` of JSON bodies, which only differs through the fields above

Volatile headers are not compared: `Date`, `ETag`, `X-Powered-By`, `Connection`, `Keep-Alive`.

## Contract deviations (deliberate)

1. **A database error is a 500 instead of a dead process.** In Express 4 an async route that rejected (for example a PUT missing `docNumber`/`title`, or an invalid `date`) was an unhandled promise rejection, and Node 15+ terminates on those. One bad request took the API down for everyone. FastAPI returns Express's own `500 Internal Server Error` page. The parity suite asserts this divergence explicitly.
2. **No `X-Powered-By: Express`, no `ETag`, no conditional `304`.** Express added these automatically. No client reads them; the frontend's `fetch` treated a 304 as the cached 200 anyway.
3. **`/openapi.json` and `/docs` are new paths.** In Node they were 404s. They're needed for the frontend's planned OpenAPI type generation.
4. **Path IDs containing an encoded slash (`%2F`) don't match a route.** Express decoded `:id` after matching, so `a%2Fb` was the id `a/b`. The ASGI server decodes before routing. The frontend's ids (`doc-…`, `job-…`) never contain `/`.
5. **`OPTIONS` without CORS configured** was answered by Express's automatic `200 Allow: …` (or a 401 under guarded prefixes). It now gets the regular 404/401. With `CORS_ORIGINS` set, as in every real setup, preflights match exactly.
6. **Malformed-JSON messages from an AI provider.** The 502 status and shape match. The common V8 `JSON.parse` messages (`Unexpected token …`, `Unexpected end of JSON input`) are reproduced, but rarer V8 wordings can differ.
7. **Number spelling edge cases.** Stored documents round-trip numbers the way `JSON.parse`/`JSON.stringify` did: `1.0`→`1`, `1e20` printed in full, ints above 2^53 lose precision as in JS, and integer-like keys sort first. Not reproduced: non-integral doubles in `[1e-7, 1e-4)` render `1e-05`-style inside JSON responses, where Node wrote `0.00001`. Values stored in columns use the JS spelling.
8. **Session lookup timing.** Node looked up the session on every request (it was middleware). FastAPI looks it up only where a route needs it. There's no observable difference except less database load.
9. **Port 8000 instead of 4000**, per CLAUDE.md. The compose defaults for `VITE_API_BASE_URL` and `BACKEND_ORIGIN` moved with it. Deployments that set these explicitly need the new port.

## Node behavior replicated as-is (bugs or quirks, not fixed)

1. **Body-parse errors carry no CORS headers.** `express.json()` ran before `cors()`, so a browser can't read the 400/413 for a malformed or oversized body.
2. **`Access-Control-Allow-Credentials: true` is sent to every origin**, allowed or not, as the `cors` package did. It's harmless without a matching `Allow-Origin`, but noisy.
3. **Array `metadata` in a PUT is accepted** and spread into `{"0": …, "1": …}` (`typeof [] === 'object'`). The upsert then fails on the null NOT NULL columns, so it becomes the 500 in deviation 1.
4. **`status: []` or `{}` counts as present and is rejected as invalid**, while `""`, `0` and `false` skip validation. These are JS truthiness rules.
5. **The test-exec mock's id extraction is greedy about underscores** (`TC-001_Drift_Check` gives `TC-001-Drift`), kept to match the client's own parser.
6. **Admin PUT with `author: ""`** falls back to the admin's own name (`metadata.author || user.name`), so an admin edit with a blanked author takes the document over.
7. **A provider error body of `null`** surfaces as `502 Cannot read properties of null (reading 'error')`.
8. **Expired sessions are never cleaned up.** They're filtered at lookup, but the rows accumulate.
9. **The login limiter is per process and in memory.** It resets on restart and isn't shared across replicas.

## Open questions

1. **Background jobs:** none were needed. The only deferred work is the test-exec mock's 300 ms completion timer, which ran on `setTimeout` in Node and runs on `loop.call_later` now, in memory, as before. When a real Test PC integration arrives, CLAUDE.md asks for a queue decision (arq, Celery or RQ). That hasn't been decided.
2. **Real Robot Framework execution:** the API still serves the mock. Running `robot`/`pabot` via `asyncio.create_subprocess_exec` and parsing `output.xml` would replace `TestExecService` behind the same routes, but it needs the Test PC/hardware details first.
3. **Frontend comments still say `server/`** in `src/` (`backendAuthService.ts`, `aiService.ts`, `documentsStoreService.ts`, `remoteExecutionService.ts`, `App.tsx`, `LoginPage.tsx`). They're left untouched under the no-frontend-changes rule. Approve a comment-only change?
4. **Vite proxy:** the frontend calls the API cross-origin through `VITE_API_BASE_URL` (CORS with credentials), not through relative `/api` paths, so no Vite proxy entry was needed. Switching to the proxy model in CLAUDE.md would mean frontend code changes.
5. **`npm run gen:api`** (OpenAPI → TS types) doesn't exist in `package.json` yet. `/openapi.json` is ready for it.
6. **Single-image Docker:** CLAUDE.md mentions one multi-stage image where Node builds the frontend and Python runs uvicorn. The repo keeps its existing split (nginx web image with CSP and the `/vscode/` proxy, plus a separate API image), because merging them changes how the frontend is served.
7. **CLAUDE.md is now out of date.** It still describes the migration as in progress with Node on port 3000; Node actually ran on 4000.
