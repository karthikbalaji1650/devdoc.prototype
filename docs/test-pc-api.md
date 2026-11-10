# Test PC API

What a remote test execution server must implement for DevDoc Studio to
run tests on it (DDS-SRS-020). Register the server under
**Data Management → Remote test servers**; its *API endpoint URL* is the
base of the paths below (e.g. `https://testpc.example.com/api/v1`).

Every request carries the credentials configured for the server:

| Auth method | Sent as |
|---|---|
| None | nothing |
| API key | `<header name>: <key>` (default header `X-API-Key`) |
| Basic | `Authorization: Basic base64(username:password)` |
| OAuth2 client credentials | `Authorization: Bearer <token>`, the token fetched from the token URL with `grant_type=client_credentials` |

The **Test** button on the server sends `GET <endpoint URL>` with the same
credentials; any status below 400 counts as connected.

## Start a run

`POST {endpoint}/runs`

```json
{
  "suiteId": "suite-123",
  "suiteTitle": "AST2600 RTC Clock & Timing",
  "robotCode": "*** Settings ***\n...",
  "parameters": { "bmcIp": "192.168.1.100" }
}
```

`robotCode` is the suite's Robot Framework file; `parameters` is the
server's *payload parameters*, unchanged.

Reply with any 2xx and the server's own job id:

```json
{ "jobId": "remote-42" }
```

## Report a run

`GET {endpoint}/runs/{jobId}`

```json
{ "status": "RUNNING" }
```

`status` is one of `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED` (any case).

DevDoc Studio's backend calls this from a background worker on the
server's *Check runs every* interval (5, 10 or 30 seconds), not from the
browser, and keeps calling until the run is `COMPLETED` or `FAILED`. If
the call fails (no connection, an HTTP error, an unknown `status`), it
retries on the next interval; after 20 failures in a row the run is
marked failed. `COMPLETED` results that cannot be read fail the run at once.

While `QUEUED` or `RUNNING`, report progress if you can (all optional):

```json
{ "status": "RUNNING", "total": 40, "completed": 12, "passed": 10, "failed": 2 }
```

DevDoc Studio shows it as "12 of 40 executed (30%)": the execution
percentage is `completed / total * 100`. Without `completed`, it is taken
as `passed + failed`.

When `FAILED`, add a reason: `{ "status": "FAILED", "error": "BMC unreachable" }`.

When `COMPLETED`, add the results, one entry per test case:

```json
{
  "status": "COMPLETED",
  "results": [
    { "customId": "TC-001", "title": "TC-001 Drift check", "status": "PASS", "elapsedTimeMs": 1200 },
    { "customId": "TC-002", "title": "TC-002 Alarm", "status": "FAIL", "failureMessage": "Timeout after 30 s" }
  ]
}
```

- `status`: `PASS` / `PASSED`, `FAIL` / `FAILED` or `SKIP` / `SKIPPED`.
- `title` is required. `customId` should match the test case ID in DevDoc
  Studio (e.g. `TC-001`) so results map back to the cases; without it, the
  entry gets `TC-<position>`.
- `elapsedTimeMs` and `failureMessage` are optional.
- `results` may also be a whole `devdoc-robot-results-v1` document (the
  format DevDoc Studio exports), in which case its `results` list is used.

A reply DevDoc Studio cannot read (an unknown status, a result without a
title or a valid status) is reported as an error, not partly applied.
