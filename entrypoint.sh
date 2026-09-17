#!/bin/bash
# Entrypoint: start file-bridge (port 8081) then code-server (port 8080)
set -e

echo "[entrypoint] Starting file-bridge on port 8081..."
python3 /home/coder/file_bridge.py &

echo "[entrypoint] Starting code-server on port 8080..."
exec code-server --bind-addr 0.0.0.0:8080 --auth none /home/coder/project
