#!/usr/bin/env python3
"""
File Bridge Server — port 8081
Accepts POST and GET requests from DocCraft Studio to synchronize files with VS Code workspace.

Endpoints:
  GET  /health                                 → 200 OK {"status": "ok", "port": 8081}
  GET  /get-file?path=test-suites/foo.robot   → 200 OK file content or 404
  GET  /list-files                             → 200 OK list of files in docs, test-suites, test-results, specs
  POST /save-doc       { "filename": "foo.md", "content": "..." }  → writes to docs/ & specs/
  POST /save-results   { "filename": "results.json", "content": "..." } → writes to test-results/
  POST /save-suite     { "filename": "suite.robot", "content": "..." }  → writes to test-suites/ & specs/
  POST /save-spec      { "filename": "spec.md", "content": "..." }   → writes to specs/

Existing code (DDS-SRS-030), called by the DevDoc Studio API - not the browser:
  GET  /git/repos                              → repositories under repos/, with branch and last commit
  POST /git/clone  { "name", "url", "branch"?, "authHeader"? }  → clones into repos/<name>
  POST /git/pull   { "name", "authHeader"? }   → fast-forwards repos/<name>
  POST /git/remove { "name" }                  → deletes repos/<name> from the workspace
  When BRIDGE_TOKEN is set, these need `Authorization: Bearer <BRIDGE_TOKEN>`.
  git runs without a shell; credentials go in a per-command HTTP header and
  are never written to .git/config.
"""

import hmac
import json
import os
import re
import shutil
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, urlsplit, urlunsplit

BASE_DIR    = "/home/coder/project" if os.path.exists("/home/coder") else os.path.abspath("./vscode-workspace")
DOCS_DIR    = os.path.join(BASE_DIR, "docs")
RESULTS_DIR = os.path.join(BASE_DIR, "test-results")
SUITES_DIR  = os.path.join(BASE_DIR, "test-suites")
SPECS_DIR   = os.path.join(BASE_DIR, "specs")
REPOS_DIR   = os.path.join(BASE_DIR, "repos")
PORT        = int(os.environ.get("BRIDGE_PORT", "8081"))
BRIDGE_TOKEN = os.environ.get("BRIDGE_TOKEN", "")
GIT_TIMEOUT_S = 600
_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$")
_BRANCH = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$")
# https://, http://, ssh://, git://, or scp-style git@host:owner/repo.git; file:// only for tests.
_SCP = re.compile(r"^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[A-Za-z0-9._/~-]+$")
_SCHEMES = ("https", "http", "ssh", "git") + (("file",) if os.environ.get("BRIDGE_ALLOW_FILE_URLS") == "1" else ())


class GitError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def _safe_url(url):
    """The URL without any credentials in it, for showing."""
    parts = urlsplit(url)
    if parts.username or parts.password:
        return urlunsplit((parts.scheme, parts.hostname + (f":{parts.port}" if parts.port else ""), parts.path, "", ""))
    return url


def _check_url(url):
    if not isinstance(url, str) or not url.strip():
        raise GitError(400, "url is required.")
    url = url.strip()
    if _SCP.match(url):
        return url
    parts = urlsplit(url)
    if url.startswith("-") or parts.scheme not in _SCHEMES:
        raise GitError(400, "url must be an https://, ssh:// or git@host:owner/repo address.")
    if parts.password:  # git would keep it in .git/config
        raise GitError(400, "Put the access token in the token field, not in the URL.")
    return url


def _repo_dir(name):
    if not isinstance(name, str) or not _NAME.match(name):
        raise GitError(400, "name may contain letters, digits, '.', '_' and '-'.")
    return os.path.join(REPOS_DIR, name)


def _git(args, cwd=None, auth_header=None):
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GIT_ASKPASS": "/bin/false", "SSH_ASKPASS": "/bin/false"}
    cmd = ["git"]
    if auth_header:
        if "\n" in auth_header or "\r" in auth_header:
            raise GitError(400, "Invalid credentials.")
        cmd += ["-c", f"http.extraHeader={auth_header}"]
    try:
        done = subprocess.run(cmd + args, cwd=cwd, env=env, capture_output=True, text=True, timeout=GIT_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        raise GitError(504, f"git took longer than {GIT_TIMEOUT_S} s.")
    if done.returncode != 0:
        message = (done.stderr or done.stdout).strip().splitlines()
        # Never echo credentials back, even if git printed them.
        text = " ".join(message[-3:])[:500]
        if auth_header:
            text = text.replace(auth_header, "***")
        raise GitError(502, f"git failed: {text}" if text else "git failed.")
    return done.stdout.strip()


def _repo_info(name):
    path = os.path.join(REPOS_DIR, name)
    def out(*args):
        try:
            return _git(list(args), cwd=path)
        except GitError:
            return None
    log = out("log", "-1", "--format=%h%x00%cI%x00%s") or ""
    commit, date, subject = (log.split("\x00") + [None, None, None])[:3]
    return {
        "name": name,
        "path": os.path.relpath(path, BASE_DIR),
        "branch": out("rev-parse", "--abbrev-ref", "HEAD"),
        "commit": commit or None,
        "committedAt": date,
        "subject": subject,
        "remote": _safe_url(out("remote", "get-url", "origin") or ""),
    }

for d in [DOCS_DIR, RESULTS_DIR, SUITES_DIR, SPECS_DIR, REPOS_DIR]:
    os.makedirs(d, exist_ok=True)


class BridgeHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # quiet stdout
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    # ── existing code: git (DDS-SRS-030) ─────────────────────────────
    def _json(self, status, payload):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    def _git_authorized(self):
        if not BRIDGE_TOKEN:
            return True
        given = self.headers.get("Authorization", "")
        return hmac.compare_digest(given.encode(), f"Bearer {BRIDGE_TOKEN}".encode())

    def _handle_git(self, method, path):
        if not self._git_authorized():
            self._json(401, {"error": "The bridge token is missing or wrong."})
            return
        try:
            if method == "GET" and path == "/git/repos":
                names = sorted(n for n in os.listdir(REPOS_DIR) if os.path.isdir(os.path.join(REPOS_DIR, n, ".git")))
                self._json(200, {"repos": [_repo_info(n) for n in names]})
                return
            if method != "POST":
                raise GitError(404, "Not found.")
            length = int(self.headers.get("Content-Length", 0) or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
            target = _repo_dir(body.get("name"))
            auth = body.get("authHeader") or None
            if path == "/git/clone":
                url = _check_url(body.get("url"))
                branch = body.get("branch") or None
                if branch is not None and (not isinstance(branch, str) or not _BRANCH.match(branch)):
                    raise GitError(400, "branch is not a valid branch name.")
                if os.path.exists(target):
                    raise GitError(409, f"repos/{body['name']} already exists in the workspace.")
                args = ["clone", "--no-tags"] + (["--branch", branch, "--single-branch"] if branch else []) + ["--", url, target]
                try:
                    _git(args, auth_header=auth)
                except GitError:
                    shutil.rmtree(target, ignore_errors=True)
                    raise
                self._json(200, _repo_info(body["name"]))
            elif path == "/git/pull":
                if not os.path.isdir(os.path.join(target, ".git")):
                    raise GitError(404, "That repository is not in the workspace.")
                _git(["pull", "--ff-only", "--no-tags"], cwd=target, auth_header=auth)
                self._json(200, _repo_info(body["name"]))
            elif path == "/git/remove":
                shutil.rmtree(target, ignore_errors=True)
                self._json(200, {"removed": body["name"]})
            else:
                raise GitError(404, "Not found.")
        except GitError as exc:
            self._json(exc.status, {"error": exc.message})
        except (ValueError, KeyError) as exc:
            self._json(400, {"error": f"Bad request: {exc}"})

    def do_GET(self):
        parsed_url = urlparse(self.path)
        if parsed_url.path.startswith("/git/"):
            self._handle_git("GET", parsed_url.path)
            return
        clean_path = parsed_url.path
        query = parse_qs(parsed_url.query)

        if clean_path == "/health":
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "port": PORT, "baseDir": BASE_DIR}).encode())

        elif clean_path == "/get-file":
            req_path = (query.get("path", [""])[0] or query.get("file", [""])[0]).strip()
            if not req_path:
                self.send_response(400)
                self._cors()
                self.end_headers()
                self.wfile.write(b"Query parameter 'path' or 'file' is required")
                return

            safe_rel = req_path.lstrip("/").replace("..", "")
            target_file = os.path.join(BASE_DIR, safe_rel)

            if not os.path.exists(target_file) or not os.path.isfile(target_file):
                # Search by basename across standard workspace folders
                base_name = os.path.basename(safe_rel)
                found = None
                for dir_path in [SUITES_DIR, SPECS_DIR, DOCS_DIR, RESULTS_DIR]:
                    candidate = os.path.join(dir_path, base_name)
                    if os.path.exists(candidate) and os.path.isfile(candidate):
                        found = candidate
                        break
                target_file = found

            if target_file and os.path.exists(target_file) and os.path.isfile(target_file):
                try:
                    with open(target_file, "r", encoding="utf-8", errors="replace") as f:
                        content = f.read()
                    self.send_response(200)
                    self._cors()
                    self.send_header("Content-Type", "text/plain; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(content.encode("utf-8"))
                except Exception as e:
                    self.send_response(500)
                    self._cors()
                    self.end_headers()
                    self.wfile.write(str(e).encode())
            else:
                self.send_response(404)
                self._cors()
                self.end_headers()
                self.wfile.write(f"File '{req_path}' not found in workspace.".encode())

        elif clean_path in ["/list-files", "/list-suites"]:
            files_list = []
            for dir_path, label in [(SUITES_DIR, "suites"), (SPECS_DIR, "specs"), (DOCS_DIR, "docs"), (RESULTS_DIR, "results")]:
                if os.path.exists(dir_path):
                    for fname in os.listdir(dir_path):
                        full_p = os.path.join(dir_path, fname)
                        if os.path.isfile(full_p):
                            rel_p = os.path.relpath(full_p, BASE_DIR)
                            files_list.append({
                                "name": fname,
                                "category": label,
                                "relativePath": rel_p,
                                "size": os.path.getsize(full_p)
                            })
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"files": files_list}).encode())

        else:
            self.send_response(404)
            self._cors()
            self.end_headers()

    def do_POST(self):
        if self.path.startswith("/git/"):
            self._handle_git("POST", self.path)
            return
        try:
            length   = int(self.headers.get("Content-Length", 0))
            body     = json.loads(self.rfile.read(length))
            filename = body.get("filename", "").replace("/", "_").replace("..", "")
            content  = body.get("content", "")

            if not filename:
                raise ValueError("filename is required")

            targets = []
            if self.path == "/save-doc":
                targets = [os.path.join(DOCS_DIR, filename), os.path.join(SPECS_DIR, filename)]
            elif self.path == "/save-results":
                targets = [os.path.join(RESULTS_DIR, filename)]
            elif self.path == "/save-suite":
                targets = [os.path.join(SUITES_DIR, filename), os.path.join(SPECS_DIR, filename)]
            elif self.path == "/save-spec":
                targets = [os.path.join(SPECS_DIR, filename)]
            else:
                self.send_response(404)
                self._cors()
                self.end_headers()
                return

            saved_paths = []
            for target in targets:
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with open(target, "w", encoding="utf-8") as f:
                    f.write(content)
                saved_paths.append(target)

            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"saved": saved_paths}).encode())

        except Exception as e:
            self.send_response(500)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())


if __name__ == "__main__":
    # Threaded, so a long clone does not hold up file saves.
    server = ThreadingHTTPServer(("0.0.0.0", PORT), BridgeHandler)
    print(f"[file-bridge] Listening on 0.0.0.0:{PORT} (Workspace: {BASE_DIR})")
    server.serve_forever()
