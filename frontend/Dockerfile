# ==========================================
# Multi-Stage Dockerfile for DocCraft Suite
# ==========================================

# Stage 1: Build Frontend Assets
FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Optional: points the built frontend at the backend in backend/, exactly
# like running it locally with VITE_API_BASE_URL set. Unset (the
# default) builds the same browser-only app as always - docker-compose
# passes this through so `docker compose up` works out of the box.
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Copy sources & build production dist bundle
COPY . .
RUN npm run build

# Stage 2: Production Nginx Server
FROM nginx:alpine AS runner
WORKDIR /usr/share/nginx/html

# Clean default nginx files
RUN rm -rf ./*

# Copy compiled SPA bundle from builder
COPY --from=builder /app/dist .

# Templated nginx config (see nginx.conf.template): the official nginx
# image's entrypoint runs envsubst over every file here at container
# *start*, substituting ${BACKEND_ORIGIN} into the CSP so it can cover
# wherever the backend is actually reachable in this deployment -
# something a build-time-only config could never know. The filter
# restricts substitution to that one variable, so nginx's own $host,
# $http_upgrade etc. in the template are left untouched.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV NGINX_ENVSUBST_FILTER=^(BACKEND_ORIGIN|HTTPS_PORT)$
ENV BACKEND_ORIGIN=
# The port browsers use for HTTPS, for the HTTP -> HTTPS redirect.
ENV HTTPS_PORT=443

# HTTPS with TLS 1.3 (DDS-SRS-074): a mounted certificate, or a self-signed
# one made at start (docker/15-devdoc-tls.sh, run by the image's entrypoint).
RUN apk add --no-cache openssl
COPY docker/15-devdoc-tls.sh /docker-entrypoint.d/15-devdoc-tls.sh

EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
