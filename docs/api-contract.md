# DevDoc Studio API contract

The frozen HTTP contract of the DevDoc Studio backend. It was written down
from the original Node/Express API and verified against it request by request
(`backend/tests/parity/`). The FastAPI backend must keep every point here.

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
{"id": "usr-01", "name": "…", "email": "…", "title": "…|null", "department": "…|null",
 "role": "admin|release-manager|firmware-lead|…", "avatarBg": "…|null", "initials": "…|null"}
```

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
**Editing and deleting:** admins can change any document; everyone else only documents whose stored author equals their name.

| Route | Success | Errors |
|---|---|---|
| `GET /api/documents` | `200 {"documents": [Document + "updatedAt"]}`, visible and not deleted, most recently updated first | — |
| `GET /api/documents/:id` | `200 {"document": Document + "updatedAt"}` | `404 Document not found.` (missing, deleted or invisible) |
| `PUT /api/documents/:id` | `200 {"document": Document}` (see below; no `updatedAt`) | `400 Body must be a document with metadata and sections.` · `400 status must be one of DRAFT, IN_REVIEW, APPROVED, PUBLISHED.` · `403 You can only edit documents you authored.` |
| `DELETE /api/documents/:id` | `204` (soft delete) | `404 Document not found.` · `403 You can only delete documents you authored.` |
| `DELETE /api/documents/:id/purge` | `204` (row removed, even if soft-deleted) | `404` · `403` (same messages) |

**PUT details:**
- `metadata` must be a non-null object or array, and `sections` an array.
- `status` is validated only when it is JS-truthy, so `[]` and `{}` count as present and invalid.
- The saved metadata is `{...metadata, id: <path id>, author}`. `author` is always the caller's name for non-admins; for admins it is `metadata.author || <admin name>`.
- Other top-level body keys are dropped.
- Saving a soft-deleted id restores it.
- `updatedAt` is appended last on reads.

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
