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
"""

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

BASE_DIR    = "/home/coder/project" if os.path.exists("/home/coder") else os.path.abspath("./vscode-workspace")
DOCS_DIR    = os.path.join(BASE_DIR, "docs")
RESULTS_DIR = os.path.join(BASE_DIR, "test-results")
SUITES_DIR  = os.path.join(BASE_DIR, "test-suites")
SPECS_DIR   = os.path.join(BASE_DIR, "specs")
PORT        = 8081

for d in [DOCS_DIR, RESULTS_DIR, SUITES_DIR, SPECS_DIR]:
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

    def do_GET(self):
        parsed_url = urlparse(self.path)
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
                            rel_p = os.path.relativepath(full_p, BASE_DIR)
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
    server = HTTPServer(("0.0.0.0", PORT), BridgeHandler)
    print(f"[file-bridge] Listening on 0.0.0.0:{PORT} (Workspace: {BASE_DIR})")
    server.serve_forever()
