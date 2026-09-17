# Multi-workspace implementation sequence

> **For agentic workers:** This is a **master sequence**, not a bite-sized task plan. Before starting a phase, write a detailed plan under `docs/superpowers/plans/` for that phase only (writing-plans), then execute it. Do not implement later phases «заодно».

**Goal:** Довести продукт от одного `studio.db` + `/w/:id/...` до стола с несколькими workspace-node, `workspace.db` в каталоге ноды, `config.json`, URL фокуса и упаковки host/window.

**Architecture:** Клиентский стол и явная адресация ноды раньше физического разреза. `config.json` раньше `workspace.db`. Файлы нод и N node-runtime раньше process split. Локальный host того же протокола, что pairing. Shared/mesh — Later.

**Tech Stack:** Studio client (React Router, Zustand), Studio server (Bun), SQLite per node, `~/.harnesys/config.json`, позже Tauri / CLI / Docker.

**Specs:**

- `docs/superpowers/specs/2026-09-17-multi-workspace-desk-design.md`
- `docs/superpowers/specs/2026-09-17-workspace-node-design.md`
- `docs/superpowers/specs/2026-09-16-packaging-federation-design.md`

## Global Constraints

- Тесты `*.test.ts` / `*.spec.ts` временно запрещены (`AGENTS.md`); приёмка: ручная проверка / agent-browser по разрешению, lint/typecheck.
- Публичный API `packages/harnesys` не менять без согласования. Перед Phase 4 подтвердить: порты не предполагают единственный global store; редизайн ядра «под ноды» заранее не открывать.
- Общей БД между нодами нет. Host в URL не добавлять.
- Desk-спека побеждает packaging по табам: toggle без shift/control.
- Node-спека побеждает packaging по именам: `config.json`, `workspace.db` (не отдельный `host.token` файл, не один `studio.db`).
- Документы-спеки правятся **в фазе, которая отменяет их текст**, маленьким PR (см. «Синхронизация документов»).

---

## Инварианты (закрыть до / в Phase 1–3)

Иначе Phase 5–6 переписывают URL, реестр и auth.

### Id ноды

- Id **глобально уникален**; назначает **host**, который регистрирует ноду. Окно id не выдаёт.
- URL остаётся `/:workspaceId/{kind}/...` (desk-спека). Host в path нет.
- Окно резолвит ноду через `nodeId → host` в данных `window.hosts` (после появления hosts). Selection, park, deep link ключуются этим id.
- Если id уникален только внутри одного `studio.db`, два host в одном окне дадут коллизии. Не допускать.

### Каталог нод

- Источник правды локальных нод: **`host.nodes`** в `config.json`.
- Окно список нод не держит как правду: ходит в API host, кэш опционален.
- `window.desk` хранит **selection и park** (и dirty в park), не инвентарь нод.
- Имя ноды уникально **на одном host**, не во вселенной (два «Shop» на разных машинах ок).
- Таблица `workspaces` в `studio.db` и `host.nodes` не живут как два source of truth после Phase 3: каталог = `host.nodes`. В `workspace.db` **нет** таблицы всех workspace машины.

### Файл `workspace.db`

- Открывает **только host-процесс**. Окно видит ноду через HTTP/WS.
- После Phase 5 sidecar и webview не дерут один sqlite.

### Копия папки ≠ та же нода

- Регистрация / adopt на host всегда **новый id**.
- Domain-строки с `workspaceId` при adopt: переписать под новый id, либо колонка в файле ноды не несёт каталог соседей.
- iCloud / копия репо не становятся федерацией сами по себе.

### Inbox и события

- Источник awaiting: **одна нода**. Merge по selection делает **окно**.
- Transport: API host-владельца ноды.
- `deskEvents`: подписка по node id, соединение по host; не глобальная шина на весь `studio.db`.
- Phase 1: один host, N логических нод. Phase 6: fan-out по `window.hosts`.

### Public origin

- URL вебхука / публичный ingress строятся от **origin host-владельца**, не от `window.location` Vite/Tauri.
- Phase 1: запрет клеить origin из окна. Реализация публичного listen — Phase 5–6.

### Секреты

- После разреза ключ в secret store именуется с **node id**; доступ у host-процесса. Окно в keychain не ходит.

---

## Карта зависимостей

```text
Phase 0  sidebar UX (toggle, группы)
    ↓
Phase 1  desk URL + selection + park + inbox/events contract
    ↓
Phase 2  window /settings only (Profile, Appearance, Chat)
    ↓
Phase 3  config.json + host.nodes + lifecycle + desk in window.desk
    ↓
Phase 3b workspace settings modal (General / Capabilities / Data UI)
    ↓
Phase 4a logical isolation (providers/plugins/presets → node id; FS plan)
    ↓
Phase 4b workspace.db + N node-runtime + cutover (restart)
    ↓
Phase 5  process split; window.hosts size 1 (same auth as Phase 6)
    ↓
Phase 6  pairing expands window.hosts; multi-host inbox
    ↓
Phase 7  packaging artifacts (no ROADMAP onboarding criterion)
    ↓
Later    shared agents / mesh / tunnel UI / full onboarding
```

Клиентский стол (0–1) раньше persist. Phase 3 раньше тяжёлой модалки domain и раньше Phase 4. Физический разрез (4) раньше process split (5). Phase 5 = первый host того же протокола, что Phase 6.

---

## Phase 0 — Sidebar UX

**Specs:** packaging UX сайдбара + desk (toggle).

**Сделать:**

- Табы: click = toggle, без shift/control.
- Группы в секциях по selection; меню ⋯; New workspace форма (host → name → folder) на текущем API.
- **Doc sync:** packaging UX — убрать shift/control, отсылка к desk-спеке.

**Готово:** мокап на стенде; selection может ещё быть в localStorage.

**Не делать:** новые роуты, split db, destructive delete «как в node General».

---

## Phase 1 — Desk: URL, selection, park, контракт inbox/events

**Spec:** desk-design.

**Сделать:**

- Роуты `/:workspaceId/{kind}/...`; `/`; редиректы с `/w/...`; без origin query.
- Selection + park; deep link = `selection.add`; gate не home.
- IDE: schedule / webhook поверхности; spawn в URL; automation thread → redirect.
- **Inbox/events:** клиент и API ориентированы на per-node списки + merge в окне по selection. Не один join «весь studio.db → /inbox» как финальный контракт.
- **Webhook URL в UI:** не брать origin из `window.location` (запрет; публичный origin позже).

**Готово:** приёмка desk-спеки (settings модалка ноды — не эта фаза). Reload: selection/park.

**Не делать:** `workspace.db`, pairing, Tauri, store-приёмка node-спеки.

---

## Phase 2 — Window `/settings` only

**Spec:** node-design Settings (часть Window).

**Сделать:**

- `/settings`: Profile, Appearance, Chat. Футер → только это.
- Убрать domain-категории с page settings (или не показывать).
- Реестр host **не** рисовать даже заглушкой (Phase 6).
- **Не расширять** host-global domain API.

**Готово:** смешанного nav на одной settings-странице нет.

**Не делать:** приёмку «модалка пишет только в store ноды»; destructive General; Capabilities как правду изоляции.

---

## Phase 3 — `config.json`, каталог, lifecycle

**Spec:** node-design Persist (машина).

**Сделать:**

- `~/.harnesys/config.json`: `host` (listen, token, nodes[]), `window` (hosts[] заготовка/local, desk: selection **и** park).
- **`host.nodes` = единственный каталог** локальных нод. Прекратить считать таблицу `workspaces` source of truth (миграция чтения/записи в детальном плане; dual source до конца Phase 3 закрыть).
- Create: host назначает id; path уникален на этом host; запись в `host.nodes`.
- Lifecycle (минимум):

| операция | смысл |
|---|---|
| убрать из окна | selection; нода на host жива |
| path пропал | в реестре, статус unavailable, не auto-delete |
| create | host назначает id |
| adopt папки с `.harnesys/` | **новая** регистрация, новый id (не тот же id) |

- Снять с host / удалить данные: UI можно набросать, **destructive удаление db+каталог** — критерии Phase 4 (отдельное confirm).
- Desk chrome: selection/park из `window.desk` (миграция с localStorage).
- **Doc sync:** packaging `host.token` → `config.json`; Docker/CLI: volume думает о config + позже путях нод.
- Писатели (задел Phase 5): host-процесс владеет секцией `host`, window — `window`; host не мутирует `window.desk`. Пока один процесс — соблюдать контракт секций в коде записи.

**Готово:** рестарт поднимает ноды из `host.nodes`; scan диска не source of truth; id выдаёт host.

---

## Phase 3b — Модалка workspace settings

**Spec:** node-design Settings (модалка ноды).

**Зависит от:** Phase 3 (`host.nodes`, lifecycle).

**Сделать:**

- Модалка от конкретного node id: General / Capabilities / Data (как agent nav).
- General: имя, путь, id; убрать из окна; снять с host (stop + вон из `host.nodes`) без обязательного wipe файлов.
- Capabilities пока бьют API с node id; изоляция bag — Phase 4a (UI не врать в приёмке store).

**Готово:** входы settings соответствуют node-спеке; destructive wipe данных — только с confirm и после/в Phase 4.

**Приёмка store «пишет только в свою db»** — не эта фаза.

---

## Phase 4a — Логическая изоляция каталогов (вход в разрез)

**Spec:** node-design владение; инвариант автономной ноды.

**Зачем до копирования файлов:** пока providers/plugins/presets host-global, UI и Phase 4b будут угадывать чей bag.

**Сделать:**

- API: providers, models, mode presets, plugin installs адресуются **id ноды** (не host-мешок с `enabledWorkspaceIds` как моделью).
- План FS (ещё можно без полного move):

| слой | целевое |
|---|---|
| bundled skills/presets приложения | read-only overlay на каждую ноду |
| `~/.harnesys/skills`, `presets` | не live после cutover; seed в ноду при create/cutover |
| `~/.harnesys/plugins`, `plugins-data`, `marketplaces` | установка на ноде (`<workspace>/.harnesys/...`), не enable на host |
| уже в `<workspace>/.harnesys/` (skills, mcp.json, …) | оставить |
| llm_providers / models / mode_presets без workspaceId | копия bag в каждую существующую ноду на cutover, дальше расходятся |

- Content-addressed кэш плагинов на host не вводить.
- Согласование библиотеки: порты без assumption одного global store.

**Готово:** две ноды на одном host не делят один writable providers/plugins bag на уровне API; приёмка UI «своя нода» честна относительно API.

---

## Phase 4b — `workspace.db` + N node-runtime + cutover

**Spec:** node-design Persist (нода); packaging always-on.

**Сделать:**

- `<workspace>/.harnesys/workspace.db`; в файле ноды нет каталога всех workspace.
- Host = **супервизор N node-runtime** (store, ticker, MCP, indexer, watcher, LSP на ноду). HTTP к store по id — следствие. Опереться на `WorkspaceHarnesysRegistry` / runtime-per-workspace; меняется владение sqlite, не «тикеры на старом файле + HTTP на новом».
- Domain с `workspaceId` → файл своей ноды; host-global каталоги **копируются** в каждую ноду на cutover; host-global FS перестаёт быть runtime-слоем; bundled overlay остаётся.
- **Cutover:** останов host → перенос → старт. Горячий dual-write двух sqlite на живых run не делаем. Dual-read только как временный мост разработки, не модель cutover.
- Снять с host / удалить данные (db + опционально каталог) с отдельным confirm.
- **Doc sync:** ROADMAP/packaging: один `studio.db` → N `workspace.db` + пути; бэкап; Docker монтирует каталоги нод + `config.json`.

**Готово:** две ноды = два файла и два runtime; крон/HITL ноды A не закрывают run B; приёмка persist node-спеки.

---

## Phase 5 — Process split; `window.hosts` размера 1

**Spec:** packaging (процессы); auth как у Phase 6.

**Сделать:**

- Host и window — разные процессы. Dev как prod: Vite = window, bun server = host; статика не из host (`dev.ts` / server не раздают `client/dist` как целевая модель).
- Один механизм auth: `window.hosts[]` с credential; локальная запись (loopback) появляется здесь (или дописывается в Phase 3 как hosts[0]). Отдельного loopback-протокола нет.
- `host.token` в секции host = кто может звать API; `window.hosts[].credential` = чем окно представляется. Для local сначала копия/та же тайна по правилам детального плана.
- Писатели `config.json`: host пишет только `host`, window только `window`; атомарная запись — в детальном плане.
- `workspace.db` только у host-процесса.

**Готово:** UI закрыт — host жив; окно только HTTP/WS + credential; тот же контур, что расширит Phase 6.

---

## Phase 6 — Pairing; multi-host

**Spec:** packaging (pairing, inbox).

**Сделать:**

- Pairing добавляет строки в `window.hosts` (не второй auth).
- Online/offline; стол selection нод с разных host; API на host владельца.
- Inbox/events: fan-out merge окна по selection (контракт Phase 1).
- Публичный origin host для webhook URL в UI.

**Готово:** два host в реестре, офлайн одного не блокирует другой; HITL на VPS при закрытом окне ноутбука.

---

## Phase 7 — Артефакты упаковки

**Spec:** packaging (dmg / CLI / compose).

**Сделать:** Tauri macOS → CLI → Docker; host always-on без окна.

**Не тащить:** критерий ROADMAP «незнакомый человек, первый ход за 3 минуты» / полный онбординг (Later). Первый workspace = форма Phase 0 на пустом столе.

**Готово:** поставка выбранного носителя; host жив после закрытия окна.

Параллель 7 ∥ доработка 6 допустима после стабильного Phase 5 (тот же клиентский контур auth).

---

## Later

- Shared-агенты, mesh sync, tunnel из UI, полный онбординг, подход B (раннеры).

---

## Синхронизация документов (по фазам)

| фаза | правка чужого канона |
|---|---|
| 0 / 1 | packaging UX: toggle, не shift/control |
| 3 | packaging: `host.token` файл → `config.json` |
| 4 | packaging/ROADMAP: `studio.db` → `workspace.db` + N путей; бэкап; Docker volumes |
| 5 | packaging/ROADMAP: вычеркнуть «два процесса с одной базой» |

Иначе агент на Phase 5–7 прочитает packaging как канон и вернёт мешок.

---

## Порядок детальных планов

| старт | файл-ориентир |
|---|---|
| Phase 1 | `…-desk-url-selection-park.md` |
| Phase 2 | `…-window-settings-only.md` |
| Phase 3 | `…-config-json-registry-lifecycle.md` |
| Phase 3b | `…-workspace-settings-modal.md` |
| Phase 4a | `…-node-catalog-isolation.md` |
| Phase 4b | `…-workspace-db-runtime-cutover.md` |
| Phase 5+ | `…-host-window-split.md`, `…-pairing-multi-host.md`, `…-packaging-artifacts.md` |

---

## Самопроверка

| требование | фаза |
|---|---|
| инварианты id / каталог / db только host / adopt = новый id | до 3, текст здесь |
| toggle, park, URL, spawn, automation | 1 |
| inbox/events merge окна | 1 (контракт), 6 (fan-out) |
| window `/settings` | 2 |
| `config.json`, `host.nodes`, lifecycle | 3 |
| модалка ноды UI | 3b |
| изоляция providers/plugins API | 4a |
| `workspace.db` + N runtime + cutover | 4b |
| process split, hosts[0] | 5 |
| pairing, multi-host | 6 |
| dmg/cli/docker | 7 |
| shared / mesh / onboarding | Later |

Недостающее с прошлой версии последовательности закрыто: инварианты; runtime в Phase 4; инверсия плагинов/FS; inbox contract; lifecycle; Phase 5 = тот же протокол, что 6; cutover рестартом; приёмка store не в Phase 2.
