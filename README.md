# DevDoc Studio

A client-side documentation and release-operations suite: a document
editor with templates, live preview and export (DOCX, Google Docs,
JSON), plus test-case management, release tracking and an admin data
view. React 19 + Vite + Tailwind 4, TypeScript throughout.

By default the app runs entirely in the browser (mock login, all data
in localStorage) — no setup needed beyond `npm install`. An optional
backend in [server/](server/README.md) adds real, server-checked login
and document sharing across users; see that README to enable it.

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
document store, exporters, and (in `server/`) the API's auth and
documents routes against an in-memory Postgres.

**Browser tests** (`npm run test:e2e`, Playwright) drive the real app
in a browser: sign-in, autosave, permissions, the dashboard, storage
warnings, crash recovery, and an automated accessibility scan (axe,
WCAG 2 A/AA) of every screen and dialog. One spec additionally starts
the real API from `server/` to check the frontend and backend
together.

### Supported browsers

The browser suite runs on all three engines below, in CI on every
push and pull request. These are the minimum versions checked; the
app likely works on somewhat older ones, but only these are verified.

| Browser | Engine | Verified via |
|---|---|---|
| Chrome / Edge (current) | Chromium | Playwright `chromium` |
| Firefox (current) | Gecko | Playwright `firefox` |
| Safari (current) | WebKit | Playwright `webkit` |

Mobile browsers are not covered by this suite and have not been
manually verified.

## Docker

`docker compose up` starts Postgres, the optional API (`server/`) and
the web app together, already wired to each other — no extra steps
needed. See [server/README.md](server/README.md) for the API on its
own, and the demo accounts it seeds.

CI builds and publishes both images on every push to `main`, tagged
`latest` and with the commit SHA:
`ghcr.io/karthikbalaji1650/devdoc.prototype-web` and `-api`. Actually
running one somewhere (a server, a cloud platform) is still a separate
step — nothing is deployed automatically yet, only built.

## Project layout

- `src/` — the frontend (this README's project)
- `server/` — the optional backend API ([its own README](server/README.md))
- `e2e/` — Playwright browser tests
- `init.sql` — Postgres schema and seed data for `server/`
