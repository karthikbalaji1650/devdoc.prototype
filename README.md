# DevDoc Studio

A client-side documentation and release-operations suite: a document
editor with templates, live preview and export (DOCX, Google Docs,
JSON), plus test-case management, release tracking and an admin data
view. React 19 + Vite + Tailwind 4, TypeScript throughout.

The repo has two halves:

- **[frontend/](frontend/)**: the React app, which needs Node only for its tooling.
- **[backend/](backend/README.md)**: the Python FastAPI API, which adds real server-checked login, shared documents, an AI key proxy and remote test execution.

By default the frontend runs entirely in the browser (mock login, all data in localStorage); point it at the backend to use the real API.

## Project layout

```
frontend/            React 19 + Vite + Tailwind 4 + TypeScript
  src/
    components/      screens and UI
    services/        API clients, stores, business logic
    types/           shared TypeScript types (data models)
    hooks/ templates/ exporters/
  e2e/               Playwright browser tests
  Dockerfile         builds the app, served by nginx (nginx.conf.template)
backend/             Python 3.12 + FastAPI, managed with uv
  app/
    routers/         HTTP layer, one module per route group
    services/        business logic
    repositories/    database access (Postgres, plus in-memory for tests)
    models/          domain records
    schemas/         request/response models (the API contract)
    core/ db/        config, HTTP plumbing, connection pool
  sql/init.sql       Postgres schema + seed data
  tests/             pytest
sandbox/             VS Code + Robot Framework container (the Coder screen)
docs/                API contract, migration report, reference documents
docker-compose.yml   the full stack
```

## Quick start

**Everything in Docker** (Postgres, API, web app, sandbox):

```
docker compose up --build
```

The app is at **https://localhost:8443** (http://localhost:5173 redirects there), with the API behind it at `/api`. The API's interactive docs are not proxied: open http://localhost:8000/docs on the machine running it. Demo login: `mani.thangavel@sanmina.com` / `devdoc-demo`.

Everything a browser reaches is HTTPS with TLS 1.3 only (DDS-SRS-074). Without a certificate in `certs/` the web app makes a self-signed one, so the browser warns once; `scripts/make-dev-cert.sh` makes one your machine trusts (with [mkcert](https://github.com/FiloSottile/mkcert)), and for a real deployment put your own `tls.crt` and `tls.key` in `certs/`. The plain ports (Postgres, Redis, the API, code-server) are bound to 127.0.0.1 only.

**Local development with hot reload:**

```
docker compose up -d postgres-db                  # or any Postgres seeded with backend/sql/init.sql

cd backend                                        # terminal 1
cp .env.example .env && uv sync
uv run uvicorn app.main:app --reload --port 8000 --no-proxy-headers --no-server-header

cd frontend                                       # terminal 2
echo "VITE_API_BASE_URL=http://localhost:8000" >> .env.local
npm install && npm run dev                        # http://localhost:5173
```

Leave out `VITE_API_BASE_URL` for the browser-only demo. `frontend/.env.example` covers that and Google Docs export.

## Frontend scripts

Run these from `frontend/`:

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check (`tsc -b`) then production build |
| `npm run lint` | oxlint, warnings fail the build |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright) — see below |

## Testing

**Unit tests** (`npm test` in `frontend/`) cover the services and business logic:
permissions, autosave, storage-quota handling, version history, the
document store and exporters. The backend has its own pytest suite
(`cd backend && uv run pytest`) covering every API route, plus tests
that run its SQL against a real Postgres.

**Browser tests** (`npm run test:e2e`, Playwright) drive the real app
in a browser: sign-in, autosave, permissions, the dashboard, storage
warnings, crash recovery, and an automated accessibility scan (axe,
WCAG 2 A/AA) of every screen and dialog. Two specs additionally start
the real API from `backend/` (needs [uv](https://docs.astral.sh/uv/)
and `uv sync` in `backend/`) to check the frontend and backend together.

### Supported browsers

The browser suite runs on the engines below, in CI on every push and
pull request, pinned to the versions Playwright 1.63 itself bundles
and tests against - not just "whatever is current when CI happens to
run". The app likely works on somewhat older versions too, but these
are the ones actually verified.

| Browser | Engine, minimum tested version | Verified via |
|---|---|---|
| Chrome / Edge | Chromium 153 | Playwright `chromium` |
| Firefox | Gecko 155 | Playwright `firefox` |
| Safari | WebKit 26.6 | Playwright `webkit` |

**Mobile:** this is primarily a desktop engineering tool (dense
editors, tables), and making every screen fully responsive is out of
scope here. There's a small smoke check (`e2e/mobile-smoke.spec.ts`,
on Mobile Chrome and Mobile Safari emulation) covering the one thing
that mattered in practice: the navigation sidebar now defaults to its
already-existing collapsed (icon-only) mode below a 768px-wide
viewport, instead of eating most of the screen the way it used to.
Beyond that, individual screens have not been audited for mobile
layout and may not work well.

## Docker

`docker compose up` starts Postgres, the optional API (`backend/`, on
port 8000 for this machine) and the web app (HTTPS on 8443, proxying the
API at `/api`, the code editor at `/vscode/` and its file bridge at
`/bridge/`) together, already wired to each other — no extra steps needed.
Set `HTTPS_PORT` to serve on another port (e.g. 443), and `TLS_HOSTNAME`
for the self-signed certificate's name. See [backend/README.md](backend/README.md) for the
API on its own, and the demo accounts it seeds.

CI builds and publishes both images on every push to `main`, tagged
`latest` and with the commit SHA:
`ghcr.io/karthikbalaji1650/devdoc.prototype-web` and `-api`. Actually
running one somewhere (a server, a cloud platform) is still a separate
step — nothing is deployed automatically yet, only built.

## Security

[SECURITY.md](SECURITY.md) has the latest internal security review:
what was checked, what was fixed, and what's an accepted or open gap.

