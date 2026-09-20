# Deploy

How to put harnesys on a machine: build from a checkout, install on a VPS with the
CLI, or run the Docker compose stack. For local development see the repository
README — this document is about deployments only.

The system has three binaries:

| binary | role | listens on |
|---|---|---|
| `harnesys-host` | host API: sessions, terminals, workspace control | `47474` (env `PORT`) |
| `harnesys-web` | static SPA + token-gated reverse proxy in front of the host | `8080` (env `WEB_PORT`) |
| `harnesys` | CLI supervisor: `up`, `down`, `status`, `restart`, `logs`, `update`, `host pair` | — |

State lives in the machine home `~/.harnesys/` (env `HARNESYS_HOME`): `config.json`
(host identity, auto-generated `host.token`, registered nodes), `run/*.pid`, `logs/*.log`.

## Build from a checkout

Requires [bun](https://bun.sh). From the repository root:

```sh
bun install
bun run build:client   # vite build of the SPA → apps/webui/dist
bun run build:host     # → build/harnesys-host
bun run build:web      # → build/harnesys-web
bun run build:cli      # → build/harnesys
```

All artifacts land in `build/` (gitignored). `build/` is exactly where the CLI
looks for its sibling binaries when run from a checkout.

## Install on a VPS

### Install script

```sh
curl -fsSL https://raw.githubusercontent.com/harnesys/studio/main/scripts/install.sh | sh
```

The script downloads `harnesys`, `harnesys-host`, `harnesys-web` from GitHub
releases (assets named `<bin>-<darwin|linux>-<x64|arm64>`, the same contract
`harnesys update` uses) into `~/.local/bin` and makes them executable. No prompts;
component selection happens in the CLI menu on first run.

Env overrides: `HARNESYS_REPO` (default `harnesys/studio`) and
`HARNESYS_PREFIX` (default `~/.local/bin`).

If no release is published yet the script fails with a 404 — cut one with
`bun run release <version>` from the repo root (clean working tree required):
it bumps the version across the desktop manifests, commits, tags `v<version>`
and pushes; CI builds and publishes the release with the assets below.

### First start

```sh
harnesys                 # interactive menu: Server / WebUI (+ systemd question on Linux)
harnesys up --with-ui    # non-interactive: start both, waits for health, prints ok
```

Useful flags and commands (all verified against `harnesys help`):

```sh
harnesys up [--with-ui] [--port N] [--web-port N]   # start; ok only after /health + /healthz
harnesys down                                       # stop both, remove pidfiles
harnesys status                                     # table: component / pid / port / state
harnesys restart [server|webui|all] [--port N] [--web-port N]
harnesys logs [-f] [server|webui]                   # tail or follow ~/.harnesys/logs
harnesys host pair [--port N]                       # pairing code for another machine
```

Defaults: host port `47474`, web port `8080`. `up` waits up to 15 s for the host
`GET /health` and the web `GET /healthz`; on failure it stops the process and
prints the last log lines. Restart reuses the ports and the web `STATIC_DIR`
recorded in the pidfiles — it refuses instead of guessing when no state exists.
Components registered as systemd units are restarted via `systemctl --user`;
`status` marks them `running (systemd)` and `down` stops the units.

A note for install-script VPS installs: the installer ships the three binaries
only — no built SPA. `up --with-ui` (and the menu's WebUI choice) therefore
errors/warns there: the WebUI needs a repo checkout (`bun run build:client`), the
Docker compose stack (`deploy/`), or the `client-dist.zip` release asset —
download it, unpack and point `STATIC_DIR` at the unpacked `dist` directory.
Without one of these the menu offers to continue host-only.

### systemd (Linux)

```sh
harnesys up --install-systemd --port 47474 --web-port 8080
```

Writes two user units (`harnesys-host.service`, `harnesys-web.service`) to
`~/.config/systemd/user/` (honours `XDG_CONFIG_HOME`) and runs
`systemctl --user daemon-reload` + `systemctl --user enable --now …`. Units set
`Restart=on-failure` and `WantedBy=default.target`; they pass the resolved
`HARNESYS_HOME`, `PORT`, `WEB_PORT`, `UPSTREAM` and `STATIC_DIR` to the binaries.

On macOS the same command prints the unit files with a "systemd is unavailable"
warning instead of installing them.

### Pairing: connect another machine

The host UI token is generated on first start into `~/.harnesys/config.json`
(`host.token`). To connect a second machine's UI:

```sh
harnesys host pair
pairing code: 431811
expires at 2026-09-19T09:46:11.512Z (in 10 min)
```

Enter the 6-digit code in the other machine's window under **Connect a new
host…** — the code redeems once and hands that window the host credential.

## TLS and proxies

The host token travels over HTTP (Bearer header, pairing, gate cookie). On the
public internet TLS is mandatory. Options that work today:

- **Tailscale / WireGuard** — private network, no public exposure at all.
- **Caddy or nginx in front of the web service** (`https://vps.example.com` →
  `127.0.0.1:8080`) — TLS termination plus the web token gate.
- **Hosting panels** (Coolify, Dokploy) — ingress pointing at the web service.

Buffering warning: the host streams Server-Sent Events on `GET /api/desk/watch`.
The host sends `X-Accel-Buffering: no`, but verify that an external reverse
proxy does not buffer that route (nginx: `proxy_buffering off` for the location
or honour the header; panels: disable response buffering for the web service).
A buffering proxy delays live UI updates.

`POST /login` (the gate form endpoint) is unauthenticated by design — guessing a
UUID token is impractical — and v1 has no rate limiting on it.

## The web UI gate

The web service does not expose the host API anonymously. Every path (SPA,
`/api`, websockets) requires the host token:

- **Browser:** first visit shows a token page — paste the `host.token`
  (`~/.harnesys/config.json` on the host, or
  `docker compose exec host cat /data/config.json` in the compose stack).
  Success sets an `HttpOnly` cookie (`SameSite=Lax`, path `/`).
- **API clients:** send `Authorization: Bearer <host.token>` — no cookie needed.

`GET /healthz` on the web service is the only unauthenticated endpoint (for
wait-loops and healthchecks).

## Docker compose

The compose stack runs the host and the web proxy as two services with the SPA
baked into the web image. From the repository root:

```sh
cp deploy/.env.example deploy/.env   # PORT, WEB_PORT, PUBLIC_URL, UPSTREAM
docker compose -f deploy/docker-compose.yml up -d
```

- Images: `ghcr.io/harnesys/host`, `ghcr.io/harnesys/web` (built locally until a
  registry exists). Build context is the repository root.
- Healthchecks: host `GET /health`, web `GET /healthz` (GET only — anything else
  hits the gate). `web` starts after `host` is healthy.
- Token: the host generates `host.token` in `/data/config.json` on first boot;
  the web service reads it from the same volume, so the gate matches
  automatically. Read it with:
  `docker compose exec host cat /data/config.json`
- Persistence: the `harnesys-data` volume keeps the machine home (`config.json`,
  logs) — data survives `down`/`up` recreation as long as the volume stays
  mounted. Workspace node folders are **not** in that volume: they live in
  bind-mounted host folders registered in `config.json` (`host.nodes`) — see the
  commented `./workspaces:/workspaces` example in the compose file; registered
  node paths must point inside such a mount.
- Skills/presets (`apps/server/assets`) are baked into the host image.
- The web service needs no public host port for the API: `PORT` publishes the
  host API (used by pairing from other machines), `WEB_PORT` publishes the UI.

## Updates

- CLI-managed VPS: `harnesys update` — downloads the newest release assets for
  your OS/arch, replaces the binaries in place, restarts what was running. The
  asset names are the same `<bin>-<os>-<arch>` contract the installer uses.
- Desktop: in-app auto-update (checks GitHub Releases on every start; installs
  on restart). See [updater.md](updater.md) for the key handling and the
  release flow. deb installs are the exception — update them by downloading the
  new package from the releases page.
- Checkout install: `git pull && bun install && bun run build:client && bun run
  build:host && bun run build:web && bun run build:cli`, then `harnesys restart all`.
- Compose: `git pull`, then `docker compose -f deploy/docker-compose.yml up -d --build`.

## Desktop

Desktop installers live on the GitHub releases page, cut by a `v*` tag: DMG
for macOS (Apple silicon and Intel), NSIS `-setup.exe` for Windows (x64 and
ARM64), AppImage and deb for Linux (x64). The `harnesys-host` binary ships
inside each app as a sidecar — no separate host install; Quit in the tray
menu stops it on exit.

Installed apps update themselves: on startup they fetch a signed `latest.json`
manifest from the releases page and offer the update (toast + Settings →
Update, with an auto-update toggle). Key handling and the release flow are in
[updater.md](updater.md).

The build is ad-hoc signed (no Developer ID yet), so the first launch needs a
bypass: right-click the app → Open, or `xattr -cr /Applications/Harnesys.app`.
