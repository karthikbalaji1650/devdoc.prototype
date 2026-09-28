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

EXPOSE 4000
CMD ["node", "dist/index.js"]
