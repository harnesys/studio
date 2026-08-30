# ROADMAP

Версии пакета `harnesys` (semver). SoT контракта библиотеки: `docs/01`–`docs/23`. Этот файл задаёт релизы и milestones для врезки в Studio.

Статус до **1.0.0**: RFC. Breaking допустим до **0.3.0** (engine freeze). После **0.3.0** frozen surface только расширяется; rename/remove = major.

## Правило Studio

Studio полностью переписывается под публичный контракт Harnesys из `docs/01`–`docs/22`. Типы и потоки chat/runtime в Studio = `RuntimeState`, Snapshot, `SessionEvent`, `AgentRun`, `Command`, `approved`, permissions/paths.

В Harnesys не добавляют compatibility-слой под старый Harnyx (`ThreadHandle`, journal entry shapes, `shared/transcript` Harnyx-эпохи). В Studio не держат мапперы `SessionEvent` ↔ старый transcript, Snapshot ↔ старый journal, `createRuntime` ↔ `createHarnyx`. Host реализует `RuntimeState.load` / `commit` и UI читает `SessionEvent` / events напрямую (или хранит их же байты).

Старые данные Harnyx journal / dual-runtime / one-shot migrator journal→Snapshot в план не входят. Cutover = новый persist и UI-контракт на схемах Harnesys; прежние threads вне поддержки на ветке cutover.

Studio в монорепо: `apps/studio` (layout FSD / Clean Architecture).

### `apps/studio/harnesys-stub` (временный)

Назначение: единственное, чтобы Studio **компилировалась**, пока нет `packages/harnesys` ≥0.3. Chat/runtime в stub = no-op.

**Не референс для библиотеки.** При реализации `packages/harnesys` не копировать из stub: имена (`Harnyx`, `ThreadHandle`, `Journal`, `agent()` / `thread()`), форму типов (`any`, index signatures), порядок API и семантику journal/HITL. SoT только `docs/`. Stub удаляют или заменяют зависимостью на пакет после freeze/cutover; до этого Studio всё равно обязана уйти на нативные типы docs, а не закрепить stub-формы в продукте.

## Цели

1. **Engine freeze на 0.3.0.** После тега наращивать фичи без переписывания `RuntimeState`, graph API, session/`AgentRun`.
2. **Studio native cutover ≤ 0.5.0.** Chat-путь Studio вызывает `createRuntime` / `rt.session` и говорит языком docs `04`, `12`, `20`.
3. Docs `01`–`22` закрыть к **1.0.0**; `23-later.md` остаётся backlog вне ядра.

Критерий cutover (chat): session + HITL + tools/actions + models + host `RuntimeState`. Graph editor, spawn UI, memory-as-core не входят.

## Frozen surface (с 0.3.0)

| Поверхность | Docs | После freeze |
|---|---|---|
| `RuntimeState`, Snapshot, cursor phases, `intent` / `recorded`, `idempotencyKey` | `04` | только additive fields |
| `createRuntime` + middleware `GuardDecision`; порядок permissions → middleware | `05`, `14` | новые optional keys ок |
| `defineAgent`, Expr/slots/edges, stdlib nodes v1 (`core:*`, `llm:generate`, `tool:call`, `control:assign` / `goto` / `interrupt`) | `02`, `03`, `09`–`12` | новый `type:` только по правилу `01` |
| `RunResult`, `Command`, HITL wire `approved` | `12` | новые variants = minor+ |
| `rt.session`, `AgentRun`, `SessionEvent`, busy/HITL guards | `20` | union только расширяется |
| Permissions gate, paths ∩ | `14`, `15` | новые operation strings ок |

Вне freeze на 0.3 (позже или как plugins registry):

- `13` spawn / handoff / budget
- `16`–`19` actions / skills / MCP / artifacts (нужны к 0.4 для Studio; контракт двигателя не ломают)
- `21` fixtures; полный catalog `22` (envelope layout RFC до 1.0; session projection уже freeze)
- всё из `23-later.md`
- memory / compaction / schedules / webhooks: host Studio, без API memory в ядре

## Карта версий

| Ver | Docs | Deliverable | Gate |
|---|---|---|---|
| **0.1.0** | `01`–`05` | types, `defineAgent`, Expr, `InMemoryRuntimeState`, `createRuntime` skeleton | compile; unit на Snapshot / `commit` sequence |
| **0.2.0** | `06`–`11` | models, `tool()`, validate/compile/check, `run`/`start`, `llm:generate`, `tool:call`, assign/goto | hello-world: llm → tool → end |
| **0.3.0** | `12`, `14`, `15`, `20` | interrupt, `RunResult`/`Command`, permissions, paths, session/`AgentRun` | **ENGINE FREEZE**; ask → respond → done; crash → load → resume |
| **0.4.0** | `16`–`19`, `22` | `harnesys/actions`, skills, MCP, artifacts, events; Studio spike на тех же типах | spike: UI/server импортирует `SessionEvent` / Snapshot без mapper-модуля |
| **0.5.0** | host Studio | persist = Snapshot+events; registry = `createRuntime`; threads/composer/transcript на native API | **STUDIO CUTOVER** |
| **0.6.0** | `13` | spawn / handoff / budget, host `task` | multi-agent graph tests |
| **0.7.0** | `21`, gaps `08` | examples/fixtures, validate codes, uncertain_effect | regression harness для freeze |
| **0.8.0** | host Studio | schedules/webhooks tools, memory assemble на Harnesys-пути, optional compaction hook | product depth без API memory в ядре |
| **0.9.0** | optional / slice `23` | `inspect`, mermaid, `eventsToSpans`, typed helpers у `tool()` | DX; WorkItem/repair/deadline остаются backlog |
| **1.0.0** | stable | breaking = major; `01`–`22` done или явно в `23` | announce stable |

Patch: баги внутри minor. Pre-0.3 breaking ок (RFC). Post-0.3 breaking только major + запись в docs.

```
0.1 skeleton
  → 0.2 executable graph
    → 0.3 ENGINE FREEZE (session + HITL + policy)
      → 0.4 plugins + Studio spike (native types)
        → 0.5 STUDIO CUTOVER (native persist + UI)
          → 0.6 spawn
          → 0.7 fixtures
          → 0.8 Studio host depth
          → 0.9 DX helpers
            → 1.0 stable
```

## 0.1.0 каркас

Файлы: `01-boundaries`, `02-agent-definition`, `03-expr-slots-edges`, `04-runtime-state`, `05-create-runtime` (типы + middleware shapes, без полного executor).

- Публичные типы Snapshot / Event envelope stub / `CommitKind`
- `InMemoryRuntimeState` для тестов
- `defineAgent` + сериализация plain JSON
- `createRuntime({ … })` принимает wiring; `run`/`start` могут быть not-implemented до 0.2

Gate: пакет собирается; повторный `commit` с тем же `sequence` = upsert/ignore.

## 0.2.0 исполняемый граф

Файлы: `06-models`, `07-tools`, `08-validate-compile-check`, `09-graph-core`, `10-tool-call`, `11-control-assign-goto`.

- ProviderConfig / ModelsPort, binding модели агента
- `tool()` + `sideEffect` → intent/recorded
- `compile` / `check` и коды ошибок
- `run` / `start`, `llm:generate` (один вызов модели на узел), stream batch (`STREAM_CHUNK_*`)
- `tool:call` fixed + batch, `control:assign`, `control:goto`

Gate: граф llm → tool → end на InMemory; `ai` SDK не в public exports.

## 0.3.0 ENGINE FREEZE

Файлы: `12-hitl-run-result`, `14-permissions`, `15-paths`, `20-session` (+ middleware behavior из `05`).

- `control:interrupt`, `RunResult`, `Command` (`resume` / `reject` / `cancel`)
- Permissions map + `DEFAULT_PERMISSIONS`; paths allow ∩ cwd
- `rt.session` → `send` / `resume` → `AgentRun` (`stream`, `respond`, `reject`, `cancel`)
- SessionEvent: `text-delta` | `tool` | `ask` | `done` | `error`
- Guards: `ThreadBusyError`, `PendingHitlError` (как в `20`)

Gate:

1. Permission/approve ask → `respond({ approved })` → continue → `done`
2. Snapshot `needs_input` → новый процесс → `session({ state })` → `resume`
3. Frozen surface зафиксирован таблицей выше

После тега **0.3.0** изменения frozen surface без major запрещены. Этот контракт Studio обязана принять as-is.

## 0.4.0 Studio-ready surface

Файлы: `16-actions`, `17-skills`, `18-mcp`, `19-artifacts-attachments`, `22-events`.

- `files` / `shell` / `fetch` / `askUser` (имена tools совместимы с прежним набором Harnyx actions)
- SkillRegistry, Cursor MCP JSON / McpRegistry, reload hooks
- ArtifactStore + fold крупных payload
- Event catalog для `start`/`commit`; live UI опирается на `SessionEvent` (`20`), audit на catalog `22`

Studio spike (ещё не cutover):

1. Dependency на `harnesys`
2. Экран/серверный путь импортирует `AgentRun` / `SessionEvent` из пакета
3. InMemory: agent + `ask_user` + permission ask + stream до `done`
4. `shared/transcript` (или наследник) переписывается на union `SessionEvent`; отдельного mapper-файла нет

Gate: spike компилируется; chat loop на InMemory; grep по Studio spike не находит `harnyx` в runtime path и не находит `*mapper*` для SessionEvent/Snapshot.

## 0.5.0 STUDIO CUTOVER

Перепись Studio host/wire под frozen API. Ядро уже 0.3+.

### Что меняется в Studio

| Было (Harnyx) | Станет | Где |
|---|---|---|
| `createHarnyx` | `createRuntime` | workspace registry |
| `AgentHandle` / `ThreadHandle` | `rt.session` / `AgentRun` | thread runtime |
| journal entries + reconcile helpers | `RuntimeState` + Snapshot + events (`04`, `22`) | sqlite store / новый schema |
| send / resume / respond / cancel | те же имена поверх `AgentRun` (`20`) | `application/threads` |
| `files` / `shell` / `fetch` / `askUser` | `harnesys/actions` | tools list |
| MCP / skills loaders | передача в `createRuntime({ mcp, skills })` | существующие FS/JSON loaders можно оставить как host IO |
| ModelsPort / `discoverModels` | контракт `06` | models port |
| `memory` в createHarnyx | host assemble / tools; поля memory нет у runtime | wire-memory |
| transcript / desk events под journal | UI на `SessionEvent` (+ при необходимости raw events) | client widgets chat |

### Cutover gate

1. Persist пишет Snapshot + events; `load` возвращает Snapshot | null (`04`)
2. Registry: actions + MCP + skills + models; `agents.resolve` из Studio agent store
3. Thread open: `load` → `session(agent, { state })`; cold start = пустой state
4. Chat path без зависимости `harnyx` и без mapper-модулей runtime↔UI
5. HITL: wire `approved`; paths = workspace cwd ∩ allow
6. Сценарий: send → tool ask → approve → complete; restart процесса → `resume` с `needs_input`
7. Клиентский transcript рендерит `SessionEvent` напрямую

Scope 0.5: graph editor, spawn UI, WorkItem queue (`23`) не входят. Прежние Harnyx threads не переносятся.

## 0.6.0 spawn / handoff

Файл: `13-spawn-handoff-budget`.

- `control:spawn` barrier `policy: 'all'`, handoff, budget
- Host tool `task` через `rt.run` + `state.child`
- Studio: `agents.resolve` для child; UI multi-agent необязателен

Gate: тесты spawn + cancel ветки (`Command.cancel` + `spawnId`).

## 0.7.0 fixtures

Файл: `21-examples` + полнота кодов `08`.

- Канонические definition из docs
- Golden validate/compile
- Crash после `intent` → `unknown` / `uncertain_effect`

Gate: CI гоняет fixtures против InMemory.

## 0.8.0 Studio host depth

Без API memory в ядре (`01`, `23`).

- Schedules / webhooks как host tools на Harnesys registry
- Pin / semantic / knowledge assemble через Studio ports
- Optional compaction notify: middleware / `afterRun`

Gate: Studio flows (кроме graph editor) на Harnesys path с теми же native типами, что в 0.5.

## 0.9.0 DX

Из `23-later.md` только additive helpers:

- `inspect`, mermaid visualize
- `harnesys/observability` (`eventsToSpans`)
- optional typed helper рядом с `tool()` (ядро на JsonSchema)

Backlog после 0.9 / post-1.0: WorkItem `runWork`, `barrier.policy` `any` | `n-of-m`, Command `deadline` / `repair` / `signal`, `envelopeVersion` для эволюции Snapshot внутри Harnesys (не миграция Harnyx→Harnesys), MCP schema pin.

## 1.0.0 stable

1. Frozen surface без breaking с 0.3.0
2. Studio chat path: только Harnesys types; `harnyx` runtime убран
3. `01`–`22` реализованы или явно в `23` с причиной
4. Public semver: breaking = major
5. `ai` / `@ai-sdk/*` не в public exports

В ядро не переносим (`23`): Nest-сценарии, memory/embeddings as core, публичный AI SDK `LanguageModel` / `tool()` наружу, CLI UX как продукт.

## Соответствие docs → первая версия

| Docs | Первая версия |
|---|---|
| `01`–`05` | 0.1 |
| `06`–`11` | 0.2 |
| `12`, `14`, `15`, `20` | 0.3 (freeze) |
| `16`–`19`, `22` | 0.4 |
| Studio native cutover | 0.5 |
| `13` | 0.6 |
| `21` | 0.7 |
| Studio schedules/memory depth | 0.8 |
| optional DX / часть `23` | 0.9 |
| stable policy | 1.0 |
| остаток `23` | post-1.0 |

Порядок номеров в `docs/README.md` ≈ порядок внедрения. ROADMAP фиксирует релизы, freeze, и правило native Studio поверх того же порядка.
