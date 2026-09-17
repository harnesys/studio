# Packaging artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Собрать носители host/window: Tauri macOS (sidecar host), CLI `harnesys`, Docker compose. Host always-on без окна. Критерий ROADMAP «первый ход за 3 минуты» / полный онбординг не входит.

**Architecture:** Три артефакта из packaging-спеки, данные как после Phase 4b: `~/.harnesys/config.json` + каталоги нод с `workspace.db`. `harnesys-web` раздаёт `client/dist` и проксирует `/api` `/ws` на host. Desktop не использует web: webview → loopback host. CLI оборачивает pair/start из Phase 6.

**Tech Stack:** Tauri 2, `bun build --compile`, Docker, systemd user units.

**Spec:** `docs/superpowers/specs/2026-09-16-packaging-federation-design.md` (упаковка, приёмка install без онбординга-обучения).

**Sequence:** Phase 7. Параллель с доработкой Phase 6 допустима после стабильного Phase 5.

## Global Constraints

- Тесты запрещены. Приёмка носителя: ручная установка; lint/typecheck репо.
- Не тащить Windows msi / Linux AppImage / brew cask, пока нет живого macOS dmg (спека: после живого macOS).
- Не тащить tunnel кнопку, mesh, раннеры B.
- Первый workspace = форма Phase 0 на пустом столе, не мастер из ROADMAP.
- Не стартовать чужие демоны; packaging собирать в репо.

---

## File map

| путь | ответственность |
|---|---|
| `apps/studio/server/src/index.ts` | entry `harnesys-host` |
| `apps/harnesys-web/` или `apps/studio/web/` | static + reverse proxy |
| `apps/harnesys-cli/` | `up` `down` `logs` `update` `host pair` |
| `apps/studio/src-tauri/` | sidecar, tray, autostart, single-instance |
| `deploy/docker-compose.yml` | `host` + `web` |
| `.env.example` | `PORT`, `PUBLIC_URL`, token via config/env |
| systemd unit templates в CLI | `harnesys-host`, `harnesys-web` |

Имена пакетов держать рядом с `apps/studio`; не выносить в `~/` вне репо.

---

## Types / CLI

```text
harnesys up [--with-ui] [--port 3000] [--web-port 8080]
harnesys down
harnesys logs
harnesys update
harnesys host pair
harnesys up --install-systemd
```

Env overlay в тот же schema `config.json`: `PORT` / `PUBLIC_URL` / token подставляют `host.listen` / `host.publicOrigin` / `host.token`, не второй формат файлов.

Docker volumes: `config` home + bind workspace paths (не один anonymous volume «все данные в studio.db»). Документировать: пользователь монтирует папки нод.

---

### Task 1: `harnesys-host` compile

**Files:** `package.json` script `bun build --compile apps/studio/server/src/index.ts --outfile harnesys-host`

Только API, WS, tickers, sqlite. Миграции drizzle при старте ноды (как bootstrap сейчас). `/health`. Не включать `client/dist`.

- [ ] **Commit** `feat: compile harnesys-host binary`

---

### Task 2: `harnesys-web`

Маленький Bun/Hono entry: `serveStatic(client/dist)`, proxy `/api` и `/ws` на `UPSTREAM` (default `http://127.0.0.1:3000`). Нужен VPS и Docker. Desktop не бандит этот бинарь в Tauri.

- [ ] **Commit** `feat: harnesys-web static and api proxy`

---

### Task 3: CLI `harnesys`

Команды из спеки. Pidfiles/logs в `~/.harnesys/`. `up` ждёт `/health` прежде чем печатать ok. TTY без флагов: меню порт/режим; флаги или нет TTY: неинтерактивно.

`host pair`: вызывает `POST /api/host/pair/start` на local host (credential из config) и печатает 6 цифр + TTL.

`up --install-systemd`: два user unit, `enable --now`.

- [ ] **Commit** `feat: harnesys CLI supervisor`

---

### Task 4: Tauri macOS aarch64

`src-tauri`: sidecar `binaries/harnesys-host-<triple>`, capability `shell:allow-execute` sidecar true. Старт host на setup, останов host **не** на close окна (tray «Quit» останавливает оба). Порт и home через env/args.

Webview грузит Vite-build, API base loopback sidecar. Плагины: tray (открыть стол, счётчики running/awaiting из host API), autostart `MacosLauncher::LaunchAgent`, single-instance, opener.

`.dmg` bundler. Подпись/notarization: слот в CI, не блокировать локальный unsigned build для dogfood.

Credential: Tauri injects Bearer (читает `config.json` window section), не Vite plugin.

- [ ] **Commit** `feat: tauri window with harnesys-host sidecar`

---

### Task 5: Docker compose

Сервисы `host` и `web`. Image names как в спеке (`ghcr.io/harnesys/host`, `web`) когда появится registry; до этого build local.

Env: `PORT`, `PUBLIC_URL`, `UPSTREAM`. Token: файл/env → `host.token` в смонтированном `config.json`. Healthcheck `/health`.

Volumes: home (`config.json`, logs) **и** явные пути workspace (документация в compose comments). Не обещать один volume как полный persist нод.

- [ ] **Commit** `feat: docker compose host and web`

---

### Task 6: Docs install

Packaging приёмка install: dmg открывает окно без терминала, host жив после закрытия окна, autostart после ребута (macOS). VPS: CLI `up --with-ui`. Compose: два сервиса, данные переживают recreate **если** volumes смонтированы.

Не включать «незнакомый человек, 3 минуты, первый агент».

- [ ] **Commit** `docs: packaging install paths`

---

## Приёмка Phase 7 (выбранный носитель)

Можно резать 7a dmg, 7b CLI, 7c compose. Для каждого:

- Host жив без окна.
- Window ходит с credential.
- Ноды = `workspace.db` в папках из `host.nodes`.
- `bun run lint` / `typecheck` репо.

Windows/Linux desktop и brew — после живого macOS, отдельный план не здесь.
