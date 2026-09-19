# Harnesys

Harnesys is a self-hosted studio for AI agents that work in real folders on your machine. An agent receives tools (files, shell, git, web search), automations (cron schedules, webhooks), memory and plugins; you run and observe it from an IDE-like web interface with chat. The agent library lives in `packages/harnesys`; the reference deployment is Studio, shipped as three binaries plus a macOS desktop app.

[![Release](https://github.com/harnesys/studio/actions/workflows/release.yml/badge.svg)](https://github.com/harnesys/studio/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/harnesys/studio)](https://github.com/harnesys/studio/releases)

## Components

| piece | role | default port |
|---|---|---|
| `harnesys-host` | host API: sessions, terminals, workspace control | `47474` |
| `harnesys-web` | static SPA plus a token-gated reverse proxy in front of the host | `8080` |
| `harnesys` | CLI supervisor: `up`, `down`, `status`, `restart`, `logs`, `update`, `host pair` | none |
| Harnesys.app | macOS desktop app (Apple silicon and Intel) with the host bundled as a sidecar | none |

Capability highlights: declarative agent graphs with subagents, budgets and HITL interrupts; 20 LLM providers with model autodiscovery; tool packs for files, shell, fetch, web search and LSP; cron and webhook automations; episodic, semantic and knowledge memory; Claude Code and open Agent Plugins formats; MCP servers over stdio, http and SSE; a built-in IDE with file explorer, Monaco editor, git control and terminals. The complete inventory with file references: [docs/features.md](docs/features.md).

## Install

### VPS or bare machine

```sh
curl -fsSL https://raw.githubusercontent.com/harnesys/studio/main/scripts/install.sh | sh
harnesys up --with-ui
```

The script downloads the three binaries from GitHub releases into `~/.local/bin` (env overrides: `HARNESYS_REPO`, `HARNESYS_PREFIX`). It ships binaries only, so the web UI additionally needs one of: a repo checkout with `bun run build:client`, the Docker stack, or the `client-dist.zip` release asset unpacked and passed as `STATIC_DIR`. Without one the menu continues host-only. Details: [docs/deploy.md](docs/deploy.md), section "Install on a VPS".

On Linux, `harnesys up --install-systemd` writes user units and enables them via `systemctl --user`.

To connect a second machine's browser: `harnesys host pair`, then enter the 6-digit code under **Connect a new host...** in that window.

### Docker compose

```sh
cp deploy/.env.example deploy/.env
docker compose -f deploy/docker-compose.yml up -d
```

Runs the host and the web proxy as two services with the SPA baked into the web image. Images are built locally from the checkout and tagged `ghcr.io/harnesys/{host,web}` for a future registry. The host generates `host.token` into the shared volume on first boot; the web gate picks it up automatically. Read it with `docker compose exec host cat /data/config.json`.

### Desktop (macOS)

Download `Harnesys_<version>_aarch64.dmg` (or the `x64` build) from the [releases page](https://github.com/harnesys/studio/releases), drag the app to Applications, launch from the tray. The host runs as a sidecar inside the app; Quit in the tray menu stops it.

The build is ad-hoc signed, so the first launch needs a bypass: right-click the app, choose Open, or run `xattr -cr /Applications/Harnesys.app`.

## Development

Requires [bun](https://bun.sh). From the repository root:

```sh
bun install
bun run dev            # host on 47474, Vite dev server on 5173
bun run dev:desktop    # desktop app against the dev servers
```

Production binaries compile to `build/`:

```sh
bun run build:client   # SPA -> apps/webui/dist
bun run build:host     # -> build/harnesys-host
bun run build:web      # -> build/harnesys-web
bun run build:cli      # -> build/harnesys
bun run build:desktop  # DMG via scripts/build-desktop.ts
```

Checks: `bun run lint` (biome), `bun run typecheck` (all workspaces). Releases: `bun run release <version>` bumps the desktop manifests, commits, pushes the `v<version>` tag; CI builds binaries, the client bundle and the DMGs, then publishes the release.

## Repository layout

| path | contents |
|---|---|
| `packages/harnesys` | agent library: definitions, compiler, run engine, packs, memory, plugins |
| `packages/studio-shared` | shared client/server types |
| `apps/server` | host API (Bun + Hono), SQLite via drizzle, presets |
| `apps/webui` | SPA (React, Vite) and the `harnesys-web` gateway |
| `apps/cli` | the `harnesys` supervisor |
| `apps/desktop` | Tauri 2 app wrapping the host |
| `deploy/` | Docker compose stack and TLS notes |
| `docs/` | [deploy.md](docs/deploy.md), [features.md](docs/features.md) |

## Status

Early software. The desktop build is not notarized, macOS Gatekeeper applies the bypass above, and the public API of `packages/harnesys` can still change between minor versions. Repo conventions for agents and contributors: [AGENTS.md](AGENTS.md).
