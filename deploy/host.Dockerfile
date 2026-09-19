# ghcr.io/harnesys/host — the host API, run from sources on bun.
# Build context is the repo root: `docker build -f deploy/host.Dockerfile .`
FROM oven/bun:1-alpine
WORKDIR /app

ENV NODE_ENV=production

# Manifests first so `bun install` is a cached layer.
# The lockfile covers the whole workspace, so every workspace manifest must be present.
COPY package.json bun.lock ./
COPY packages/harnesys/package.json packages/harnesys/
COPY packages/studio-shared/package.json packages/studio-shared/
COPY apps/server/package.json apps/server/
COPY apps/webui/package.json apps/webui/
COPY apps/cli/package.json apps/cli/
COPY apps/desktop/package.json apps/desktop/
RUN bun install --frozen-lockfile

# Runtime sources: the server plus the workspace packages it imports.
# apps/server/assets must keep its repo position (SOURCE_ASSETS_DIR in
# apps/server/src/config/constants.ts resolves it) → /app/apps/server/assets here.
COPY apps/server/assets apps/server/assets
COPY apps/server/src apps/server/src
COPY packages/harnesys packages/harnesys
COPY packages/studio-shared packages/studio-shared

# /data is the machine home: config.json (with the auto-generated host.token),
# logs, workspace sqlite files. Persisted by the `harnesys-data` volume in compose.
ENV HARNESYS_HOME=/data
VOLUME /data

EXPOSE 47474
CMD ["bun", "apps/server/src/index.ts"]
