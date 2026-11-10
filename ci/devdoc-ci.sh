#!/usr/bin/env sh
# DevDoc Studio CI step (DDS-SRS-026, 027): run a suite on a registered
# test server and fail the build if it fails, or upload the results of
# Robot tests the pipeline ran itself.
#
#   devdoc-ci.sh run    <suiteId> <serverId> [run name]
#   devdoc-ci.sh upload <suiteId> <output.xml> [run name]
#
# Needs curl and python3 (for reading JSON). Configure with:
#   DEVDOC_URL         the API, e.g. https://devdoc.example.com:8000
#   DEVDOC_CI_TOKEN    a CI token (Data Management -> CI tokens); keep it in
#                      the CI system's secret store, never in the repository
#   DEVDOC_TIMEOUT     optional, seconds `run` waits (default 3600)
#   DEVDOC_POLL        optional, seconds between status checks (default 10)
#
# Build details (pipeline, build URL and number, repository, branch,
# commit) are read from Jenkins or Bitbucket Pipelines variables when
# present, and recorded on the test run.
#
# Exit codes: 0 passed, 1 tests failed, 2 usage or connection error,
# 3 timed out waiting.

set -eu

die() { echo "devdoc-ci: $*" >&2; exit 2; }
[ -n "${DEVDOC_URL:-}" ] || die "set DEVDOC_URL"
[ -n "${DEVDOC_CI_TOKEN:-}" ] || die "set DEVDOC_CI_TOKEN"
command -v curl >/dev/null || die "curl is required"
command -v python3 >/dev/null || die "python3 is required"
API="${DEVDOC_URL%/}/api/ci"

# Build details from the CI system's own variables.
if [ -n "${BITBUCKET_BUILD_NUMBER:-}" ]; then
  PIPELINE="Bitbucket Pipelines"
  BUILD_NUMBER="$BITBUCKET_BUILD_NUMBER"
  REPOSITORY="${BITBUCKET_REPO_FULL_NAME:-}"
  BRANCH="${BITBUCKET_BRANCH:-${BITBUCKET_TAG:-}}"
  COMMIT="${BITBUCKET_COMMIT:-}"
  BUILD_URL="${BITBUCKET_GIT_HTTP_ORIGIN:+$BITBUCKET_GIT_HTTP_ORIGIN/pipelines/results/$BITBUCKET_BUILD_NUMBER}"
elif [ -n "${JENKINS_URL:-}" ]; then
  PIPELINE="Jenkins"
  BUILD_NUMBER="${BUILD_NUMBER:-}"
  REPOSITORY="${JOB_NAME:-}"
  BRANCH="${BRANCH_NAME:-${GIT_BRANCH:-}}"
  COMMIT="${GIT_COMMIT:-}"
  BUILD_URL="${BUILD_URL:-}"
else
  PIPELINE="${DEVDOC_PIPELINE:-Local}"
  BUILD_NUMBER="" REPOSITORY="" BUILD_URL=""
  BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  COMMIT="$(git rev-parse --short HEAD 2>/dev/null || true)"
fi
export PIPELINE BUILD_NUMBER REPOSITORY BRANCH COMMIT BUILD_URL

# json <python expression over `d`>  - reads JSON on stdin.
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

# api <curl args...>  - prints the body; exits 2 with the server's message on an HTTP error.
api() {
  out="$(mktemp)"
  code="$(curl -sS -o "$out" -w '%{http_code}' -H "Authorization: Bearer $DEVDOC_CI_TOKEN" "$@")" || { rm -f "$out"; die "could not reach $DEVDOC_URL"; }
  if [ "$code" -ge 400 ]; then
    msg="$(json "d.get('error', d)" <"$out" 2>/dev/null || cat "$out")"
    rm -f "$out"
    die "HTTP $code: $msg"
  fi
  cat "$out"
  rm -f "$out"
}

cmd="${1:-}"
case "$cmd" in
  run)
    [ $# -ge 3 ] || die "usage: devdoc-ci.sh run <suiteId> <serverId> [run name]"
    export SUITE="$2" SERVER="$3" NAME="${4:-}"
    body="$(python3 -c '
import json, os
build = {k: os.environ[v] for k, v in [("pipeline","PIPELINE"),("buildUrl","BUILD_URL"),("buildNumber","BUILD_NUMBER"),
         ("repository","REPOSITORY"),("branch","BRANCH"),("commit","COMMIT")] if os.environ.get(v)}
body = {"suiteId": os.environ["SUITE"], "serverId": os.environ["SERVER"], "build": build}
if os.environ.get("NAME"): body["name"] = os.environ["NAME"]
print(json.dumps(body))')"
    started="$(api -X POST -H 'Content-Type: application/json' --data "$body" "$API/runs")"
    job="$(echo "$started" | json "d['jobId']")"
    echo "devdoc-ci: started run $(echo "$started" | json "d['runId']") (job $job)"
    deadline=$(( $(date +%s) + ${DEVDOC_TIMEOUT:-3600} ))
    while :; do
      status="$(api "$API/runs/$job")"
      outcome="$(echo "$status" | json "d['outcome']")"
      echo "devdoc-ci: $(echo "$status" | json "d.get('phase') or d['status']")$(echo "$status" | json "' - %(completed)s of %(total)s executed (%(percent)s%%)' % d['progress'] if d.get('progress') else ''")"
      case "$outcome" in
        passed) echo "devdoc-ci: passed"; exit 0 ;;
        failed) echo "devdoc-ci: FAILED: $(echo "$status" | json "d.get('error') or '%(failed)s of %(total)s failed' % d['results']['summary']")" >&2; exit 1 ;;
      esac
      [ "$(date +%s)" -lt "$deadline" ] || { echo "devdoc-ci: timed out waiting for the run" >&2; exit 3; }
      sleep "${DEVDOC_POLL:-10}"
    done
    ;;
  upload)
    [ $# -ge 3 ] || die "usage: devdoc-ci.sh upload <suiteId> <output.xml> [run name]"
    [ -f "$3" ] || die "no such file: $3"
    export SUITE="$2" NAME="${4:-}"
    query="$(python3 -c '
import os, urllib.parse
q = {k: os.environ[v] for k, v in [("suiteId","SUITE"),("name","NAME"),("pipeline","PIPELINE"),("buildUrl","BUILD_URL"),
     ("buildNumber","BUILD_NUMBER"),("repository","REPOSITORY"),("branch","BRANCH"),("commit","COMMIT")] if os.environ.get(v)}
print(urllib.parse.urlencode(q))')"
    result="$(gzip -c "$3" | api -X POST -H 'Content-Type: application/xml' -H 'Content-Encoding: gzip' --data-binary @- "$API/results?$query")"
    echo "devdoc-ci: recorded run $(echo "$result" | json "d['runId']"): $(echo "$result" | json "'%(passed)s passed, %(failed)s failed, %(skipped)s skipped' % d['summary']")"
    [ "$(echo "$result" | json "d['outcome']")" = passed ] || exit 1
    ;;
  *)
    die "usage: devdoc-ci.sh run <suiteId> <serverId> [name] | upload <suiteId> <output.xml> [name]"
    ;;
esac
