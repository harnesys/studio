# Multi-workspace implementation sequence

> **For agentic workers:** This is a **master sequence**, not a bite-sized task plan. Before starting a phase, write a detailed plan under `docs/superpowers/plans/` for that phase only (writing-plans), then execute it. Do not implement later phases «заодно».

**Goal:** Довести продукт от текущего одного `studio.db` + `/w/:id/...` до стола с несколькими workspace-node, `workspace.db` в каталоге, `config.json`, URL фокуса и упаковки host/window.

**Architecture:** Сначала клиентский стол и URL на существующем API (быстрая ценность, меньше тёмного периода). Затем явная адресация ноды и split settings. Затем persist ноды + `config.json`. Затем разделение процессов и multi-host из packaging. Shared-агенты и mesh sync после этого контура.

**Tech Stack:** Studio client (React Router, Zustand), Studio server (Bun), SQLite, `~/.harnesys/config.json`, позже Tauri / CLI / Docker.

**Specs:**

- `docs/superpowers/specs/2026-09-17-multi-workspace-desk-design.md`
- `docs/superpowers/specs/2026-09-17-workspace-node-design.md`
- `docs/superpowers/specs/2026-09-16-packaging-federation-design.md`

## Global Constraints

- Тесты `*.test.ts` / `*.spec.ts` временно запрещены (`AGENTS.md`); приёмка фазы: ручная проверка в браузере / agent-browser по явному разрешению, lint/typecheck.
- Публичный API библиотеки `packages/harnesys` не менять без отдельного согласования.
- Общей БД между нодами нет; providers/plugins/presets целево на ноде.
- Packaging `host.token` отдельным файлом: выровнять на `config.json` в фазе persist/host (node-спека побеждает имена файлов реестра).
- Desk-спека побеждает packaging UX по табам: toggle без shift/control.

---

## Карта зависимостей

```text
Phase 0  sidebar UX polish (частично уже в дереве)
    ↓
Phase 1  desk URL + selection + park          ← desk-spec
    ↓
Phase 2  settings split (window page / node modal)  ← node-spec UI
    ↓
Phase 3  config.json + registry API           ← node-spec persist (машина)
    ↓
Phase 4  workspace.db per node + migration    ← node-spec persist (нода)
    ↓
Phase 5  host/window process split + auth     ← packaging
    ↓
Phase 6  pairing + multi-host in window       ← packaging
    ↓
Phase 7  packaging artifacts (Tauri, CLI, Docker)  ← packaging
    ↓
Later    shared agents / mesh sync            ← out of scope specs
```

Фазы 0–2 можно вести на **одном** server process и одном физическом store, если API уже принимает `workspaceId` явно. Фаза 4 — жёсткий разрез данных. Фазы 5–7 не начинать до рабочего `config.json` и понятного node id.

---

## Phase 0 — Sidebar UX (дожать текущий задел)

**Specs:** packaging UX сайдбара + desk (toggle).

**Зачем первым:** уже начато в клиенте; замыкает мокап без ломки URL/persist.

**Сделать:**

- Табы workspace: click = toggle, без shift/control (desk-спека).
- Группы в секциях по selection; Inbox; меню ⋯ / New workspace форма (host → name → folder) в пределах текущего API.
- Не тащить сюда новые роуты и не split db.

**Готово когда:** мультиселект табов и группы секций соответствуют мокапу на живом стенде; selection пока может жить в localStorage.

**Детальный план:** при старте фазы, если объём ещё большой; иначе короткое выполнение по desk/packaging UX.

---

## Phase 1 — Desk: URL, selection, park

**Spec:** `2026-09-17-multi-workspace-desk-design.md`

**Зачем до node.db:** стол и deep link перестают врать про «один workspace в path»; бэкенд пока тот же.

**Сделать:**

- Роуты `/:workspaceId/{kind}/...` (thread, file, diff, schedule, webhook, spawn); `/`; `/settings` пока как есть или тонкий stub.
- Редиректы со `/w/...`; убрать origin query.
- Selection + park: visible desk из включённых workspace; toggle off паркует; deep link делает `selection.add`.
- Gate не home: `/` = стол (пустой или с selection).
- IDE-табы schedule/webhook как поверхности; spawn в URL.
- Канон: primary thread automation → redirect на schedule/webhook URL.

**Готово когда:** приёмка desk-спеки (кроме финальной привязки settings к node-модалке — фаза 2). Reload сохраняет selection/park.

**Не делать:** physical `workspace.db`, pairing, Tauri.

---

## Phase 2 — Settings split

**Spec:** `2026-09-17-workspace-node-design.md` (Settings UI)

**Зависит от:** Phase 1 (стол без gate; есть стабильный workspace/node id в UI).

**Сделать:**

- `/settings` только Window: Profile, Appearance, Chat (+ позже реестр hosts).
- Модалка workspace settings (nav General / Capabilities / Data) от **конкретного** workspace id.
- Футер Settings → только `/settings`.
- Пункты Capabilities пока бьют в существующие API с `workspaceId` (даже если store ещё общий).

**Готово когда:** приёмка settings из node-спеки на уровне UI; нет смешанного nav на одной странице.

**Не делать:** обязательный split sqlite в этой фазе.

---

## Phase 3 — `config.json` и реестр нод

**Spec:** node-spec Persist (машина)

**Зависит от:** Phase 2 желательна (куда класть UI реестра); минимально — Phase 1.

**Сделать:**

- `~/.harnesys/config.json`: секции `host` / `window` (listen, token, nodes[], desk selection и т.д.).
- Server/host читает локальные ноды из `host.nodes`, не сканирует диск как source of truth.
- Create workspace дописывает node в `host.nodes` и создаёт каталог `.harnesys/` (db может ещё быть общим или заготовкой файла — явно решить в детальном плане фазы: либо сразу пустой `workspace.db` schema, либо путь + всё ещё studio.db до фазы 4).
- Client desk chrome: selection/park из `window.desk` (миграция с localStorage).

**Готово когда:** список локальных workspace переживает рестарт через `config.json`; token в том же файле.

**Согласование с packaging:** заменить упоминания `host.token` файла на `config.json` в packaging-спеке отдельным маленьким PR/правкой доки в этой фазе.

---

## Phase 4 — `workspace.db` на ноду + миграция

**Spec:** node-spec Persist (нода)

**Зависит от:** Phase 3 (`host.nodes` знает path).

**Сделать:**

- Domain store: `<workspace>/.harnesys/workspace.db`.
- Миграция с текущего `studio.db`: данные по `workspaceId` → файлы нод; providers/plugins/presets → в db каждой ноды (правило копирования/разрезания — в детальном плане).
- API host маршрутизирует запрос к store ноды по id.
- Ignore `/.harnesys/` в шаблонах/доке.

**Готово когда:** две локальные ноды имеют разные providers/данные; падение/удаление одной db не убивает другую; приёмка persist node-спеки.

**Риск:** самый тяжёлый этап. Детальный план обязателен до кода; возможны подфазы 4a schema+API dual-read, 4b cutover, 4c delete studio.db.

---

## Phase 5 — Host / Window process split

**Spec:** packaging-federation (архитектура процессов)

**Зависит от:** Phase 3–4 (иначе sidecar не знает, какие db поднимать).

**Сделать:**

- Разные процессы: host (API, WS, tickers) и window (UI static / Tauri webview).
- Window → host по HTTP+WS с token из `config.json`.
- Запрет раздачи `client/dist` из host-процесса (как в packaging).

**Готово когда:** UI закрыт — host жив; UI ходит только через API+token.

---

## Phase 6 — Pairing и multi-host в окне

**Spec:** packaging-federation (компоненты, inbox)

**Зависит от:** Phase 5.

**Сделать:**

- Реестр hosts в `window` секции; pair flow; online/offline.
- Стол selection нод с разных host; API calls на host владельца ноды.
- Inbox агрегация с доступных host.

**Готово когда:** приёмка packaging «два хоста в реестре…» в части окна/host (без обязательного dmg).

---

## Phase 7 — Артефакты упаковки

**Spec:** packaging-federation (упаковка, приёмка install)

**Зависит от:** Phase 5; Phase 6 желательна для полного сценария.

**Сделать:** Tauri macOS → CLI `harnesys` → Docker compose; web static отдельно.

**Готово когда:** критерии упаковки packaging-спеки по выбранному носителю (можно резать на 7a dmg, 7b CLI, 7c compose).

---

## Later (не в этой последовательности)

- Shared-агенты между нодами.
- Mesh sync конфигурации.
- Tunnel кнопкой из UI.
- Полный онбординг-обучение.

---

## Порядок написания детальных планов

| когда | файл плана (имя-ориентир) |
|---|---|
| старт Phase 1 | `docs/superpowers/plans/YYYY-MM-DD-desk-url-selection-park.md` |
| старт Phase 2 | `…-settings-window-vs-node-modal.md` |
| старт Phase 3 | `…-config-json-registry.md` |
| старт Phase 4 | `…-workspace-db-migration.md` (с подфазами) |
| старт Phase 5+ | `…-host-window-split.md`, `…-pairing-multi-host.md`, `…-packaging-artifacts.md` |

Phase 0 можно закрыть без отдельного файла, если остаток мал; иначе `…-sidebar-toggle-groups.md`.

---

## Самопроверка последовательности

| требование спеки | фаза |
|---|---|
| toggle / park / URL / spawn / automation surfaces | 1 |
| gate не home | 1 |
| settings window vs node modal | 2 |
| `config.json` host/window | 3 |
| `workspace.db` в каталоге | 4 |
| process split, pairing, inbox multi-host, dmg/cli/docker | 5–7 |
| shared / mesh | Later |

Параллелить Phase 7 с доработкой Phase 6 на разных людях можно только после стабильного Phase 5.
