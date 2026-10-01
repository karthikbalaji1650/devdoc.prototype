# Security review

An internal review of DevDoc Studio and its optional backend (`server/`),
done 2026-10-01 against commit `a45ae77`. This is a code-level review by
the person building the app, not an independent third-party audit or a
penetration test — see "What this isn't" at the end.

## Scope and method

- Read through the backend end to end: authentication, sessions,
  permissions, the documents and AI-proxy routes, database access.
- Read through the frontend's handling of credentials, stored data, and
  anywhere document content is turned into rendered HTML.
- `npm audit` on both the frontend and `server/` (0 vulnerabilities on
  either, as of this review).
- Checked the Docker images for privilege level.
- Did not do: fuzzing, dependency supply-chain attestation beyond
  `npm audit`, or testing against a real deployment on the public
  internet (none exists yet).

## Findings

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | No rate limiting on login | Medium | **Fixed** |
| 2 | API containers ran as root | Low | **Fixed** (API only) |
| 3 | AI provider keys in browser localStorage | Medium | Mitigated, not eliminated |
| 4 | Real auth ships off by default | Medium | Accepted — deployment decision |
| 5 | No CSP coverage for a custom Ollama URL | Low | Accepted — documented |
| 6 | No CSRF tokens | Low | Accepted — largely mitigated already |
| 7 | No formal third-party review | — | Out of scope for this pass |

### 1. No rate limiting on login — Fixed

`POST /api/auth/login` had no throttle: nothing stopped repeated
password-guessing attempts against a known email. Fixed with
`express-rate-limit` on that route specifically (10 failed attempts
per 15 minutes per IP; successful logins don't count against the
limit, so a mistyped password once doesn't lock someone out).
Verified against the real running API: the 10th failure still returns
a normal rejection, the 11th returns 429, and a correct login still
succeeds once the window resets. The login response already gave the
same message for an unknown email and a wrong password (not changed
here, already correct), so this closes the remaining brute-force
vector without that one needing a fix too.

### 2. Containers ran as root — Fixed for the API

Neither Docker image specified a non-root user. Fixed for `server/`
(now runs as the `node` user the base image ships with — the
container that actually holds the database connection and, when
configured, AI provider keys). Left as-is for the `web-app` (nginx)
image: it serves static files and proxies to code-server, holds no
secrets, and converting an nginx image to run fully non-root needs
more care (non-privileged port, writable cache/run directories) than
this pass's time justified for a lower-value target. Worth doing if
this is deployed for real.

### 3. AI provider keys in browser localStorage — Mitigated, not eliminated

Already addressed by the backend AI proxy (two commits earlier this
session): when the backend is configured with a server-side key, keys
never reach the browser for that provider. This is not retroactive —
a user who entered their own personal key still has it in
localStorage, by their own choice, and the browser-only mode (no
backend) still stores it there by necessity. Not something a code
change alone can fully close; the proxy is the real fix, and it's
opt-in.

### 4. Real auth ships off by default — Accepted, needs a deployment decision

The real backend (bcrypt password check, revocable sessions,
server-side permission checks) is built, tested, and works — but the
app still defaults to the mock, client-side-only login unless
`VITE_API_BASE_URL` is set at build time. This is a product/hosting
decision (see the README and the SRS progress report), not something
to silently flip in a review.

### 5. CSP doesn't cover a custom Ollama URL — Accepted, documented

The Content-Security-Policy's `connect-src` allow-lists the backend
API (substituted at container start) and Ollama's default address,
but not a non-default Ollama URL a user enters in Settings — there is
nowhere server-side to learn that value from. Already called out in
`nginx.conf.template`; not a new finding, listed here for completeness.

### 6. No CSRF tokens — Accepted, already substantially mitigated

The session cookie is `SameSite=Lax`, which blocks the classic
cross-site form-POST CSRF vector on its own (a cross-site POST doesn't
carry the cookie at all under `Lax`). Explicit CSRF tokens would be
defense-in-depth on top of that, not a gap being actively exploitable
today.

### 7. No formal third-party review — out of scope

See "What this isn't" below.

## What this isn't

This review was done by the same person who built the app, using code
reading and manual testing against a real running instance — not an
independent security team, not a penetration test, not automated
fuzzing or static-analysis tooling beyond `npm audit` and the linter.
Treat the fixes above as real and verified, and treat the absence of
a finding elsewhere as "nothing obvious was found," not as a
guarantee. A real security review before handling production data at
scale should still involve someone other than the app's own author.

## Reporting a concern

This is an internal prototype without a public deployment yet. If you
find something here, raise it directly with the project owner rather
than filing a public issue.
