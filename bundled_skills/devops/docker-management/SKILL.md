---
name: docker-management
description: Docker container lifecycle management, Dockerfile authoring, and debugging.
platforms: [linux, macos, windows]
tags: [docker, containers, devops, dockerfile, docker-compose, debugging, optimization]
---

# Docker Management SOP


## When to Use

- User wants to write or improve a Dockerfile or docker-compose.yml
- User has a container that won't start, is crashing, or behaves unexpectedly
- User wants to reduce image size or improve build speed
- User asks about container networking, volumes, or environment variables

---

## Part 1 — Dockerfile Best Practices

### Golden Template (Node.js — multi-stage)

```dockerfile
# ─── Stage 1: Dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copy only package files first — maximizes layer caching
COPY package.json package-lock.json ./
RUN npm ci --only=production

# ─── Stage 2: Builder ───────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─── Stage 3: Production Runtime ────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Security: run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Copy only what's needed at runtime
COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/dist         ./dist

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]
```

### Golden Template (Python — FastAPI)

```dockerfile
FROM python:3.12-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

FROM base AS builder
COPY requirements.txt .
RUN pip install --prefix=/install -r requirements.txt

FROM base AS runner
COPY --from=builder /install /usr/local
COPY . .

RUN adduser --disabled-password --gecos "" appuser && chown -R appuser /app
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s CMD curl -f http://localhost:8000/health || exit 1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Layer Caching Rules

1. Order layers from **least to most frequently changing**:
   - OS packages → dependency manifests → dependencies → source code → build output
2. `COPY package.json .` then `RUN npm ci` before `COPY . .` — source changes don't bust the dep layer
3. `RUN` commands that install packages should be combined into one `RUN`:
   ```dockerfile
   # WRONG — 3 layers
   RUN apt-get update
   RUN apt-get install -y curl
   RUN rm -rf /var/lib/apt/lists/*

   # CORRECT — 1 layer
   RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
   ```

---

## Part 2 — .dockerignore

Always create a `.dockerignore` alongside your Dockerfile:

```
# Version control
.git
.gitignore

# Dependencies (reinstalled in container)
node_modules
.venv
__pycache__
*.pyc

# Build output (rebuilt in container)
dist
build
.next
out

# Dev tooling
.env
.env.*
*.test.*
*.spec.*
coverage/
.nyc_output

# Docker files themselves
Dockerfile*
docker-compose*

# OS / IDE
.DS_Store
.idea
.vscode
*.swp
```

---

## Part 3 — Docker Compose Patterns

### Standard Web App Stack

```yaml
version: "3.9"

services:
  app:
    build:
      context: .
      target: runner          # target multi-stage build stage
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:secret@db:5432/mydb
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - app-net

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: mydb
    volumes:
      - pg-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - app-net

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
    networks:
      - app-net

volumes:
  pg-data:
  redis-data:

networks:
  app-net:
    driver: bridge
```

### Dev Override (docker-compose.override.yml)

```yaml
# Automatically merged with docker-compose.yml in dev
services:
  app:
    build:
      target: builder         # use dev stage with devDependencies
    volumes:
      - .:/app                # live reload via volume mount
      - /app/node_modules     # anonymous volume to preserve container modules
    environment:
      - NODE_ENV=development
    command: npm run dev
    ports:
      - "9229:9229"           # Node.js debugger port
```

---

## Part 4 — Debugging Commands

### Container Won't Start

```bash
# See why it exited
docker logs <container_name_or_id>
docker logs --tail 50 myapp

# Inspect the container state and config
docker inspect myapp | jq '.[0].State'

# Override entrypoint to get a shell inside the image
docker run --rm -it --entrypoint sh myimage:latest
```

### Container Running but Misbehaving

```bash
# Get a shell in a running container
docker exec -it myapp sh       # alpine/slim images
docker exec -it myapp bash     # full debian/ubuntu images

# Watch real-time resource usage
docker stats myapp

# See all environment variables
docker exec myapp env

# Inspect network connectivity
docker exec myapp wget -qO- http://db:5432  # test service-to-service
docker network ls
docker network inspect app-net
```

### Image Debugging

```bash
# Inspect image layers and sizes
docker image history myimage:latest

# Dive tool — interactive layer explorer (install separately)
dive myimage:latest

# Check image metadata
docker inspect myimage:latest | jq '.[0].Config'

# Build with no cache to force fresh layers
docker build --no-cache -t myimage:latest .

# Build a specific stage
docker build --target builder -t myimage-debug:latest .
```

### Volume and Permission Issues

```bash
# List volumes
docker volume ls
docker volume inspect pg-data

# Check file ownership inside container
docker exec myapp ls -la /app

# Fix common permission error: EACCES / Permission denied
# → Add to Dockerfile:
RUN chown -R appuser:appgroup /app
USER appuser
```

---

## Part 5 — Image Size Optimization Checklist

- [ ] Use `alpine` or `slim` base image variants
- [ ] Multi-stage build — only copy runtime artifacts to final stage
- [ ] `RUN apt-get clean && rm -rf /var/lib/apt/lists/*` after apt installs
- [ ] `npm ci --only=production` (not `npm install`) in production stage
- [ ] `.dockerignore` excludes `node_modules`, `.git`, `coverage/`, test files
- [ ] No dev tools (`curl`, `vim`, `git`) installed in the production stage
- [ ] Use `COPY --chown` to avoid a separate `RUN chown` layer

**Benchmark:** A typical Node.js service should be under 150MB; Python under 200MB.

```bash
# Check final image size
docker images myimage:latest --format "{{.Size}}"
```

---

## Agent Instructions

1. When asked to write a Dockerfile, always ask: language/runtime, target environment (prod vs dev), any special requirements (GPU, native extensions)
2. Default to multi-stage builds for compiled or bundled apps
3. Always include a `HEALTHCHECK` and a non-root `USER` in production images
4. When debugging, start with `docker logs` before anything else — it reveals 90% of issues
5. Check `depends_on` + `healthcheck` when services fail to connect to each other
6. After writing a Dockerfile, run through the image optimization checklist mentally
