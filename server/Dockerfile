# ==========================================
# Multi-Stage Dockerfile for the DevDoc Studio API
# ==========================================

# Stage 1: compile TypeScript to plain JS
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: production image — runtime deps only, no TypeScript/dev tools
FROM node:22-alpine AS runner
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Runs as the non-root `node` user the base image already ships with
# (uid 1000), rather than root - found in review. This is the
# container actually holding credentials and the database connection,
# so it's the one worth hardening; port 4000 needs no special
# privilege to bind, so nothing else changes.
RUN chown -R node:node /app
USER node

EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
