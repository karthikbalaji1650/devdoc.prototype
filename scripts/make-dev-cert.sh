#!/usr/bin/env sh
# A TLS certificate for running DevDoc Studio over HTTPS locally (DDS-SRS-074),
# written to certs/tls.crt + certs/tls.key, where docker-compose's web-app
# picks it up.
#
# With mkcert (https://github.com/FiloSottile/mkcert) installed, the
# certificate is signed by mkcert's local CA, which your browsers trust - no
# warning. Without it, a self-signed certificate is made (browsers warn).
# For a real deployment, put your CA-issued certificate there instead.
#
#   scripts/make-dev-cert.sh [hostname ...]     (default: localhost)
set -eu
cd "$(dirname "$0")/.."
mkdir -p certs
[ $# -gt 0 ] || set -- localhost
if command -v mkcert >/dev/null 2>&1; then
  mkcert -install
  mkcert -cert-file certs/tls.crt -key-file certs/tls.key "$@" 127.0.0.1 ::1
else
  san=""
  for h in "$@"; do san="${san:+$san,}DNS:$h"; done
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days 365 \
    -subj "/CN=$1" -addext "subjectAltName=$san,IP:127.0.0.1" \
    -keyout certs/tls.key -out certs/tls.crt 2>/dev/null
  echo "Self-signed certificate for $* in certs/ (install mkcert for one your browser trusts)."
fi
chmod 600 certs/tls.key
echo "Restart web-app to use it: docker compose restart web-app"
