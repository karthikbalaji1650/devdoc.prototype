#!/bin/sh
# TLS certificate for nginx (DDS-SRS-074), run by the nginx image's
# entrypoint before nginx starts.
#
# - A certificate mounted at /etc/nginx/certs/tls.crt + tls.key (yours, from
#   your CA or Let's Encrypt) is used as is.
# - Otherwise a self-signed one for localhost is made, so `docker compose up`
#   works out of the box. Browsers warn about it; use a real certificate
#   anywhere but your own machine. scripts/make-dev-cert.sh makes one you can
#   trust locally instead.
set -eu
out=/etc/nginx/tls
mkdir -p "$out"
if [ -f /etc/nginx/certs/tls.crt ] && [ -f /etc/nginx/certs/tls.key ]; then
  cp /etc/nginx/certs/tls.crt "$out/tls.crt"
  cp /etc/nginx/certs/tls.key "$out/tls.key"
  echo "devdoc-tls: using the mounted certificate"
elif [ ! -f "$out/tls.crt" ]; then
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days 365 \
    -subj "/CN=${TLS_HOSTNAME:-localhost}" \
    -addext "subjectAltName=DNS:${TLS_HOSTNAME:-localhost},DNS:localhost,IP:127.0.0.1" \
    -keyout "$out/tls.key" -out "$out/tls.crt" 2>/dev/null
  echo "devdoc-tls: no certificate mounted at /etc/nginx/certs - made a self-signed one for ${TLS_HOSTNAME:-localhost}"
fi
chmod 600 "$out/tls.key"
