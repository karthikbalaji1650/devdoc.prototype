# devdoc-studio-api

The minimal backend slice for DevDoc Studio: real, server-checked login
and shared document storage on Postgres, addressing SRS items #1
(server-side permission enforcement) and #13 (real authentication).

The frontend runs perfectly well without this — it's an *addition*, not
a requirement. Without it, DevDoc Studio still works exactly as it did
before: mock login, all data in the browser's localStorage. Setting
`VITE_API_BASE_URL` (see the repo's `.env.example`) switches the login
screen to check the password against this API instead.

## What's here

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` —
  bcrypt password check, random session id in an httpOnly cookie,
  stored in a `sessions` table so logout (or revoking a session)
  invalidates it immediately, unlike a JWT.
- `GET/PUT/DELETE /api/documents[/:id]` — every route re-checks the
  same edit/visibility rules the frontend already enforces client-side
  (`src/services/permissions.ts` / `src/permissions.ts` here), so they
  can no longer be bypassed from DevTools. Delete is a soft delete
  (`deleted_at`), matching the app's own Doc Bin convention.

**Not yet wired up:** the frontend only calls the `auth` endpoints so
far. Documents still live in the browser (autosave, version history,
Doc Bin, etc. are all unchanged). Pointing the document store at this
API — so two users actually share documents — is the next step.

## Running it

Via docker-compose (from the repo root): `docker compose up` starts
Postgres, this API (port 4000) and the web app together, already wired
to each other.

Standalone, for development:

```
cp .env.example .env      # DATABASE_URL, PORT, CORS_ORIGINS
npm install
npm run dev                # tsx --watch, listens on :4000
```

Needs a real Postgres reachable at `DATABASE_URL`, seeded by the
repo's `init.sql` (docker-compose does this on first start).

## Demo accounts

Seeded by `init.sql`, kept in sync with `src/types/auth.ts`'s
`DEMO_USERS`. Password for all three (local/demo use only):
`devdoc-demo`.

| Email | Role |
|---|---|
| mani.thangavel@sanmina.com | admin |
| vaishnavi.aasaithambi@sanmina.com | release-manager |
| judia.lumina@sanmina.com | firmware-lead |

## Tests

`npm test` runs the full suite (auth + documents, 21 tests) against an
in-memory Postgres (`pg-mem`) seeded with the real schema from
`../init.sql` — no Docker or a real database needed, in CI or locally.
