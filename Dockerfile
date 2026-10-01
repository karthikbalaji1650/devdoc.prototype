# ==========================================
# Multi-Stage Dockerfile for DocCraft Suite
# ==========================================

# Stage 1: Build Frontend Assets
FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Optional: points the built frontend at the backend in server/, exactly
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
ENV NGINX_ENVSUBST_FILTER=^BACKEND_ORIGIN$
ENV BACKEND_ORIGIN=

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
