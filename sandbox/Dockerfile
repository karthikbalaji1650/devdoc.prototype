# Dockerfile for VS Code Web Server + Cline (Claude Agent) + Robot Framework Sandbox

FROM codercom/code-server:latest

USER root

# Install Python 3, Robot Framework CLI, SSH & Curl
# Also install ca-certificates to handle SSL issues in corporate/proxy environments
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    git \
    curl \
    jq \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy the workspace file-bridge server and entrypoint (as root, before USER switch)
COPY file_bridge.py /home/coder/file_bridge.py
COPY entrypoint.sh /home/coder/entrypoint.sh
RUN chmod +x /home/coder/entrypoint.sh /home/coder/file_bridge.py \
    && chown coder:coder /home/coder/file_bridge.py /home/coder/entrypoint.sh

# Install Robot Framework test libraries (--break-system-packages for Debian PEP 668)
RUN pip3 install --no-cache-dir --break-system-packages \
    robotframework \
    robotframework-requests \
    robotframework-sshlibrary \
    robotframework-seleniumlibrary

USER coder
WORKDIR /home/coder/project

# NOTE: VS Code Extensions (Cline & RobotCode) are installed at runtime via the browser UI
# at http://<server>:8080 due to marketplace SSL restrictions in this network environment.
# To install manually after container start:
#   docker exec -it devdoc-vscode-cline code-server --install-extension saoudrizwan.claude-dev
#   docker exec -it devdoc-vscode-cline code-server --install-extension d-biehl.robotcode

# Expose Web Interface Port
EXPOSE 8080

# Environment variables for Claude & Workspace
ENV ANTHROPIC_API_KEY=""
ENV WORKSPACE_DIR="/home/coder/project"

# Start both code-server (8080) and the file-bridge API (8081) together
EXPOSE 8081

# Override the base image entrypoint so our script runs as PID 1 via dumb-init
ENTRYPOINT ["/usr/bin/dumb-init", "--", "/home/coder/entrypoint.sh"]
