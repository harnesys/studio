# Реструктуризация apps/: cli / webui / server / desktop

Дата: 2026-09-19. Статус: одобрена в чате, реализация.

## Цель

Четыре каталога верхнего уровня в `apps/`, дев-запуск из корня репозитория, desktop (Tauri) минимально рабочий.

## Раскладка

| было | стало | артефакт |
|---|---|---|
| `apps/harnesys-cli` | `apps/cli` | `build/harnesys` |
| `apps/studio/server` | `apps/server` | `build/harnesys-host` |
| `apps/studio/client` + `apps/harnesys-web/src` | `apps/webui` (один пакет: UI-исходники + `server/` — бинарь статики/прокси/гейта) | `dist` + `build/harnesys-web` |
| `apps/studio/shared` | `packages/studio-shared` (имя пакета `@harnesys/studio-shared` не меняется — импорты не трогаются) | — |
| `apps/desktop` (темплейт) | остаётся; демо-фронт удаляется, подключение webui путями в `tauri.conf.json` | Tauri-оболочка |
| `apps/studio` (мета) | исчезает: `dev.ts` → `scripts/dev.ts`, AGENTS.md → `apps/AGENTS.md` | — |

Решения по развилкам (подтверждены хозяином): webui = UI + его сервер одним пакетом; имя `server` (не api/core); подключение desktop — пути в tauri.conf (`devUrl` 5173, `frontendDist` ../webui/dist), не симлинка.

## Корневой оркестр

- `workspaces`: `["packages/*", "apps/*"]`.
- Скрипты: `dev` (scripts/dev.ts: vite 5173 + `bun --watch` 3000), `dev:server`, `dev:webui`, `dev:desktop`, `db:generate| migrate|studio`; сборки `build:host|web|cli|client` — пути новые, имена команд прежние.
- Контракт рантайма не меняется: `client-dist` рядом с бинарём, ассеты `<bin>-<os>-<arch>`.

## desktop минимально

Удаляются демо-фронт темплейта (index.html, src/, public/, vite/tsconfig-конфиги, react-зависимости). Остаются `src-tauri/`, `tauri.conf.json` (build-блок на webui, заголовок окна Harnesys), package.json с `@tauri-apps/cli`. Наработки LangSwitcher (version-bump, иконки, настройки) — не в этом заходе.

## Механика

`git mv` (история сохраняется), один коммит `restructure: apps/{cli,webui,server,desktop}`. Правки ссылок: root package.json, tsconfig/biome цепочки, CLI `paths.ts`, литералы `apps/studio` в коде адаптеров/ассетов, `deploy/*.Dockerfile`, `docs/deploy.md`, `docs/features.md`, AGENTS-файлы. `bun install` обновляет lock.

## Проверка

`bun run lint`, `bun run typecheck`, `bun run build:host|web|cli|client`. Дев-процессы хозяина на 3000/5173 перезапускает он сам через `bun run dev` из корня.
