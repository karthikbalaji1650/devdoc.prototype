# ==========================================
# Multi-Stage Dockerfile for DocCraft Suite
# ==========================================

# Stage 1: Build Frontend Assets
FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

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

# Custom Nginx Config for React SPA Routing + VS Code Proxy
# Use a map so WebSocket upgrades get Connection: upgrade and
# normal HTTP requests get Connection: close (required by RFC 7230)
RUN echo 'map $http_upgrade $connection_upgrade { \
    default upgrade; \
    ""      close; \
} \
\
server { \
    listen 80; \
    server_name localhost; \
    \
    # Security headers (SRS #13). Scoped to what this app actually loads: \
    # Google Identity Services (login) and Drive (export), Google Fonts, \
    # and the Gemini / OpenAI APIs when AI assist is configured with them. \
    # Known gap: the optional backend API (server/) and a custom Ollama \
    # URL are each configured at runtime, so their origin is not knowable \
    # here at image-build time and is not covered by connect-src below - \
    # calls to either still work (CSP only blocks what is not listed, it \
    # does not add authentication), they are just not yet locked down by \
    # this policy. Local Ollamas default address is allowed for the same \
    # reason it is a sensible default, not because it is guaranteed. \
    add_header X-Content-Type-Options "nosniff" always; \
    add_header Referrer-Policy "strict-origin-when-cross-origin" always; \
    add_header X-Frame-Options "DENY" always; \
    add_header Content-Security-Policy "default-src '"'"'self'"'"'; script-src '"'"'self'"'"' https://accounts.google.com; style-src '"'"'self'"'"' '"'"'unsafe-inline'"'"' https://fonts.googleapis.com; font-src '"'"'self'"'"' https://fonts.gstatic.com; img-src '"'"'self'"'"' data: blob:; connect-src '"'"'self'"'"' https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com https://generativelanguage.googleapis.com https://api.openai.com http://localhost:11434; frame-src https://accounts.google.com; object-src '"'"'none'"'"'; base-uri '"'"'self'"'"'; frame-ancestors '"'"'self'"'"'" always; \
    \
    # Reverse-proxy ALL /vscode/* traffic to code-server. \
    # This must be declared before the catch-all location / so that \
    # Nginx prefix-matching gives it priority. \
    # The trailing-slash on proxy_pass strips the /vscode prefix \
    # before forwarding to the upstream. \
    location /vscode/ { \
        proxy_pass http://vscode-cline:8080/; \
        proxy_http_version 1.1; \
        \
        # Correct WebSocket upgrade pattern (map handles both WS and HTTP) \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection $connection_upgrade; \
        \
        # Forward real client info \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $scheme; \
        \
        # Keep WebSocket connections alive (86400 s = 24 h) \
        proxy_read_timeout 86400; \
        proxy_send_timeout 86400; \
        \
        # Remove headers that block iframe embedding \
        proxy_hide_header X-Frame-Options; \
        proxy_hide_header Content-Security-Policy; \
        add_header X-Frame-Options "ALLOWALL" always; \
    } \
    \
    # React SPA catch-all — serve index.html for any unknown path \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
