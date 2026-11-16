# DevDoc Studio API contract

The frozen HTTP contract of the DevDoc Studio backend. It was written down
from the original Node/Express API and verified against it request by request
(a parity suite, removed after the cutover: see `migration-report.md`). The
FastAPI backend must keep every point here; `backend/tests/test_express_contract.py`
and the route tests guard it now.

## Conventions

- **Base path** `/api`. The API is served on its own origin (port 8000 by
  default) and the frontend calls it with `credentials: 'include'`.
- **JSON responses** are `Content-Type: application/json; charset=utf-8`,
  compact `JSON.stringify` output: no spaces, integer-valued numbers without a
  fraction (`1`, never `1.0`), integer-like object keys first in ascending
  order.
- **Handled errors** are `{"error": "<message>"}` with the status listed per route.
- **Unmatched route** (unknown path, or a known path with the wrong method): `404`,
  `text/html; charset=utf-8`, Express's error document
  `<!DOCTYPE html>…<pre>Cannot GET /the/path</pre>…`, plus
  `Content-Security-Policy: default-src 'none'` and `X-Content-Type-Options: nosniff`.
  Under `/api/documents`, `/api/ai` and `/api/test-exec`, a request without a
  valid session gets the `401` below first.
- **Route matching** is case-insensitive and allows one trailing slash
  (`/API/Health/` matches). Path parameter values keep their case. GET routes
  also answer HEAD.
- **Request bodies** are parsed only when `Content-Type: application/json`:
  - Any other body counts as `{}`.
  - Only a top-level object or array is accepted.
  - The limit is 5 MB; gzip and deflate bodies are inflated.

  Body errors come back as the HTML error document *without* CORS headers:
  `400 Bad Request` (malformed or non-object JSON), `413 Payload Too Large`,
  `415 Unsupported Media Type` (a non-UTF charset or an unknown encoding).
- **Unexpected server error**: `500`, HTML document `Internal Server Error`.
- **Dates**: ISO 8601 UTC with milliseconds, e.g. `2026-10-26T07:22:31.544Z`.
- **IDs** are strings everywhere.

## Authentication

- **Cookie:** `devdoc_sid`, holding 64 hex characters.
  - Set as `devdoc_sid=<id>; Max-Age=43200; Path=/; Expires=<GMT date>; HttpOnly; SameSite=Lax`.
  - `; Secure` is inserted before `SameSite` only when `COOKIE_SECURE` is exactly `true`.
  - Sessions last 12 hours and are stored server-side, so logout revokes them immediately.
- **Cookie parsing:** when a cookie repeats, the first one wins. A `j:`-prefixed value is read as JSON (cookie-parser convention).
- **Without a valid session**, protected routes return `401 {"error": "Not signed in."}`.

### User object

```json
{"id": "usr-01", "name": "…", "email": "…", "designation": "…|null", "department": "…|null",
 "role": "admin|release-manager|firmware-lead|…", "avatarBg": "…|null", "initials": "…|null"}
```

### People search

`GET /api/users?q=<text>` (any signed-in user) feeds the user pickers, for example choosing who signs off a release.

- Returns `200 {"users": [{"id", "name", "designation": "…|null", "department": "…|null"}]}`: up to 20 people whose name, designation or department contains `q`, ignoring case and surrounding spaces, ordered by name. `%` and `_` in `q` are plain text. An empty or missing `q` returns the first 20 by name.
- Never includes email, role or any credential. Only the first 100 characters of `q` are used.

### Session audit log

`GET /api/audit/sessions` (any signed-in user; DDS-SRS-011) lists sign-ins, newest first, at most 200: everyone's for an admin, only the caller's own for anyone else.

- Returns `200 {"sessions": [{"id", "userId", "userName", "role", "loginTime", "logoutTime": "…|null", "expiresAt", "status": "active|signed-out|expired"}]}`. Times are ISO 8601 UTC. The session id itself is never included.
- `401` without a session.

## CORS

When `CORS_ORIGINS` is set (comma-separated), every response carries
`Vary: Origin` and `Access-Control-Allow-Credentials: true`. It also carries
`Access-Control-Allow-Origin: <origin>` when the request's Origin is listed.

Every `OPTIONS` request is answered `204` with `Content-Length: 0` and:
- `Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE`
- the request's `Access-Control-Request-Headers` echoed back as `Access-Control-Allow-Headers`
- `Vary: Origin, Access-Control-Request-Headers`

Requests are never rejected for their origin.

## Routes

### `GET /api/health`
`200 {"ok": true}`, with no auth.

### `POST /api/auth/login`
Body `{"email": string, "password": string}`. The email is trimmed and matched case-insensitively.

| Status | Body |
|---|---|
| 200 | `{"user": User}` + `Set-Cookie` |
| 400 | `Email and password are required.` (either one missing, empty, or not a string) |
| 401 | `Invalid email or password.` (same message for an unknown email) |
| 429 | `Too many sign-in attempts. Try again in a few minutes.` |

**Rate limit:** 10 attempts per client IP per 15-minute window, starting at the client's first attempt. An IPv6 client is keyed by its /56.
- A response below 400 refunds its attempt.
- Every response carries `RateLimit-Policy: 10;w=900`, `RateLimit-Limit: 10`, `RateLimit-Remaining`, and `RateLimit-Reset` (seconds).
- A 429 also carries `Retry-After`.
- A body-parse error is answered before the limiter, so it is not counted.

### `POST /api/auth/logout`
`204`, no body, `Set-Cookie: devdoc_sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`.
The session is deleted if there is one; the request succeeds either way.

### `GET /api/auth/me`
`200 {"user": User}`, or `401 Not signed in.`

### Documents (session required)

A document is `{"metadata": {...}, "sections": [...]}`. The metadata
includes `id, title, subtitle?, docNumber, author, department?, date, version,
classification, status, templateType, logoUrl?, logoPosition?, tags?`.

**Visibility:** admins see every document; everyone else sees only `DRAFT` and `IN_REVIEW`.
**Ownership:** each document has an owner, a user id (`ownerId`), stored separately from the `author` name shown on it.
- Admins can edit and delete any document.
- Everyone else can edit and delete only documents whose `ownerId` is their own user id.
- A document with no owner (`ownerId` is `null`, because its author name matched no single user) can be changed by admins only, until an owner is assigned.

**Who becomes the owner** is decided on save, not by the name on the document:
- **Non-admin:** the saver becomes the owner, and `author` is always the saver's own name. A non-admin cannot hand a document to someone else.
- **Admin:** the author is `metadata.author` when it is non-blank, otherwise the admin's own name. Then:
  - If the name matches the admin's own name (ignoring case and surrounding spaces), the admin is the owner.
  - Otherwise the name is looked up among users, and it must match exactly one: no match is `400 There is no user named "<name>". Choose an existing user as the author.`, and several matches are `409 More than one user is named "<name>", so the author cannot be chosen by name.` The matched user becomes the owner.
  - If the author name is unchanged from the stored document, the current owner is kept.
- A non-text author from an admin is `400 author must be text.`

Changing the author name therefore changes ownership: an admin who names another user as author hands the document to that user.

| Route | Success | Errors |
|---|---|---|
| `GET /api/documents` | `200 {"documents": [Document + "ownerId" + "updatedAt"]}`, visible and not deleted, most recently updated first | — |
| `GET /api/documents/stats` | `200 {"total": n, "byStatus": {"DRAFT": n, "IN_REVIEW": n, "APPROVED": n, "PUBLISHED": n}}`: every non-deleted document, the same for everyone signed in (numbers only; the dashboard cards, DDS-SRS-005) | — |
| `GET /api/documents/:id` | `200 {"document": Document + "ownerId" + "updatedAt"}` | `404 Document not found.` (missing, deleted or invisible) |
| `PUT /api/documents/:id` | `200 {"document": Document}` (see below; no `updatedAt`) | `400 Body must be a document with metadata and sections.` · `400 status must be one of DRAFT, IN_REVIEW, APPROVED, PUBLISHED.` · `403 You can only edit documents you authored.` |
| `DELETE /api/documents/:id` | `204` (soft delete) | `404 Document not found.` · `403 You can only delete documents you authored.` |
| `DELETE /api/documents/:id/purge` | `204` (row removed, even if soft-deleted) | `404` · `403` (same messages) |

**PUT details:**
- `metadata` must be a non-null object or array, and `sections` an array.
- `status` is validated only when it is JS-truthy, so `[]` and `{}` count as present and invalid.
- The saved metadata is `{...metadata, id: <path id>, author}`, where `author` is resolved as described under Ownership.
- `ownerId` is never stored inside the document. It is returned only on reads (`GET` list and by id), and the PUT response has neither `ownerId` nor `updatedAt`.
- On reads, `ownerId` and `updatedAt` are appended last, in that order.
- Other top-level body keys are dropped.
- Saving a soft-deleted id brings it back. It is treated as a new document, so the saver becomes its owner.
- An autosave snapshot is kept in history when the content changes, at most once per 5 minutes per document (see Version history).

### Version history (session required)

| Route | Success | Errors |
|---|---|---|
| `GET /api/documents/:id/history` | `200 {"snapshots": [...]}`, newest first, at most 10. Each snapshot is `{id, savedAt, takenAt, label, takenBy, doc}`. | `404 Document not found.` (same visibility as `GET /:id`) |
| `POST /api/documents/:id/history/:snapshotId/restore` | `200 {"document": Document}`, the snapshot made current. The version being replaced is first kept in history with the label `Before restore`. | `404 Document not found.` · `404 That version is no longer in the history.` · `403 You can only edit documents you authored.` |

- Restoring brings back the content, not the old owner. The `author` on the document is kept as it is, and the restore is then saved like a normal PUT, so the same ownership rule applies.
- Labels: automatic snapshots are `Auto-saved version`.

### AI proxy (session required)

| Route | Body | Success |
|---|---|---|
| `GET /api/ai/providers` | — | `200 {"providers": ["gemini"?, "openai"?]}`, the ones with a server-side key |
| `POST /api/ai/rephrase` | `{"provider", "text", "instruction"}` | `200 {"text": string}` |
| `POST /api/ai/generate-test-cases` | `{"provider", "context"}` | `200`, the provider's parsed JSON suite as-is |

Errors are checked in this order:
1. `400 provider must be one of gemini, openai.`
2. `400 text and instruction are required.` or `400 context is required.` (missing, not a string, or blank after trimming)
3. `501 This server has no <provider> API key configured.`
4. `502 <message>` for any provider failure. The message is one of:
   - the provider's `error.message`
   - `<Gemini|OpenAI> API returned status <n>`
   - `fetch failed` (network failure)
   - `The operation was aborted due to timeout` (45 s)
   - a JSON parse message for an unparsable reply

### Remote test execution, mock (session required)

| Route | Body | Success | Errors |
|---|---|---|---|
| `POST /api/test-exec/scripts` | `{"suiteId", "suiteTitle", "robotCode"}` | `200 {"ok": true}` | `400 suiteId is required.` / `suiteTitle is required.` / `robotCode is required.` |
| `POST /api/test-exec/runs` | `{"suiteId"}` | `200 {"jobId": "job-<epoch ms>-<base36>"}` | `400 suiteId is required.` · `400 No script has been pushed for this suite yet.` |
| `GET /api/test-exec/runs/:jobId` | — | `200 {"status": "running"}` or `200 {"status": "completed", "results": RobotResultsJson}` | `404 No run found with that id.` |

A run completes about 300 ms after it starts. The completed `results` object is:

```json
{"_schema": "devdoc-robot-results-v1", "suiteTitle": "…", "executedAt": "<ISO>",
 "environment": "Mock Remote Test PC",
 "summary": {"total": n, "passed": n, "failed": n, "skipped": 0},
 "results": [{"customId": "TC-001-Drift", "title": "…", "status": "PASS|FAIL",
              "elapsedTimeMs": 120-919, "failureMessage": "…only on FAIL"}]}
```

Test names come from the `*** Test Cases ***` section of the script. `customId` is the leading `TC…` token, with underscores turned into dashes (it greedily consumes underscores). A name without one gets `TC-<n>`; a script with no test cases yields one `TC-1 / Automated test` result. Each test independently passes with probability 0.85. Scripts and jobs live in memory only.

### Releases (session required)

Release management (SRS-033 to 046). Admins and regular users are treated the same.

- **Anyone signed in** can read every release and create one.
- **The creator** is the release's first signer and changes everything on it: details, signers, builds, linked test runs, blockers, notes, cancelling. A non-creator gets `403 Only <name>, who created this release, can change it.`
- **Signers** (2 to 5 people, the creator among them) sign off, override failing gates and promote. A non-signer gets `403 Only the signers of this release can <do that>.`
- A release is **never deleted**, only cancelled. Its audit log is kept.
- **Ids** are made by the server (`rel-…`, blockers `b-…`). Builds are `rc100`, `rc101`, … per release.

| Route | Who | Body → result |
|---|---|---|
| `GET /api/releases` | any | `{"releases": [line]}`; line = `id, version, title, type, status, targetDate, segment, createdBy, createdByName, signerCount, canEdit, isSigner, metrics{builds, latestBuild, finalBuild, openBlockers}` |
| `GET /api/releases/activity?limit=` | any | `{"entries": [{releaseId, version, seq, at, actorId, actor, action, details}]}`: the latest audit entries across every release, newest first (default 10, 1 to 50; `400` otherwise). The dashboard's recent activity |
| `GET /api/releases/{id}` | any | `{"release": …}` full release (below); `404 Release not found.` |
| `POST /api/releases` | any | `{version, type, targetDate, status?, title?, segment?, notes?, milestones?, gateRules?, blockerQuery?, signerIds: [1 to 4 user ids]}` → `{"release"}`. The caller is added as first signer (also listing them is ignored). `400 A release needs 2 to 5 signers: you and 1 to 4 others.` / `400 Unknown user: <id>.` / `409 A release with version <v> already exists.` (version is unique ignoring case and surrounding spaces) |
| `PATCH /api/releases/{id}` | creator | any of `version, title, type, targetDate, segment, status, notes, milestones, gateRules, blockerQuery`; only the fields sent change. `status` cannot be `Cancelled` (use cancel). `409` if the version changes after a build exists, or the readiness rules change after a build is Final. |
| `PUT /api/releases/{id}/signers` | creator | `{userIds: [1 to 4 ids]}`, the people besides the creator. `409` once a build is Final. A removed signer's earlier decisions stay on record but stop counting; a new signer must approve. |
| `POST /api/releases/{id}/cancel` | creator | `{reason}` → `{"release"}`. `409` if already cancelled or `Deployed`. A cancelled release is read-only (`409` on every change). |
| `GET /api/releases/{id}/audit` | any | `{"entries": [{seq, at, actorId, actor, actorRole, action, details, prevHash, hash}], "intact": bool}` |
| `POST /api/releases/{id}/builds` | creator | `{imageName, artifactUrl, sha256, repository?, commitSha?, branchTag?, builtAt?, pipelineBuildId?}` → `{"build"}`; label `v<version>-RC100`, `-RC101`, … `409` once a build is Final. |
| `PUT /api/releases/{id}/builds/{b}/runs` | creator | `{testRunIds: [...]}` → `{"build"}` |
| `POST /api/releases/{id}/builds/{b}/override` | signer | `{reason}` → `{"build"}`; once per build |
| `POST /api/releases/{id}/builds/{b}/signoffs` | signer | `{decision: "Approved"\|"Rejected", comment?}` (comment required to reject) → `{"build"}`. The signer is the signed-in user; they can change their decision until the build is Final. Sign-offs are per build. |
| `POST /api/releases/{id}/builds/{b}/promote` | signer | → `{"build"}` once the gates pass (or were overridden) and **every current signer approved this build**; sets the release to `Approved`. |
| `POST /api/releases/{id}/blockers` | creator | `{key, tracker?, title?, url?, severity?, status?}` → `{"blocker"}`; `409` if that tracker+key is already listed |
| `PATCH /api/releases/{id}/blockers/{blockerId}` | creator | same fields; only for hand-entered issues (`409` for tracker issues) |
| `DELETE /api/releases/{id}/blockers/{blockerId}` | creator | `204` |
| `POST /api/releases/{id}/blockers/lookup` | creator | `{tracker, key}` → `{"blocker"}` read from Jira / GitHub |
| `POST /api/releases/{id}/blockers/sync` | creator | → `{at, added, closed, reopened, error}`; a background worker also syncs every 5 minutes |

**Full release** (`GET /api/releases/{id}` and every release-returning route): `id, version, title, type, targetDate, segment, status, notes, milestones [{key, name, plannedDate, actualDate}], signers [{userId, name, designation, department}] (creator first), gateRules {minPassRate, requireNoOpenBlockers, mandatorySuiteIds}, blockerQuery, blockerSync, createdBy (user id), createdByName, createdAt, updatedAt, cancelledReason, cancelledAt, canEdit, isSigner, signersLocked, metrics, blockers, builds`.

**Build**: `id, number, label, kind (RC|Final), imageName, commitSha, branchTag, artifactUrl, repository, sha256, builtAt, pipelineBuildId, testRunIds, gateOverride {by, byId, reason, at}|null, promotedBy, promotedById, promotedAt, createdBy, createdByName, createdAt, signoffs {userId: {userId, userName, decision, comment, at}}`, plus on the full release `gates {checks, passed, overridden, ready, passRate, coverage, linkedRuns, verification}` and `signoffStatus {required, approved, rejected, waitingFor, complete}`.

Removed with this version: `POST /api/releases/seed`, `DELETE /api/releases/{id}`, `PUT /api/releases/{id}` and `PUT /api/releases/{id}/blockers/{blockerId}`. Release data lives in Postgres (migration 0008); `POST /api/admin/reset` leaves it alone and the admin backup includes it under `releases`.
