# ghcr.io/harnesys/web — token-gated reverse proxy serving the built client SPA.
# Build context is the repo root: `docker build -f deploy/web.Dockerfile .`

# Stage 1: build the client SPA (the same build `bun run build:client` runs locally:
# `tsc -b && vite build` in apps/webui).
FROM oven/bun:1-alpine AS client-build
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/harnesys/package.json packages/harnesys/
COPY packages/studio-shared/package.json packages/studio-shared/
COPY apps/server/package.json apps/server/
COPY apps/webui/package.json apps/webui/
COPY apps/cli/package.json apps/cli/
COPY apps/desktop/package.json apps/desktop/
RUN bun install --frozen-lockfile

# The SPA build compiles against packages/studio-shared (vite alias) and imports the
# `harnesys` workspace package, so both sources must be present.
COPY apps/webui apps/webui
COPY packages/harnesys packages/harnesys
COPY packages/studio-shared packages/studio-shared
RUN cd apps/webui && bun run build

# Stage 2: runtime — the web proxy from sources, with the built SPA as static assets.
FROM oven/bun:1-alpine
WORKDIR /app

ENV NODE_ENV=production

COPY package.json bun.lock ./
COPY packages/harnesys/package.json packages/harnesys/
COPY packages/studio-shared/package.json packages/studio-shared/
COPY apps/server/package.json apps/server/
COPY apps/webui/package.json apps/webui/
COPY apps/cli/package.json apps/cli/
COPY apps/desktop/package.json apps/desktop/
RUN bun install --frozen-lockfile

COPY apps/webui/server apps/webui/server
COPY --from=client-build /app/apps/webui/dist /srv/dist

# STATIC_DIR: the copied SPA. UPSTREAM: the compose `host` service on its fixed
# container port (see compose — the host container always listens on 3000).
# HARNESYS_HOME: the shared /data volume — the web gate reads `host.token` from
# /data/config.json, which the host generates on first boot.
ENV STATIC_DIR=/srv/dist \
    UPSTREAM=http://host:3000 \
    WEB_PORT=8080 \
    HARNESYS_HOME=/data
VOLUME /data

EXPOSE 8080
CMD ["bun", "apps/webui/server/index.ts"]
