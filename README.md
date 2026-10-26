# DevDoc Studio

A client-side documentation and release-operations suite: a document
editor with templates, live preview and export (DOCX, Google Docs,
JSON), plus test-case management, release tracking and an admin data
view. React 19 + Vite + Tailwind 4, TypeScript throughout.

By default the app runs entirely in the browser (mock login, all data
in localStorage) — no setup needed beyond `npm install`. An optional
Python backend (FastAPI) in [backend/](backend/README.md) adds real,
server-checked login and document sharing across users; see that README
to enable it. Node is only needed for the frontend's tooling.

## Quick start

```
npm install
npm run dev          # http://localhost:5173
```

Copy `.env.example` to `.env.local` if you want Google Docs export or
the optional backend (see the comments in that file for both).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check (`tsc -b`) then production build |
| `npm run lint` | oxlint, warnings fail the build |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright) — see below |

## Testing

**Unit tests** (`npm test`) cover the services and business logic:
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
port 8000) and the web app together, already wired to each other — no
extra steps needed. See [backend/README.md](backend/README.md) for the
API on its own, and the demo accounts it seeds.

CI builds and publishes both images on every push to `main`, tagged
`latest` and with the commit SHA:
`ghcr.io/karthikbalaji1650/devdoc.prototype-web` and `-api`. Actually
running one somewhere (a server, a cloud platform) is still a separate
step — nothing is deployed automatically yet, only built.

## Security

[SECURITY.md](SECURITY.md) has the latest internal security review:
what was checked, what was fixed, and what's an accepted or open gap.

## Project layout

- `src/` — the frontend (this README's project)
- `backend/` — the optional backend API, Python/FastAPI ([its own README](backend/README.md))
- `docs/api-contract.md` — the API's HTTP contract
- `e2e/` — Playwright browser tests
- `init.sql` — Postgres schema and seed data for `backend/`
