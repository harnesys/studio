# Capability Set Implementation Plan

> **For agent workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax to track progress.

**Goal:** Одна чистая функция `resolveCapabilitySet` становится единственным решением о доступности (источники → grant → overrides → режим → песочница), ран агента не умирает от отказа операции, `tools`-allowlist удалён из всех слоёв.

**Architecture:** Три плоскости по спеке: реестр рана (`RunRegistry` с exposure и provenance на запись), грант (агент называет только источники; вычитание через `disabledTools`/overrides), экспозиция (`load_tools` повышает только members набора рана). Движок не знает паков/плагинов. Studio composition-root зовёт резолвер и для рана, и для каталогов (`agents_list`, spawn roster, handoff, explain). Ошибки spawn/handoff становятся per-call результатами.

**Tech Stack:** TypeScript strict, Bun workspaces (`packages/harnesys`, `apps/studio/{server,client,shared}`), drizzle+SQLite, Hono, React 19 + zod + react-hook-form, biome (root config + plugin `lint/plugins`), agent-browser для ручной проверки.

**Spec:** `docs/superpowers/specs/2026-09-15-capability-set-design.md` — модель, сценарии S1–S5, приёмка R1–R7, D1-каскады; здесь только разбивка. Перечитана после ревью 2026-09-15; инвентарь правок в конце файла.

## Факты разведки (не перепроверять, верить коду на 2026-09-15)

- `def.tools` allowlist: `packages/harnesys/src/domain/agent-definition.ts:67`; закрытый фильтр `application/tool-registry.ts:32-60`; диагностика `tool_unreachable` `application/agent-identity.ts:47-56`; сборка identity `resolveAgentIdentity` (тот же файл, строки 35-66): baseRegistry ∪ enabled pack tools → `filterToolsForAgent` → service tools поверх (`LOAD_TOOLS_NAME`, `registerPackSkillTool` определён `packs/pack-run.ts:231`, вызывается там же в `buildPackRun`-обвязке 212/264 и в `agent-identity.ts:59`).
- Имена инструментов в нодах: `application/llm.ts:133` `resolved = node.tools ?? []` → `resolveProgressiveTools(resolved, ctx.toolRegistry, loaded)` (:137); диагностика `tools_unresolved` по снапшотам нод `application/check.ts:35-51`; `map`-нода тоже несёт `tools` (assist preset `assistant.json:131-135`).
- Pack gating: `application/packs/registry.ts:77-83` (`enabledConfig`: absence/`null`/`false` = выключен), `buildPackRun` `packs/pack-run.ts:59+`; base-паки `files/shell/fetch` авто-регистрируются в universe, `application/create-runtime.ts:84-86` (без assignment не выдают ничего).
- Exposure: `ToolDefinition.exposure?: 'always' | 'deferred'` (`ports/tools.ts:43,67`); `deferredPacks` встречается в 8 файлах: `ports/create-runtime.ts`, `ports/run-targets.ts`, `application/run-engine-types.ts:35,55`, `application/run-engine-prepare.ts`, `application/create-runtime.ts:156,181,224`, `application/session.ts:34,151`, `application/packs/pack-run.ts` (6 мест), `application/agent-identity.ts:32,42`; прогрессивный показ `application/tools/exposure.ts` (`resolveProgressiveTools`, `loadedToolsOf`, проверка `=== 'deferred'`), `tools/create-load-tools-tool.ts` берёт из реестра без замка.
- Spawn: `agents_spawn` fail-fast по каталогу (`packs/agents/create-agents-tools.ts:67-76, 109-110, 329-347`); нода `control:spawn` (`application/graph-spawn.ts:145-181`, throw `spawn_target_missing` :169/:176); реестр ребёнка `graph-spawn.ts:244` (`filterToolsForAgent(parent.toolRegistry, childDef)`), handoff-ребёнок `graph-handoff.ts:110`, oneshot-пути `create-runtime.ts:173,216`, сегменты `run-engine-prepare.ts:120,126`; рендер итогов: `SpawnResultItem {error?}` (graph-spawn.ts:31-57) → per-item событие `agent.failed` при `item.error` (`graph.ts:1180`), текст модели `appendSpawnResultsMessage` (`graph.ts:1231`); catch ветки `control:spawn` (`graph.ts:1220-1228,1244-1253`) ведёт к `run.failed`.
- Handoff: `packs/agents/handoff-target.ts`, `application/graph-handoff.ts:85-90` (тот же ростер).
- Host wiring: движок `apps/studio/server/src/composition/wire-runtime.ts:78-98` (`createToolRegistry([files(), shell(), fetch(), askUser(), mapTool(), wait()])`, `agents: { resolve: resolveAgentDefinition, list: listAgentRoster }`); ран-таргеты `adapters/studio-run-targets.adapter.ts` (`packs: registrations` все workspace :128-154, `deferredPackNames` :155, `effectivePlugins` :186 per-agent ∩ workspace); каталог-порт `adapters/capabilities/sqlite-agents-catalog.port.ts` (`list` подмешивает pluginAgents без агентного фильтра :66-69; `toAgentDefinition` пишет `capabilities`, не `packs` :211-226); ростер `adapters/workspace-harnesys.registry.ts:244-278`: `agents.list` в createRuntime включает warmPluginAgents (:250-259), `listAgentRoster` :272-278 = `listAll()` (без фильтра workspace! см. `sqlite-agent.repo.ts:26-28`), `resolveAgent` :281-287 с ':'-веткой; `warmPluginAgents` (:148-150) холодный до первого `get()/loadEnabledPlugins` (:288-291 комментарий).
- `ask_user`/`map`/`wait` фабрики живут в библиотеке (экспорт `harnesys`, импорт `wire-runtime.ts:1-15`); плагин-агенты: `pluginAgentCatalog` (`server/src/application/plugins/plugin-agents.ts`), id `plugin:agent`, граф `buildReactGraph(agent.definition.tools ?? [])` (:67); CC-frontmatter: `packages/harnesys/src/application/plugins/bind-agents.ts:40-41,94` (`definition.tools = mappedTools` по `CC_TOOL_ALIASES`), `standardAgentGraph(tools)` (:240).
- ДБ/миграции: колонка `agents.tools` (`server/src/domain/agent.port.ts`, `adapters/store/sqlite/schema/agents.ts`, `repos/sqlite-agent.repo.ts`); материализация `adapters/store/sqlite/closed-world-materialization.ts` (маркер `closed_world_materialization_v1` в живой базе уже стоит, файл no-op); `update-agent.use-case.ts:128-137,176-177` (tools/capabilities независимы, graph пересобирается при tools); `is-stock-react-graph.ts:7-11` (сверка think.tools со снапшотом); create: `create-agent.use-case.ts:130,147` (`buildReactGraph(tools)`).
- Wire/UI: `server/src/adapters/http/agent/agent.body.ts:150,173` (поле `tools`), `:12` (mode `packs: string[]`); shared `apps/studio/shared/src/agent.ts:49`, `shared/src/modes.ts:14-22` (`AgentMode.packs?: string[]`); клиент `features/manage-agent/ui/{draft-capabilities,agent-config-category-panes,agent-mode-editor}.tsx`, `model/{capability-allowlist,draft-capabilities}.ts`, zod `ui/agent-mode-fields.ts:17`.
- Пресеты `apps/studio/assets/presets/agents/*.json` (10 файлов) несут `tools` (coder.json:122) и снапшоты `tools` в llm/map-нодах графа (coder.json:36, assistant.json:43-89,131-135,210-253); `assistant.json:13-27` = 13 capabilities без `core`.
- Паки бэкенда: `server/src/composition/wire-packs.ts:84` `createPackRegistrations`; lib-паки `packages/harnesys/src/packs/{files,shell,agents,plan,memory,scheduler,threads,web,webhook,lsp}` + `base.ts` (fetch); `SkillRegistry` — порт `ports/skills.ts`, хост даёт `hx.skills` (FsSkillRegistry+plugin).
- Ворота: тесты запрещены; `bun run lint && bun run typecheck` в корне; дев-стенд хозяина 3000/5173 (не трогать).

## Global Constraints

- Тесты запрещены (AGENTS.md): никаких `*.test.ts`/vitest/playwright. Ворота таска: `bun run lint && bun run typecheck` в корне + точечные стенд/curl/smoke-проверки, где указано. Временные файлы smoke — в `temp/` монорепо или `~/.harnesys/tmp`, не в системных tmp.
- D1/D2/D5/D6: удаление allowlist'а полное, без shim'ов, commented-out и backward-совместимых полей.
- Типы именованные, без `T['field']` и `Parameters<typeof fn>[0]` (biome plugin в корне).
- Файлы ~300 строк ориентир; новый слайс/хук только под фактического потребителя.
- Клиент FSD: импорт слайсов снаружи только через `index.ts`.
- Публичный API библиотеки меняется строго по объёму спеки (п.3–7); всё в тасках уже согласовано там.
- Порядок линеен: T1–T3 additive (потребители не переключены), T4–T5 переключение host, T6–T7 удаление каскадом (break), T8–T9 миграции/UI, T10 приёмка. Коммит в конце каждого таска.
- Кэш effective-набора осознанно отложен: `resolveCapabilitySet` вызывается заново на каждый ран/каталог (studio-run-targets.resolve и так свежий на claim), `configRevision`-инвалидация вводится отдельной задачей только при измеренной необходимости (правка спеки п.4 внесена).

---

### Task 1: Библиотека: типы `capability-set.ts` и чистая функция резолва (additive)

**Files:**
- Create: `packages/harnesys/src/application/capability-set.ts`
- Modify: `packages/harnesys/src/domain/agent-definition.ts` (`PackAssignment` принимает override-форму)
- Modify: `packages/harnesys/src/ports/tools.ts` (`exposure?: 'always'|'deferred'` → `'direct'|'deferred'`, все обращения `=== 'deferred'` не меняются, грепом `'always'` остаётся только `bind-monitors` — его не трогать)
- Modify: `packages/harnesys/src/index.ts` (экспорты)

**Interfaces:**
- Consumes: `buildPackRun` (`packs/pack-run.ts`), `enabledConfig` (`packs/registry.ts`), `AgentRosterEntry`, `SkillRegistry` (`ports/skills.ts`).
- Produces (используют T2,T4,T5,T6,T7):
  - `type CapabilitySource = string` (`'pack:<name>' | 'plugin:<name>' | 'mcp:<server>' | 'host'`)
  - `type ToolExposure = 'direct' | 'deferred'`
  - `type RunToolEntry = { def: ToolDefinition; exposure: ToolExposure; source: CapabilitySource }`
  - `type RunRegistry = Map<string, RunToolEntry>`
  - `type ExplainEntry = { item: string; kind: ExplainKind; source: CapabilitySource; status: ExplainStatus; reason: string }`
  - `type CapabilitySet = { registry: RunRegistry; skills: string[]; mcpServers: string[]; hooks: HookBinding[]; subagents: AgentRosterEntry[]; notes: LlmNoteProvider[]; pathEntries: PathEntrySpec[]; explain: ExplainEntry[]; fatal: string[] }`
  - `type CapabilityUniverse = { registrations: PackRegistration[]; baseRegistry: Map<string, ToolDefinition>; roster: AgentRosterEntry[]; pluginSubagents: AgentRosterEntry[]; fsSkills?: SkillRegistry; mode?: ModeCapabilityFields }`
  - `type ModeCapabilityFields = { packs?: string[]; disabledTools?: string[]; exposure?: Record<string, ToolExposure> }` (T7 расширяет формат mode-assign)
  - `function resolveCapabilitySet(def: AgentDefinition, universe: CapabilityUniverse): CapabilitySet`
  - `type PackOverride = { spec?: PackConfig; disabledTools?: string[]; exposure?: Record<string, ToolExposure> }`

- [ ] **Step 1:** Реализовать `resolveCapabilitySet`: старт `registry` = весь `universe.baseRegistry` (entries `source:'host'`, `exposure:'direct'`; host-тулы грантятся автоматом, это контракт `createRuntime({tools})` сценария S1); для каждого включённого assignment-источника (`enabledConfig`-семантика) брать `pack.create().tools`, entry `{def, exposure: def.exposure ?? 'direct', source:'pack:<name>'}`; plugin-тулы приходят в `baseRegistry` хоста с `group:'plugin:<name>'` — при выключенном `enabledPlugins[name]` вычесть их и внести explain `disabled`; применить overrides источника (`disabledTools` вычитает + explain `disabled`, `exposure` меняет флаг); `def.disallowedTools` вычесть; режим: `mode.packs` вне — пометить `deferred` (preload-сужение), `mode.disabledTools` вычесть (explain `dropped-by-mode`); `mcpServers`-фильтр по `def.mcpServers` (group-not-in-list ⇒ вычесть, explain `denied-by-universe` если сервера нет вовсе); `subagents = universe.roster ∩ pluginSubagents(только enabled plugins родителя)` + delegate-видимость по `parentId === def.id`; `skills` = declared ∩ (fsSkills-каталог + pack/plugin skills), `load_skill`-регистрация остаётся за `registerPackSkillTool`-логикой, но source-разметку отдаёт explain. Legacy-мост: пока `def.tools !== undefined`, пересекать по нему и писать explain `denied-by-universe` (удаляется в T6 вместе с полем). `fatal`: неизвестный источник; `disabledTools`-имя вне выхода источника; режим, включающий выключенное агенту.
- [ ] **Step 2:** `normalizePackAssignment` (`packs/registry.ts`) принимает `PackOverride`-форму; `PackConfig` без новых ключей не меняется.
- [ ] **Step 3:** Экспорты из `src/index.ts`.
- [ ] **Step 4:** `bun run lint && bun run typecheck` зелёные, ни один потребитель не переключён.
- [ ] **Step 5:** Commit `feat(harnesys): resolveCapabilitySet pure function with provenance`.

### Task 2: Библиотека: core pack

**Files:**
- Create: `packages/harnesys/src/packs/core/index.ts`
- Modify: `packages/harnesys/src/packs/index.ts`, `packages/harnesys/src/index.ts`
- Modify: `packages/harnesys/src/application/capability-set.ts`

**Interfaces:**
- Consumes: `askUser()`, `mapTool()`, `wait()` (экспорты `harnesys`), `LOAD_TOOLS_NAME` (`application/tools/exposure.ts`), `universe.fsSkills` (T1), skill-регистрация `packs/pack-run.ts:231` (`load_skill`).
- Produces: `coreCapability: Pack` (`meta.name='core'`, `meta.tools=['ask_user','map','wait','load_tools','load_skill']`, `create() → {tools:[askUser(), mapTool(), wait()]}`); `load_tools`/`load_skill` declare-only в meta: резолвер вставляет их в registry после сборки при включённом `core` (source `pack:core`, explain `granted`). Больше нигде service-тулы автоматически не добавляются (авто-добавление `LOAD_TOOLS_NAME` в `resolveAgentIdentity` помечено на удаление в T6).

- [ ] **Step 1:** Пак по образцу соседей (`packs/base.ts`, `packs/plan/index.ts`): без портов, без specSchema.
- [ ] **Step 2:** `resolveCapabilitySet`: при `def.packs?.core` включён → добавить `load_tools` (placeholder-def с `execute` из `createLoadToolsTool`, конструируется вызывающим кодом: резолвер принимает `makeLoadTools: (registry: RunRegistry) => ToolDefinition` в `CapabilityUniverse`, хост/`agent-identity` кладёт фабрики) и `load_skill` (при `universe.fsSkills !== undefined`).
- [ ] **Step 3:** Экспорт `coreCapability` из баррелей.
- [ ] **Step 4:** typecheck+lint зелёные (хост про core ещё не знает, поведения не меняется).
- [ ] **Step 5:** Commit `feat(harnesys): core pack for ask_user/map/wait/load_tools/load_skill`.

### Task 3: Библиотека: ошибки операций = результаты (spawn/handoff), scoped `AgentsResolve`

**Files:**
- Modify: `packages/harnesys/src/application/graph-spawn.ts` (`resolveTargets`, `executeSpawn` ~359-400)
- Modify: `packages/harnesys/src/application/graph.ts` (ветка `control:spawn` ~1138-1253)
- Modify: `packages/harnesys/src/packs/agents/handoff-target.ts`, `packages/harnesys/src/application/graph-handoff.ts`
- Modify: `packages/harnesys/src/ports/create-runtime.ts` (`AgentsResolve`), `application/run-engine-types.ts`

**Interfaces:**
- Consumes: `resolveAgentTarget`/`formatAgentTargets` (`agent-target-resolve.ts`), существующий `SpawnResultItem {agentId, ok?, output?, error?...}` (graph-spawn.ts:31-57) и рендер `appendSpawnResultsMessage` (`graph.ts:1231`) + per-item событие `agent.failed` (`graph.ts:1180`).
- Produces:
  - `prepareSpawn` возвращает `{ targets: SpawnTarget[]; denied: SpawnResultItem[] }` вместо throw по цели: denied-item = `{ agentId: call.agentId, spawnId, error: hit.error }`; denied кладутся в `results` до старта детей → текст с отказом попадает в «Spawn results» модели и в `agent.failed` событие (нового типа событий нет); `spawn_calls_shape`-throw остаётся codedRunError только на не-массив `calls` (это не агентская операция), пер-call shape-ошибки тоже становятся denied.
  - `AgentsResolve = { resolve: (id: string, parent?: AgentDefinition) => AgentDefinition | undefined; list?: (parent?: AgentDefinition) => AgentRosterEntry[] }`; все вызовы движка (graph-spawn.ts:151, handoff, discovery) передают `opts.agent`.
  - handoff-отказ: tool result `{ error, available: formatAgentTargets(visible) }` в контекст модели, ран остаётся текущему агенту; `codedRunError` в `graph-handoff.ts` только на целостность снапшота.

- [ ] **Step 1:** graph-spawn: convert-throw→denied, проверить порядок `results: new Array(targets.length)` (:390) — denied-элементы не сдвигают индексы (мержатся в output отдельным списком; зафиксировать тип `SpawnOutcome { ran: SpawnResultItem[]; denied: SpawnResultItem[] }` и рендерит оба `appendSpawnResultsMessage`).
- [ ] **Step 2:** Сигнатура `AgentsResolve` + правки всех вызовов внутри lib (`rg -n "agents.list?.\(\)" packages/harnesys/src` — graph-spawn, handoff, discovery-хелперы).
- [ ] **Step 3:** Handoff-path: существующие throw конвертировать в `{error}`-результат инструмента (протестировать тексты: та же функция `resolveAgentTarget` даёт строку `unknown spawn target ...`, идентичную tool-path — это сверяется в T10 R2).
- [ ] **Step 4:** Хост-адаптация сигнатуры: `wire-runtime.ts:96-98` → `resolve: (id, parent) => registry.resolveAgent(id, parent)`, `list: (parent) => registry.listScopedRoster(parent)`; в `workspace-harnesys.registry.ts`: `listScopedRoster(parent?: AgentDefinition)` = `repos.agents.listByWorkspace(workspaceIdOf(parent))` (НЕ `listAll()`: кросс-workspace-утечка текущей реализации убирается здесь) + `warmPluginAgents(ws).list()` с фильтром по `parent.enabledPlugins[name] === true`; `parent === undefined` → только DB-строки workspace родителя запроса; cold-cache контракт: вызывается внутри рана, `get(workspace)` уже прогревал IR (:118 комментарий `sqlite-agents-catalog.port.ts:85` не применим — здесь синхронный `warmPluginAgents`, допустим после первого `loadEnabledPlugins` в resolve() таргета; если кэш сброшен mid-run — plugin-записи просто отсутствуют в ростере, это не фатал).
- [ ] **Step 5:** `bun run lint && bun run typecheck` зелёные.
- [ ] **Step 6:** Стенд-smoke (agent-browser, port 5173/3000 хозяина): тред любого агента с `agents_spawn` → просим спавн на заведомо неизвестный id; ожидаем: ран `completed`, «Spawn results» содержит `unknown spawn target`, `sqlite3 ~/.harnesys/studio.db "select count(*) from run_events where run_id='<last>' and type='run.failed'"` = 0.
- [ ] **Step 7:** Commit `fix(harnesys): spawn/handoff denials return results; roster resolves per parent agent`.

### Task 4: Studio server: composition-root на `resolveCapabilitySet`; каталог per-agent

**Files:**
- Create: `apps/studio/server/src/application/capabilities/universe.ts` (`buildCapabilityUniverse(deps, workspace, parentDef?) → CapabilityUniverse`: `registrations` = effectiveRegistrations + coreCapability, `baseRegistry` = hx.tools (без askUser/map/wait после T6, пока с ними), `roster` = listByWorkspace, `pluginSubagents` = warmPluginAgents(ws).list(), `fsSkills` = hx.skills)
- Create: `apps/studio/server/src/application/capabilities/effective-plugins.ts` (перенос `effectivePlugins` из `studio-run-targets.adapter.ts:186`)
- Modify: `apps/studio/server/src/adapters/studio-run-targets.adapter.ts`
- Modify: `apps/studio/server/src/adapters/capabilities/sqlite-agents-catalog.port.ts`
- Modify: `apps/studio/server/src/adapters/workspace-harnesys.registry.ts`
- Modify: `apps/studio/server/src/composition/wire-packs.ts` (добавить `coreCapability` в `createPackRegistrations`)

**Interfaces:**
- Consumes: `resolveCapabilitySet` (T1), `coreCapability` (T2), `listScopedRoster` (T3).
- Produces: `buildCapabilityUniverse`; `RunTarget.toolRegistry` = полный эффективный реестр рана (entry → `ToolDefinition` с перенесённым флагом `exposure` того же словаря `'direct'|'deferred'`, переименованного в T1, без double-vocabulary).

- [ ] **Step 1:** `StudioRunTargets.resolve`: собрать universe → `const set = resolveCapabilitySet(agent, universe)`; `fatal.length` → таргет недоступен (null как существующие ранние выходы, текст в лог); `toolRegistry` = Map(entry.def с exposure-флагом); `packs`/`deferredPacks` обнулить до T6. Base-паки `files/shell/fetch` в `create-runtime.ts:84-86` остаются авто-регистрацией: это universe, не grant (решение ревью-пункта 6: закрытый грант без assignment ничего не даёт, S1 не течёт).
- [ ] **Step 2:** Каталог-порт: `list()` plugin-часть через `effectivePlugins(workspace, agentRepo.findById(scope.agentId)?.enabledPlugins)`; `toAgentDefinition` → вызвать общий `dbAgentDefinition` (закрывает B4 дублированием, а не копией); preview `tools` для `agents_list` не в порту (порт отдаёт definition), тул формирует список из `get(scope,row.id).tools` — оставить как есть до T6, где поле станет explain-registry.
- [ ] **Step 3:** `wire-runtime.ts:78-85`: base `createToolRegistry` без `askUser/map/wait` (даёт core-пак); `workspace-harnesys.registry.ts:246-247` `tools: [askUser(), mapTool(), wait()]` удалить.
- [ ] **Step 4:** typecheck+lint; стенд: тред Assistant → `ask_user` доступен (через core), `run_events` первого таска без `run.failed`; новый тестовый агент без capabilities → в модели нет pack-тулов (R1 частично).
- [ ] **Step 5:** Commit `refactor(studio-server): single capability resolver at composition root; per-agent plugin catalog`.

### Task 5: Библиотека: замок load_tools + каталог из набора рана

**Files:**
- Modify: `packages/harnesys/src/application/tools/exposure.ts`, `tools/create-load-tools-tool.ts`
- Modify: `packages/harnesys/src/application/run-engine-prepare.ts` (источник = RunTarget-реестр; `deferredPacks` чтение убрать)

**Interfaces:**
- Consumes: `RunRegistry`-семантика (флаг `exposure` на `ToolDefinition` до T6, `RunToolEntry` после; T6 меняет потребителя здесь последним швом).
- Produces: `createLoadToolsTool(registry)` с замком: promote ∈ members реестра с `exposure==='deferred'`; `formatDeferredCatalog(registry)` строится из реестра рана (не из `packOutputs`).

- [ ] **Step 1:** Перевести каталог и promote на реестр рана; не-члены → `unknown` в ответе (текст `[...]` как сейчас, ран жив).
- [ ] **Step 2:** Стенд: агент с `files`, `plan` deferred → `load_tools(['plan_save'])` ок, `load_tools(['memory_write'])` (memory выключен) → unknown.
- [ ] **Step 3:** lint+typecheck; Commit `fix(harnesys): deferred catalog and load_tools bound to the run registry`.

### Task 6: Удаление каскадом: `AgentDefinition.tools`, `deferredPacks`, снапшоты нод, child-реестры (D1)

**Files (инвентарь закрытый, grep-сверка Step 1):**
- Library: `domain/agent-definition.ts` (поле `tools` удалить); `application/tool-registry.ts` (`filterToolsForAgent` → `subtractDeniedTools`: только `disallowedTools`+mcp-фильтр); `application/agent-identity.ts` (удалить legacy-мост T1 и `tool_unreachable`-диагностику по allowlist; `resolveAgentIdentity` становится тонкой обёрткой `resolveCapabilitySet` без universe-режима); `application/llm.ts:133` (`node.tools ?? имена всего ctx.toolRegistry`; `node.tools` = опциональное сужение видимости ноды, неизвестные имена → explain-диагностика без падения; `map`-ноду `tools` вести тем же правилом — `graph.ts`-обвязка map); `application/check.ts:35-51` (`tools_unresolved` теперь против реестра, не против снапшотов); `ports/create-runtime.ts`, `ports/run-targets.ts`, `application/run-engine-types.ts:35,55`, `application/run-engine-prepare.ts:120,126`, `application/create-runtime.ts:156,173,181,216,224`, `application/session.ts:34,151`, `application/packs/pack-run.ts` (все 20 grep-хитов `deferredPacks`): удаление опции; экспозиция едет флагами реестра; `application/create-runtime.ts` oneshot-сборки (173/216) → `resolveCapabilitySet(def, свой universe)` вместо base+filter; `application/graph-spawn.ts:244` и `application/graph-handoff.ts:110` — реестр ребёнка = `resolveCapabilitySet(childDef, universeOf(parentOpts))` c сужением песочницы (agents-пак вырезан, интерактив deny: helper `sandboxUniverse(universe)` там же), `GraphOpts` носит `universe: CapabilityUniverse` (проброшен из `RunTarget.universe`, поле добавить в `ports/run-targets.ts`), `packs/agents/create-agents-tools.ts`/`index.ts` (схемы create: `tools` удалить, `packs` = assignment-форма с overrides, тексты описаний под новую семантику), `application/plugins/bind-agents.ts:40-41,94,128-170,240` (`definition.tools = mappedTools` → `disabledTools = nativeNames(packIndex) − mappedTools`, `standardAgentGraph(tools)` → `standardAgentGraph()` без снапшотов; `disallowedTools`-маппинг (:148) остаётся), `ports/tools.ts` (exposure-union переименован в T1 — здесь догрепать `'always'` не должно остаться, `bind-monitors` не трогать)
- Server: `domain/agent.port.ts` + `adapters/store/sqlite/schema/agents.ts` + `repos/sqlite-agent.repo.ts` (поле `tools` из домен-типа и маппингов; DDL-колонку роняет T8), `application/agents/{create-agent,update-agent,create-agent-from-preset}.use-case.ts` + `agent.helpers.ts` (поля `tools`, пересборка графа :176 → `buildReactGraph()` безусловно при stock), `application/agents/react-preset.ts` (`buildReactGraph(): AgentGraph` без аргумента, ноды без `tools`), `is-stock-react-graph.ts:7-11` (сверка без tools-ключа), `adapters/http/agent/agent.body.ts:150,173` (`tools` → reject с текстом «tools is removed; enable sources»), `adapters/capabilities/sqlite-agents-catalog.port.ts` (create-input без tools), `application/plugins/plugin-agents.ts:67` (`buildReactGraph()`), `closed-world-materialization.ts` (файл + импортёры удалить, маркер v1 остаётся в живой базе историей)
- Shared: `shared/src/agent.ts:49` (`tools` удалить)

**Interfaces:**
- Consumes: T1–T5.
- Produces: финальная `AgentDefinition` спеки п.3; `RunTarget.universe: CapabilityUniverse`; `buildReactGraph(): AgentGraph` без снапшотов; ни одного `def.tools`/`node.tools`-грантинга (node.tools = только сужение видимости).

- [ ] **Step 1:** Закрыть инвентарь: `rg -n "\.tools\b|\btools:|deferredPacks" packages/harnesys/src apps/studio/server/src apps/studio/shared/src -g '!*.json'` — каждый хит либо в списке выше, либо объясним и правится по месту; результат — в commit message.
- [ ] **Step 2:** Library-правки; child-реестры на `resolveCapabilitySet` (блок ревью 2 закрыт: spec §7.4 реализуется `sandboxUniverse`).
- [ ] **Step 3:** Server/shared-правки; `bun run lint && bun run typecheck` зелёные (клиентские compile-ошибки чинятся удалением использований `agent.tools`; для превью до T9 клиент читает `capabilities`, не выдумывать tools-поле в shared обратно).
- [ ] **Step 4:** Стенд: тред Assistant (у него ещё старый снапшот-граф из БД! llm-нода несёт `tools:[6]`) — до T8 это ожидаемое сужение: проверить только отсутствие `run.failed` и работу `ask_user` (core); не чинить данными раньше T8.
- [ ] **Step 5:** Commit `refactor!: remove tool allowlist, pack attach options and node tool snapshots`.

### Task 7: Studio server: валидации записи + режим-формат + explain endpoint

**Files:**
- Create: `apps/studio/server/src/application/capabilities/validate-agent-config.use-case.ts` (вход `(config, {creatorEffective?, universe}) → { errors: string[] }`)
- Create: `apps/studio/server/src/application/capabilities/list-agent-capabilities.use-case.ts` (`GET /api/agents/:id/capabilities` → `{explain, registry:[{name,exposure,source}]}` из `resolveCapabilitySet`; controller+wire к соседним agent-роутам)
- Modify: `apps/studio/shared/src/modes.ts:14-22` (`AgentMode.packs?: string[]` → `Assignments?: Record<string, PackAssignment>` + `disabledTools?`, `exposure?` того же PackOverride-словаря; имена зафиксировать: `packs?: Record<string, PackAssignment>`, строковый массив больше не валиден)
- Modify: `apps/studio/server/src/adapters/http/agent/agent.body.ts` (mode-zod под новый формат, `capabilities` принимает PackOverride), `application/agents/{create,update}-agent.use-case.ts` (+validate-agent-config в пайплайн; child: `parent !== null` → sources ⊆ effective(creator)), `application/agents/agent.helpers.ts`
- Modify: `apps/studio/server/src/composition/wire-controllers.ts`
- Modify: инструкции клиента — нет (T9)

**Interfaces:**
- Consumes: `resolveCapabilitySet`, `buildCapabilityUniverse`, `PackOverride` (T1).
- Produces: `ValidateAgentConfigUseCase.execute(...): AgentConfigErrors {errors: string[]}`; `ListAgentCapabilitiesUseCase.execute(agentId): AgentCapabilitiesView`.

- [ ] **Step 1:** Правила спеки п.7: все источники зарегистрированы/установлены (universe); `disabledTools` ⊆ выход источника; core ∈ packs (агент и каждый режим, иначе error); child ⊆ creator-effective (текст «недоступно создателю: <source>»); режим не включает выключенное агенту; mode-exposure только над включёнными источниками.
- [ ] **Step 2:** HTTP-create: 400 с текстами ошибок (`ValidationError`-паттерн соседних use-case); tool-path (`agents_create`/`agents_create_subagent`, T6-схемы) → `{error}` в результат модели (R6: ран creator жив).
- [ ] **Step 3:** lint+typecheck; стенд: child с паком вне creator → `{error}` со списком, child не создан.
- [ ] **Step 4:** Commit `feat(studio-server): validate agent and mode capabilities; explain endpoint`.

### Task 8: Миграция данных, пресеты, skill-тексты (таблица закрытая)

**Files и целевые значения пресетов** (ключ: правки одинаковые — `tools` удалить, `"core":{}` в `capabilities`, из графа удалить `tools`-ключ llm-нод, `map`-нодам `tools` оставить только непустые сужения (assistant.json:131-135 пустой массив → удалить ключ); `enabledPlugins` пресетов не трогать):
- `assistant.json`: capabilities = существующие 13 + `core`; удалить `tools` (:43-89, :210-253 снапшоты, :131-135)
- `coder.json` (:13-27 9 паков) + core; `general.json`/`explorer.json`/`researcher.json`/`writer.json`/`planner.json`/`orchestrator.json`/`reviewer.json`/`tester.json`: свои `capabilities` + core
- `apps/studio/server/src/adapters/store/sqlite/bootstrap.ts`: миграция `capability_set_v1` (маркер `schema_meta`): `ALTER TABLE agents DROP COLUMN tools` (guard `PRAGMA table_info`), для каждого агента `capabilities_json` += `{"core":{}}`; импортёры репозитория после T6 поле не читают, SQL-миграция идемпотентна
- `apps/studio/assets/skills/agent-creator/SKILL.md`: строки 12, 31, 66 (booleans-семантика assignment), 85, 93 (create без `tools`, overrides/explain тексты); раздел про graph — `buildReactGraph` без снапшотов
- `packages/harnesys/src/packs/agents/index.ts` + `create-agents-tools.ts` descriptions — финальная вычитка после T6-схем (assertions в тексте «unknown/ambiguous targets fail here» остаются truthful)

- [ ] **Step 1:** Bootstrap-миграция + unit-free проверка: `bun -e "..."` скрипт через bun в temp/ против копии `~/.harnesys/studio.db.bak-cw`... НЕТ:Against живой стенд не идём; копия в `~/.harnesys/tmp/cw-check.db`, миграцию прогнать функцией bootstrap на копии, SELECT `agents` → без колонки, core везде.
- [ ] **Step 2:** Пресеты по таблице выше (10 JSON, правки ручные, сверка `rg -n '"tools"' apps/studio/assets/presets/agents/` = 0 хитов).
- [ ] **Step 3:** SKILL/описания; lint+typecheck; стенд (auto-reload хозяина): Assistant-тред — превью-тулы вернулись без рестарта (миграция + explain), второй прогон тред-цикла R1-агента из T10.
- [ ] **Step 4:** Commit `feat(studio): capability_set_v1 migration; presets carry sources only`.

### Task 9: Клиент: карточки источников + overrides, превью из explain, режимы

**Files:**
- Create: `apps/studio/client/src/features/manage-agent/ui/agent-source-card.tsx` (switch grant; expand: таблица инструментов источника из explain-ответа — строка `write_file | disable-toggle | direct/deferred-radio`; `core` = disabled-state чекбокс с подписью «обязателен»; plugin-карточка та же механика, `source='plugin:<name>'`)
- Create: `apps/studio/client/src/features/manage-agent/model/draft-overrides.ts` (merge override-изменений в draft `capabilities: Record<string, PackAssignment>`; zod `PackOverrideSchema = z.object({spec: PackConfigSchema.optional(), disabledTools: z.array(z.string()).optional(), exposure: z.record(z.enum(['direct','deferred'])).optional()})`, `PackAssignmentSchema = z.union([z.literal(true), PackConfigSchema, PackOverrideSchema])`)
- Create: `apps/studio/client/src/shared/api/agent-capabilities.ts` (`GET /api/agents/:id/capabilities`, тип `AgentCapabilitiesView`)
- Modify: `ui/draft-capabilities.tsx` (список источников = packs(read-only universe) ∪ plugins; чекбоксы-тулов больше нет), `ui/agent-config-category-panes.tsx` (Tools-pane → превью из explain, клик по строке = provenance-tooltip), `ui/agent-mode-editor.tsx` + `ui/agent-mode-fields.ts:17` (zod-массив `packs` → `PackAssignmentSchema`-карта, те же override-контролы), `shared/src/modes.ts` consumers, `shared/src/agent.ts` (без `tools`), `model/*` стores/drafts где читался `tools`
- Схема: `rg -n "\.tools\b" apps/studio/client/src` = 0 вне explain-view (там поле называется `registry`)

**Interfaces:**
- Consumes: `AgentCapabilitiesView` (T7), новые body-формы (T7).
- Produces: draft→body сериализация `capabilities` с `PackOverride`; invalidate превью после save (react-query key агента).

- [ ] **Step 1:** Типы/zod/serialize; убрать `tools` из форм создания (диалог presets untouched).
- [ ] **Step 2:** Карточка источника + режимы (один компонент на оба места).
- [ ] **Step 3:** Превью-pane из explain (источник данных только API, не клиентский расчёт).
- [ ] **Step 4:** lint+typecheck; agent-browser: Assistant — превью непустое, `packs` совпадают с карточками; выключить `shell` у `files` → save → превью без `shell` по refetch; mode plan — попытка включить источник, выключенный агенту, показывает disabled-state (R7 частично).
- [ ] **Step 5:** Commit `feat(studio-client): source cards with per-tool overrides; explain-backed tools preview`.

### Task 10: Приёмка R1–R7 (manual: agent-browser, curl, sqlite, temp-скрипт)

**Files:** правок нет; находка бага — фикс в тот же файл, отдельным коммитом `fix(scope): ...`, без рефакторингов.

- [ ] **Step 1 (R1):** создать агента без capabilities; тред; `shell echo hi` → отказ-результат в тексте, ран `completed`; `run_events` без `run.failed`.
- [ ] **Step 2 (R2):** агент без плагинов: `agents_list` без plugin-строк; `agents_spawn` на `code-explorer` → `{error}`-текст тул-отказа, ран жив. Тот же текст в «Spawn results» при обходе тула (прямой spawn из графа-теста temp-скриптом `temp/r2-node-deny.ts` против `resolveAgentTarget` — строки совпадают посимвольно, обе из `agent-target-resolve.ts:49`).
- [ ] **Step 3 (R2+):** Assistant (feature-dev включён): спавн `code-explorer` по имени проходит полный цикл, child-отчёт в «Spawn results».
- [ ] **Step 4 (R3):** `agents_list` Assistant: `packs` = 13+core из capabilities, превью `tools` ⊇ `write_file`.
- [ ] **Step 5 (R4):** UI Plugins: выключить `feature-dev` в воркспейсе → следующий Assistant-тред: `agents_list` без plugin-агентов (recompute per resolve, кэш нет); включить обратно.
- [ ] **Step 6 (R5, чистый хост):** `temp/s1-core-host.ts`: `import { createRuntime, coreCapability } from 'harnesys'`... хост без паков: `createRuntime({tools:[echo], agents:{resolve:()=>def, list:()=>[]}, lifecycle, events, ...})`, `def.packs` нет → ожидаем: в реестре `echo` (baseRegistry granted), `load_tools` отсутствует (core не включён), run completes без model-вызова? Модель нужна — использовать существующий BAI-провайдер из `~/.harnesys`? НЕТ лишней нагрузки: assert на уровне `resolveCapabilitySet` в том же скрипте (чистая функция, без LLM): universe {baseRegistry:{echo}, registrations:[core], roster:[]}, def без packs → registry = {echo}; def с `core` → +load_tools/load_skill/ask_user/map/wait. Скрипт печатает ок/fail, коммитить не надо (temp/ в .gitignore или удалить после).
- [ ] **Step 7 (R6):** child-создание с чужим паком → `{error}`, ран creator жив (покрытие T7 smoke повтором с UI-агентом).
- [ ] **Step 8 (R7):** клиентский превью-тул `pin_set` → tooltip «pack:pin-memory» (explain.reason).
- [ ] **Step 9:** `bun run lint && bun run typecheck`; отчёт человеку (логи/скрины только по запросу, AGENTS.md).

---

## Self-review checklist (после ревью 2026-09-15)

- Ревью-пункты закрыты: 1 (llm.ts в T6), 2 (child-реестры `resolveCapabilitySet`+`sandboxUniverse` T6, спека §7.4), 3 (все 8 файлов `deferredPacks` в T6), 4 (роль `appendSpawnResultsMessage`/`agent.failed` в T3 вместо выдуманного `formatSpawnResults`), 5 (CapabilitySet/Universe полные, `fsSkills`), 6 (судьба base packs решена явно: universe-авто-регистрация остаётся, grant закрыт; core через wire-packs), 7 (modes-типы+body+zod в T7/T9), 8 (кэш отложен, запись в Global Constraints + правка спеки), 9 (`listByWorkspace` вместо `listAll`, warm-кэш контракт, N+1 осознан: один universe на list, резолвер на строку), 10 (таблица пресетов T8, `is-stock-react-graph`, `bind-agents`, `plugin-agents`, `check.ts` в T6, `map_item.tools` правило), 11 (единый словарь `'direct'|'deferred'` переименованием в T1), 12 (R5 шаг T10 Step 6, SKILL-строки T8, идентичность текстов R2).
- Type consistency: `RunRegistry`, `CapabilityUniverse` (с `makeLoadTools`), `listScopedRoster`, `buildCapabilityUniverse`, `PackOverride` — одни имена в T1–T10.
- Placeholder scan: правки пресетов — закрытая таблица файлов+ключей; R5 — скрипт с конкретными assert'ами; «popравить compile-ошибки по месту» допустимо только в T3/T4 Step-адаптациях (миграция сигнатур, не новые решения).
