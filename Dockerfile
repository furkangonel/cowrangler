# co-wrangler — Docker image
# Usage:
#   docker build -t co-wrangler .
#   docker run -it --rm \
#     -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
#     -v $(pwd):/workspace \
#     co-wrangler

FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Runtime image ─────────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

# Install runtime dependencies only
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Create workspace mount point
WORKDIR /workspace

# Set entrypoint
ENTRYPOINT ["node", "/app/dist/main.js"]
CMD []
