# ghcr.io/harnesys/host — the host API, run from sources on bun.
# Build context is the repo root: `docker build -f deploy/host.Dockerfile .`
FROM oven/bun:1-alpine
WORKDIR /app

ENV NODE_ENV=production

# Manifests first so `bun install` is a cached layer.
# The lockfile covers the whole workspace, so every workspace manifest must be present.
COPY package.json bun.lock ./
COPY packages/harnesys/package.json packages/harnesys/
COPY apps/studio/package.json apps/studio/
COPY apps/studio/shared/package.json apps/studio/shared/
COPY apps/studio/server/package.json apps/studio/server/
COPY apps/studio/client/package.json apps/studio/client/
COPY apps/harnesys-web/package.json apps/harnesys-web/
COPY apps/harnesys-cli/package.json apps/harnesys-cli/
RUN bun install --frozen-lockfile

# Runtime sources: the server plus the workspace packages it imports.
# apps/studio/assets must keep its repo position relative to the server sources:
# bundled skills/presets resolve as import.meta.dir/../../../../assets from
# apps/studio/server/src/adapters/store → /app/apps/studio/assets here.
COPY apps/studio/assets apps/studio/assets
COPY apps/studio/server apps/studio/server
COPY apps/studio/shared apps/studio/shared
COPY packages/harnesys packages/harnesys

# /data is the machine home: config.json (with the auto-generated host.token),
# logs, workspace sqlite files. Persisted by the `harnesys-data` volume in compose.
ENV HARNESYS_HOME=/data
VOLUME /data

EXPOSE 3000
CMD ["bun", "apps/studio/server/src/index.ts"]
