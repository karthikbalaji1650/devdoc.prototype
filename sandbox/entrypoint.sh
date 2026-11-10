#!/bin/bash
# Entrypoint: start file-bridge (port 8081) then code-server (port 8080).
#
# The code editor always asks for a password (it gives a terminal, so it is
# never left open):
#   CODE_SERVER_HASHED_PASSWORD  an argon2 hash (preferred: the password itself
#                                is then stored nowhere)
#   CODE_SERVER_PASSWORD         the password
#   neither                      a random one is made on first start, kept in
#                                ~/.config/devdoc/code-server-password, and
#                                printed in the container log
set -e

echo "[entrypoint] Starting file-bridge on port 8081..."
# Without the editor's password in its environment.
env -u CODE_SERVER_PASSWORD -u CODE_SERVER_HASHED_PASSWORD -u PASSWORD -u HASHED_PASSWORD \
  python3 /home/coder/file_bridge.py &

if [ -n "${CODE_SERVER_HASHED_PASSWORD:-}" ]; then
  echo "[entrypoint] Code editor password: the hash from CODE_SERVER_HASHED_PASSWORD."
  export HASHED_PASSWORD="$CODE_SERVER_HASHED_PASSWORD"
  unset PASSWORD
elif [ -n "${CODE_SERVER_PASSWORD:-}" ]; then
  echo "[entrypoint] Code editor password: CODE_SERVER_PASSWORD."
  export PASSWORD="$CODE_SERVER_PASSWORD"
  unset HASHED_PASSWORD
else
  saved="$HOME/.config/devdoc/code-server-password"
  if [ ! -s "$saved" ]; then
    mkdir -p "$(dirname "$saved")"
    (umask 077; python3 -c "import secrets; print(secrets.token_urlsafe(18))" > "$saved")
    echo "[entrypoint] No CODE_SERVER_PASSWORD set. Generated code editor password: $(cat "$saved")"
  else
    echo "[entrypoint] No CODE_SERVER_PASSWORD set. Using the password generated on first start (in $saved)."
  fi
  export PASSWORD="$(cat "$saved")"
  unset HASHED_PASSWORD
fi
# Not needed by code-server; keep the bridge's and the editor's secrets apart.
unset CODE_SERVER_PASSWORD CODE_SERVER_HASHED_PASSWORD

echo "[entrypoint] Starting code-server on port 8080 (password required)..."
exec code-server --bind-addr 0.0.0.0:8080 --auth password /home/coder/project
