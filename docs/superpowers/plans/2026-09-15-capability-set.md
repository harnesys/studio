# Capability Set Implementation Plan

> **For agent workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax to track progress.

**Goal:** Одна функция `resolveCapabilitySet` (чистая относительно аргументов) становится единственным решением о доступности (источники → grant → overrides → режим → песочница), ран агента не умирает от отказа операции, `tools`-allowlist удалён из всех слоёв.

**Architecture:** Три плоскости по спеке: реестр рана `RunRegistry = Map<string, RunToolEntry{def, exposure, source}>`, грант (агент называет только источники; вычитание `disabledTools`/overrides; `node.tools` на llm-нодах остаётся как сужение видимости: `undefined`=весь набор, `[]`=нет, непустой=подмножество), экспозиция (флаги того же реестра; `load_tools`/каталог читают только набор рана). Движок не знает паков/плагинов: получает `RunTarget.capabilitySet`. Studio composition-root зовёт резолвер для рана и каталогов. Отказы spawn/handoff = per-call результаты.

**Tech Stack:** TypeScript strict, Bun workspaces (`packages/harnesys`, `apps/studio/{server,client,shared}`), drizzle+SQLite (bun:sqlite, `DROP COLUMN` проверен на этой сборке), Hono, React 19 + zod, biome (root + plugin `lint/plugins`), agent-browser для ручной проверки.

**Spec:** `docs/superpowers/specs/2026-09-15-capability-set-design.md` (обновлена после ревью-2: честный meta core, `PackOverride`, контракт `node.tools`, семантика assignment-литералов, `capabilitySet`, источник B6-чисел). Инвентарь правок плана после ревью-2 в конце файла.

## Факты разведки (перепроверено кодом 2026-09-15, ревью-2 включено)

- Allowlist и фильтр: `domain/agent-definition.ts:67` (`tools?: string[]`); закрытый `application/tool-registry.ts:32-60`; диагностика `tool_unreachable` `application/agent-identity.ts:47-56`; сборка `resolveAgentIdentity` `agent-identity.ts:35-66` (merged = baseRegistry ∪ attachPackTools(enabled, deferredPacks) → filter → `LOAD_TOOLS_NAME` (:61) + `registerPackSkillTool` (:59)).
- Имена в нодах: `application/llm.ts:133` `resolved = node.tools ?? []` → `resolveProgressiveTools(resolved, ctx.toolRegistry, loaded)` (:137); каталог `formatDeferredCatalog(deferredPending, ctx.toolRegistry)` (`llm.ts:144`) — каталог и promote уже читают реестр рана, отдельной «дыры packOutputs» нет; замок `load_tools` = `registry.get` (`tools/create-load-tools-tool.ts:25`), direct-имя возвращает `{loaded, tools}`; валидация `node.tools ⊆ registry` уже в `check.ts:33-46` (`tools_unresolved`). `control:map` поля `tools` НЕ имеет (`domain/agent-definition.ts:136`); `"tools": []` в пресетах (`researcher.json:109`, `orchestrator.json:104`, llm-ноды `map_item`) — намеренные pure-decision (`agent-creator/SKILL.md:12,15`). `graph.ts:809` `tools: wrap ? [] : ln.tools` — wrap-шаг map-песочницы, легален, не трогать.
- Паки: `buildPackRun` вызывает `reg.pack.create({ports: reg.ports ?? {}, spec, scope: reg.resolveScope?.() ?? scopeFallback()})` (`packs/pack-run.ts:84-88`); `ports`/`resolveScope` — часть `PackRegistration` (`domain/pack.ts:53-57`); без `resolveScope` при `ports` — дроп `pack_port_missing` (`packs/registry.ts:66-71`); enabledConfig (`registry.ts:77-83`): absence/`null`/`false` = off, `true`/объект = on. Коллизия pack-tool с существующим именем в `runRegistry` — warning `pack_tool_collision` и дроп пакета (`pack-run.ts:171-185`): baseRegistry НЕ должен содержать имена pack-тулов. Авто-регистрация base-паков `files/shell/fetch` в universe: `application/create-runtime.ts:84-86` (только регистрация, грант по-прежнему из `def.packs`). Сервис-тулы: `create-runtime.ts:101-107` авто-добавляет `load_tools` в реестр рантайма, `load_skill`+алиас `Skill` при `options.skills`.
- `deferredPacks` (20 хитов, 8 файлов): `ports/create-runtime.ts:52`, `ports/run-targets.ts:22`, `application/run-engine-types.ts:35,55`, `run-engine-prepare.ts` (2), `application/create-runtime.ts:156,181,224`, `application/session.ts:34,151`, `packs/pack-run.ts` (6), `agent-identity.ts:32,42`.
- Spawn: тул `agents_spawn` fail-fast по `deps.agents.list(scope)` (`packs/agents/create-agents-tools.ts:67-76,337`); нода резолвит по `AgentsResolve.list` (`application/graph-spawn.ts:151`; throws `:169,:175`; foreign-check `:153-161` — чужой делегат как missing); бросок ловит общий catch ветки → `run.failed` (`graph.ts:1220-1228,1244-1253`). Рендер итогов: `SpawnResultItem {error?}` (`graph-spawn.ts:31-57`), per-item событие `agent.failed` (`graph.ts:1180`), текст модели `appendSpawnResultsMessage` (`graph.ts:1231`, импорт :28). Реестр ребёнка: `graph-spawn.ts:244` (`filterToolsForAgent(parent.toolRegistry, childDef)`), handoff `graph-handoff.ts:110`, oneshot `create-runtime.ts:173,216`, сегменты `run-engine-prepare.ts:120,126`.
- Два разных порта `list`: движковый `AgentsResolve.list?: () => AgentRosterEntry[]` (`ports/create-runtime.ts:35`) и каталожный `AgentsCatalogPort.list(scope, filter)` (`create-agents-tools.ts:99,337`, `create-agents-handoff-tool.ts:38`, `create-agent-lifecycle-tools.ts:132,162`). handoff-тул резолвит по каталожному ростеру с текстом `unknown handoff target ... Available top-level agents ...` и фильтром plugin-строк (`packs/agents/handoff-target.ts:1-40`) — это другой контракт, parity со spawn-ногой от него не требуется.
- Host wiring: `wire-runtime.ts:78-98` (`createToolRegistry([...files(), shell(), fetch(), askUser(), mapTool(), wait()])` как deps движка; `agents: {resolve: resolveAgentDefinition, list: listAgentRoster}`); `studio-run-targets.adapter.ts:128-161` (`packs: registrations`, `deferredPackNames(agent.packs, registrations, mode.packs)` :155,243-253, `effectivePlugins` :186-195, `toolRegistry: new Map(hx.tools.registry())` :129,156); каталог-порт: plugin-подмешивание без агентного фильтра `:66-69`, `toAgentDefinition` кладёт `capabilities` без `packs` `:211-226`; ростер: `workspace-harnesys.registry.ts:244-262` (createRuntime `tools: [askUser(), mapTool(), wait()]` :247; `agents.list` = listByWorkspace + warmPluginAgents :250-259), `listAgentRoster` :272-278 = `listAll()` БЕЗ фильтра workspace (кросс-workspace-утечка), `resolveAgent`/`resolvePluginAgent` :281-305, `warmPluginAgents` :148-150 (sync, холодный до первого `get()/loadEnabledPlugins`), импорт хука-seed `create-host.ts:6,178` (materialization).
- Плагин-агенты: id `plugin:agent` (`plugin-agents.ts` хоста, `bind-agents.ts:40-41,94` CC-алиасы → `definition.tools` + `standardAgentGraph(tools)` :240 с materialized-снапшотом ноды); группы `plugin:<name>` у тулов НЕ существует (grep=0). `pluginAgentCatalog(...packIndex)` (`plugin-agents.ts:38-76`) строит определения, граф `buildReactGraph(agent.definition.tools ?? [])` :67.
- Пресеты/БД: колонка `agents.tools` есть (`schema/agents.ts:27`; bootstrap `CREATE TABLE agents` её не содержит — добавлена ALTER-паттерном, `bootstrap.ts:304-316` соседние ADD COLUMN; DROP COLUMN проверен bun `bun -e`); `mode_presets.packs_json` массивы (`plan|["plan"]`), seed `server/src/config/mode-preset-seed.ts` (вызов `bootstrap.ts:385`), `agents.modes_json` массивы (`plan.packs:["plan"]`); `assistant.json`: agent `tools` 42 имени (:210), `think.tools` 45 (:43), `capabilities` 13 без core (:13), `map_item` llm-нода `tools: []` (:131-135); `agent.body.ts:12` (`packs` массив), `:48-50` (`capabilitiesBody = {spec}|null`, булеан отвергается), `:150,173` (`tools`); `agent-presets-fs.adapter.ts:36,55,129`; `create-agent-from-preset.use-case.ts:63`; клиент `create-agent-from-preset.ts:32`, `agent-config-dialog.tsx:46,63,86`, `agent-graph-node-fields.tsx:79,91-95` (редактор node.tools — после T6 легален как сужение, остаётся); `shared/src/agent.ts:49`, `shared/src/modes.ts:20` (`packs?: string[]`).
- Делегаты: `create-agent.use-case.ts:161,235-245` `intersectDelegatePlugins` (молчаливый clamp на create), `update-agent.use-case.ts:156-157` (`enabledPlugins` на update БЕЗ проверки против родителя — обход).
- Баррель библиотеки: `packages/harnesys/index.ts` (не `src/index.ts`).
- Ворота: тесты запрещены; `bun run lint && bun run typecheck` в корне; стенд хозяина 3000/5173 не трогать; temp-файлы только в `temp/` монорепо или `~/.harnesys/tmp`.

## Global Constraints

- Тестов не писать (AGENTS.md). Ворота таска: lint+typecheck в корне + стенд-smoke, где указано шагом.
- D1/D2/D5/D6: каскад удаления без shim'ов/compat-полей; временные адаптеры разрешены только явными transitional-шагами с точкой удаления (нормализатор modes в T7, удаляется T8).
- Типы именованные, без `T['field']`/`Parameters<typeof fn>[0]`; FSD-импорты клиента через `index.ts`; файлы ~300 строк (capability-set.ts, create-agents-tools.ts следят за лимитом; при перекосе — резать по ответственности, не по слоям).
- Семантика assignment-литералов одна на все слои (спека §3): `true|{}|{spec}|PackOverride` = on, `false|null|absent` = off; `enabledConfig` остаётся эталоном, body/preset-loader/SKILL подтягиваются.
- Контракт `node.tools`: `undefined` = весь набор рана, `[]` = нет, непустой = сужение ⊆ набора (валидация `check.ts` не меняется по смыслу).
- Чистота резолвера: `resolveCapabilitySet(def, universe)` — чистая относительно аргументов; `universe.registrations` несёт порты/resolveScope; вызывающий вне рана обязан обернуть в `runInHostToolScope` (прецедент materialization:60); HTTP-валидация T7 идёт под существующим middleware `requireHostToolScope` (`host-tool-scope.ts`).
- Коммит в конце каждого таска. Порядок линеен: T1–T4 библиотека (additive/типы), T5 studio-переключение, T6 удаление каскадом, T7 валидации+endpoint, T8 данные/пресеты/скилл, T9 клиент, T10 приёмка.
- Кэш эффективного набора отложен; correctness = recompute на каждый resolve; критерий введения: замер в T10 Step 7 (`agents_list` на 10+ агентах > 150 ms → отдельная задача с `configRevision`).

---

### Task 1: Библиотека: `capability-set.ts`, типы, чистый резолвер (additive)

**Files:**
- Create: `packages/harnesys/src/application/capability-set.ts`
- Modify: `packages/harnesys/src/domain/agent-definition.ts` (`PackAssignment` принимает `PackOverride`; тип `ToolExposure`)
- Modify: `packages/harnesys/src/application/packs/registry.ts` (`normalizePackAssignment`: +`PackOverride`)
- Modify: `packages/harnesys/src/ports/tools.ts:43,67` (`exposure?: 'always' | 'deferred'` → `ToolExposure = 'direct' | 'deferred'`; грепнуть `'always'`: единственное валидное оставшееся — `bind-monitors.ts` (не трогать); потребителей флага два: `exposure.ts:24` (`=== 'deferred'`), `pack-run.ts:172` (markDeferred по имени пака) — не переименовывать, `'always'`-литералов в коде нет)
- Modify: `packages/harnesys/src/ports/create-runtime.ts` (`AgentRosterEntry` + `plugin?: string`)
- Modify: `packages/harnesys/index.ts` (экспорты; путь барреля — корень пакета)

**Interfaces:**
- Consumes: `enabledConfig` (`packs/registry.ts:77`), `PackRegistration` (ports/resolveScope в нём), `AgentRosterEntry`, `SkillRegistry`, `HookBinding`, `PackRunMap`.
- Produces (одни имена во всех тасках):
  - `type CapabilitySource = string` — литералы `'pack:<name>' | 'plugin:<name>' | 'mcp:<server>' | 'host'` (составная строка)
  - `type ToolExposure = 'direct' | 'deferred'`
  - `type RunToolEntry = { def: ToolDefinition; exposure: ToolExposure; source: CapabilitySource }`
  - `type RunRegistry = Map<string, RunToolEntry>`
  - `type ExplainKind = 'tool' | 'skill' | 'mcp' | 'hook' | 'subagent' | 'note' | 'path'`
  - `type ExplainStatus = 'granted' | 'deferred' | 'disabled' | 'dropped-by-mode' | 'denied-by-universe' | 'overrode-host'`
  - `type ExplainEntry = { item: string; kind: ExplainKind; source: CapabilitySource; status: ExplainStatus; reason: string }`
  - `type CapabilityUniverse = { registrations: PackRegistration[]; baseRegistry: Map<string, ToolDefinition>; roster: AgentRosterEntry[]; fsSkills?: SkillRegistry; makeLoadTools: (registry: RunRegistry) => ToolDefinition; makeLoadSkill?: () => ToolDefinition; mode?: ModeCapabilityFields }`
  - `type ModeCapabilityFields = { id: string; packs?: Record<string, PackAssignment>; disabledTools?: string[]; exposure?: Record<string, ToolExposure> }` (T7 приводит `AgentMode.packs` к map-формату; T1 принимает map)
  - `type CapabilitySet = { registry: RunRegistry; packOutputs: PackRunMap; skills: string[]; mcpServers: string[]; hooks: HookBinding[]; subagents: AgentRosterEntry[]; notes: LlmNoteProvider[]; pathEntries: PathEntrySpec[]; explain: ExplainEntry[]; fatal: string[] }`
  - `const CORE_SERVICE_TOOLS = ['load_tools', 'load_skill', 'Skill']`
  - `function resolveCapabilitySet(def: AgentDefinition, universe: CapabilityUniverse): CapabilitySet`
  - `type PackOverride = { spec?: PackConfig; disabledTools?: string[]; exposure?: Record<string, ToolExposure> }`

- [ ] **Step 1:** Сборка `registry`: начать с `universe.baseRegistry` (entries `source:'host'`, `exposure: def.exposure ?? 'direct'`), КРОМЕ имён `CORE_SERVICE_TOOLS` (они не грантятся «от хоста»: до T6 их кладёт `create-runtime.ts:101-107`, после — только core-грант). Pack-источники по `enabledConfig(def.packs)`: `out = reg.pack.create({ports, spec, scope})` (тот же контракт, что `pack-run.ts:84`; `excluded` при throw без портов — explain `denied-by-universe`), entry per tool (`source:'pack:<name>'`, `exposure: def.exposure ?? 'direct'`); пересечение с существующим host-именем: pack-запись ПЕРЕЗАПИСЫВАЕТ host-entry (explain `overrode-host`, reason `pack:<name>`; до T5 это ask_user/map/wait двойником из baseRegistry).
- [ ] **Step 2:** Overrides источника (`PackOverride.disabledTools`/`exposure`), `def.disallowedTools` (aliases через `resolveToolAlias`, `tool-registry.ts:13`), mcp-фильтр (`def.group ∈ def.mcpServers`), `pack:core` → `makeLoadTools(registry)` + `makeLoadSkill()` (если есть `fsSkills`) с explain `granted`.
- [ ] **Step 3:** `mode`-слой: `mode.packs` (map) ⊆ `def.packs` иначе fatal; паки вне mode.packs → пометить `deferred` (explain `dropped-by-mode`, reason `mode:<id> preload` — это замена `deferredPackNames`); `mode.disabledTools` вычесть.
- [ ] **Step 4:** `subagents`: `universe.roster.filter(e => e.plugin === undefined || def.enabledPlugins?.[e.plugin] === true)` (делегаты чужого parent в roster не кладёт хост; резолвер не перепроверяет `parentId`). `skills`/`notes`/`hooks`/`pathEntries` — из выходов enabled-источников (notes: `out.notes`; hooks/pathEntries приходят только с плагинами — хост кладёт их регистраторами, резолвер фильтрует по `enabledPlugins` и пишет explain; для паков hooks/pathEntries пока нет, поля готовы под будущее). `packOutputs`: карта выходов enabled-записей (`PackRunMap`), чтобы T4/T5 не звали `create()` второй раз.
- [ ] **Step 5:** `fatal` на: unknown-источник (по образцу `pack_unknown` из `registry.ts:146-153`), override-имя вне выхода источника, `disabledTools` на выключенном источнике.
- [ ] **Step 6:** Legacy-мост (удаляется T6): если `def.tools !== undefined` — пересечь финальный registry по allowlist'у, вырезанное в explain `denied-by-universe`, reason `legacy tools allowlist`.
- [ ] **Step 7:** typecheck+lint зелёные (функция никем не вызывается).
- [ ] **Step 8:** Commit `feat(harnesys): pure resolveCapabilitySet with provenance explain`.

### Task 2: Библиотека: core pack (честный meta)

**Files:**
- Create: `packages/harnesys/src/packs/core/index.ts`
- Modify: `packages/harnesys/src/packs/index.ts`, `packages/harnesys/index.ts`

**Interfaces:**
- Consumes: `askUser`, `mapTool`, `wait` (экспорты `harnesys`), `CORE_SERVICE_TOOLS`/`makeLoadTools`-контракт T1.
- Produces: `coreCapability: Pack` (`meta.name='core'`, `meta.tools=['ask_user','map','wait']` (3, честно для `packCatalog` `tool-names.ts:36-46`), `create() → {tools: [askUser(), mapTool(), wait()]}`); сервисы `load_tools`/`load_skill`/`Skill` НЕ в meta — их грантует резолвер при `packs.core` (T1 Step 2), в `packCatalog` не светятся; описание пака: «обязателен правилом хоста».

- [ ] **Step 1:** Пак по образцу `packs/base.ts` (ports не нужны).
- [ ] **Step 2:** Экспорт барреля.
- [ ] **Step 3:** typecheck+lint.
- [ ] **Step 4:** Commit `feat(harnesys): core pack (ask_user/map/wait) with honest meta`.

### Task 3: Библиотека + хост-уиринг: отказы = результаты, scoped-ростер

**Files:**
- Modify: `packages/harnesys/src/application/graph-spawn.ts` (`resolveTargets` :145-181, `executeSpawn` :359+)
- Modify: `packages/harnesys/src/application/graph.ts` (ветка `control:spawn` :1138-1253)
- Modify: `packages/harnesys/src/ports/create-runtime.ts` (`AgentsResolve`), потребители внутри lib (`rg "agents.list" src/application` = graph-spawn:151, `graph-handoff.ts`, `agent-target-resolve` не меняется)
- Modify: `packages/harnesys/src/packs/agents/create-agents-tools.ts` (ростер fail-fast: тот же scoped-источник, см. Step 4)
- Modify: `apps/studio/server/src/adapters/workspace-harnesys.registry.ts` (`listScopedRoster`), `composition/wire-runtime.ts:96-98`

**Interfaces:**
- Consumes: `resolveAgentTarget`/`formatAgentTargets`.
- Produces:
  - `prepareSpawn(...) → { targets: SpawnTarget[]; denied: SpawnResultItem[] }`; `SpawnResultItem` уже имеет `error` (graph-spawn.ts:31-57) — denied-элемент: `{agentId, spawnId: crypto.randomUUID(), error: hit.error}`; `denied` мержится в итоговые `results` до старта детей; per-item событие `agent.failed` (:1180) шлётся и для denied (spawnId выдуманный — клиент видит отказ-иллюстрацию, это ок). Текст модели делает `appendSpawnResultsMessage`. Никакого нового типа событий.
  - `AgentsResolve = { resolve: (id: string, parent?: AgentDefinition) => AgentDefinition | undefined; list?: (parent?: AgentDefinition) => AgentRosterEntry[] }`.
  - `WorkspaceHarnesysRegistry.listScopedRoster(parent?: AgentDefinition): AgentRosterEntry[]`.

- [ ] **Step 1:** graph-spawn: целевые throw-ы (`:169`, `:175`) заменить на `denied.push`; `parseCalls` shape-throw оставить codedRunError (не агентская цель); foreign-check (`:153-161`) оставить как есть (defense-in-depth).
- [ ] **Step 2:** `graph.ts` control:spawn: `denied` → в results + `agent.failed` события; ран продолжается с остальными таргетами; при `targets.length === 0 && denied.length > 0` — нода сразу отдаёт results в модель (без run.failed).
- [ ] **Step 3:** Сигнатура `AgentsResolve` + вызовы с `opts.agent`; `wire-runtime.ts` → `list: (parent) => agentsRef.current?.listScopedRoster(parent) ?? []`; `listScopedRoster`: `listByWorkspace(parentWorkspaceId)` (workspace из `parent`-строки БД; `parent === undefined` → пустой список: better empty than cross-workspace, текущая `listAll()`-утечка закрывается здесь) + `warmPluginAgents(ws).list()` с фильтром `parent.enabledPlugins[name] === true`, entries с полем `plugin` (T1). Cold-cache контракт: listScopedRoster допустимо до первого прогрева — plugin-строк просто нет (не фатал; следующий resolve() таргета прогреет через `get(workspace)` `studio-run-targets:113`).
- [ ] **Step 4:** Парity предусловие: fail-fast `agents_spawn` (`create-agents-tools.ts:337`) остаётся на `deps.agents.list(scope)`; T5 Step 2 делает каталожный фильтр тем же `effectivePlugins`-пересечением → к T10 R2 tool-текст == node-текст (оба из `agent-target-resolve.ts:49`). В этом таске — только движковый путь.
- [ ] **Step 5:** lint+typecheck. Стенд-smoke (agent-browser): спавн на неизвестный id → ран `completed`, в «Spawn results» `unknown spawn target`, `run_events` без `run.failed` (`sqlite3` запрос в шаге).
- [ ] **Step 6:** Commit `fix: spawn denials return per-call results; roster scopes to parent agent`.

### Task 4: Библиотека: значение реестра `RunToolEntry`, `RunTarget.capabilitySet`

**Files:**
- Modify: `packages/harnesys/src/ports/run-targets.ts` (`capabilitySet?: CapabilitySet`; `deferredPacks` пока остаётся)
- Modify: `packages/harnesys/src/application/run-engine-types.ts` (`RunTargetOpts.capabilitySet`)
- Modify: `packages/harnesys/src/application/run-engine-prepare.ts` (`:108-143`: при `opts.capabilitySet` → `runRegistry` из `set.registry` (маппинг в `Map<string, ToolDefinition>` остаётся внутри GraphOpts до T6; entry.exposure переносится на копию `def` с флагом), `packOutputs = set.packOutputs`, legacy-ветки `resolveAgentIdentity` помечены к удалению T6)
- Modify: `packages/harnesys/src/application/graph.ts` (`GraphOpts.toolRegistry` остаётся `Map<string, ToolDefinition>` до T6 — перенос флага; `GraphOpts.capabilitySet?/universe?` НЕ добавляем: дети переходят на резолвер целиком в T6 через поле `universe`, которое добавляется там же одним шагом)
- Modify: `packages/harnesys/src/application/llm.ts`, `tools/exposure.ts`, `tools/create-load-tools-tool.ts` — потребление флага `def.exposure` без изменений логики (только тип-переход `'always'→'direct'` уже в T1)

**Interfaces:**
- Consumes: `CapabilitySet`, `resolveCapabilitySet`.
- Produces: `RunTarget.capabilitySet` — хост в T5 начнёт его класть; prepare при его наличии не вызывает `create()`.

- [ ] **Step 1:** Поля + приоритет в prepare (три ветки :118-143 сворачиваются: `capabilitySet` → иначе `packCache/identity` legacy до T6).
- [ ] **Step 2:** typecheck (студия capabilitySet не кладёт — поведение прежнее); lint.
- [ ] **Step 3:** Commit `feat(harnesys): RunTarget.capabilitySet prebuilt path`.

### Task 5: Studio server: composition-root режет всё; каталог per-agent; baseRegistry-гигиена; core-миграция

**Files:**
- Create: `apps/studio/server/src/application/capabilities/universe.ts` (`buildCapabilityUniverse(workspace, deps): CapabilityUniverse`: `registrations` = `effectiveRegistrations` + `coreCapability`; `baseRegistry` = `hx.tools.registry()` минус `CORE_SERVICE_TOOLS`; `roster` заполняет вызывающий (listScopedRoster родителя); `fsSkills: hx.skills`; `makeLoadTools: (reg) => createLoadToolsTool(new Map([...reg].map(([n, e]) => [n, e.def])))`; `makeLoadSkill: () => aliasTool(createLoadSkillTool(hx.skills), 'Skill')`; для фабрик `createLoadToolsTool`/`createLoadSkillTool`/`aliasTool`/`CORE_SERVICE_TOOLS` добавить экспорты из барреля `packages/harnesys/index.ts` в этом же таске)
- Create: `apps/studio/server/src/application/capabilities/effective-plugins.ts` (перенос `effectivePlugins` из `studio-run-targets.adapter.ts:186-195`)
- Modify: `apps/studio/shared/src/modes.ts` (создать здесь transitional `normalizeModePackMap(value: string[] | Record<string, PackAssignment> | null | undefined): Record<string, PackAssignment> | undefined`: массив → map с `{}`-значениями; T7 переводит `AgentMode.packs` на map, T8 удаляет нормализатор вместе с данными)
- Modify: `apps/studio/server/src/adapters/studio-run-targets.adapter.ts` (`:128-161`: `capabilitySet = resolveCapabilitySet(agent, {...universe, roster, mode: toModeFields(mode, normalizeModePackMap)})`; `fatal.length` → target `null` как соседние ранние выходы (:89-121) + warn-лог; из возврата убрать `packs`/`deferredPacks`; `toolRegistry` возвращаем до T6 как `Map(name → entry.def с перенесённым exposure-флагом)` (порт удалит поле в T6, fallback на пустой deps-реестр опасен до этого момента); `mode.packs` читается нормализатором — окно регресса нет: таргет всегда кладёт `capabilitySet`)
- Modify: `apps/studio/server/src/adapters/capabilities/sqlite-agents-catalog.port.ts` (`list()` plugin-часть через `effectivePlugins(workspaceEnabled, agents.findById(scope.agentId)?.enabledPlugins)`; `toAgentDefinition` → вызывает общий `dbAgentDefinition` из `workspace-agent-definitions.ts`, B4-дубль убран)
- Modify: `apps/studio/server/src/adapters/workspace-harnesys.registry.ts` (createRuntime `tools: []` вместо `[askUser(), mapTool(), wait()]` (:247); авто-сервисы библиотеки (`create-runtime.ts:101-107`) до T6 остаются, резолвер их исключает из host-гранта и добавляет по core — двойника в наборе нет)
- Modify: `apps/studio/server/src/composition/wire-runtime.ts:78-85` (deps-реестр движка `createToolRegistry([])`: авторитетен реестр из таргета)
- Modify: `apps/studio/server/src/composition/wire-packs.ts` (`coreCapability` в `createPackRegistrations`)
- Create: миграция `capability_core_v1` в `adapters/store/sqlite/bootstrap.ts`: каждому `agents.capabilities_json` += `{"core":{}}` (modes не трогаем, там core-правило с T7); идемпотентно по `schema_meta`

**Interfaces:**
- Consumes: T1–T4.
- Produces: живой пайплайн Studio через единый резолвер; `agents_spawn` tool и `control:spawn` видят равные ростеры (после фильтра каталога).

- [ ] **Step 1:** Миграция core (первая: до неё агенты без core потеряли бы ask_user при переключении).
- [ ] **Step 2:** universe + таргеты + каталог-порт (см. выше).
- [ ] **Step 3:** baseRegistry-гигиена (registry/wire-runtime/wire-packs).
- [ ] **Step 4:** lint+typecheck; стенд: Assistant — `ask_user` и `write_file` работают (core+migrate), `run_events` чисто; StressProbe-подобный агент (capabilities только core из миграции) не видит `write_file` (R1 частично); `agents_list` Assistant: `packs` = 13+core (B4).
- [ ] **Step 5:** Commit `feat(studio-server): single resolver at composition root; per-agent plugin catalog; core migration`.

### Task 6: Каскад удаления (D1): allowlist, `deferredPacks`, снапшоты, child-реестры

**Files (закрытый инвентарь; сверка грепом Step 1):**

Library:
- `domain/agent-definition.ts`: `tools?: string[]` удалить
- `application/tool-registry.ts`: `filterToolsForAgent` → `subtractDeniedTools` (`disallowedTools` + mcp-group); удалить requested-map логику :40-48
- `application/agent-identity.ts`: legacy-мост T1 удалить; `resolveAgentIdentity` → тонкая обёртка `resolveCapabilitySet` (остается для oneshot/create-runtime и миграционных потребителей)
- `application/create-runtime.ts`: удалить авто-сервисы `:101-107`, oneshot-сборки `:173,216` → `resolveCapabilitySet(def, свой universe)`; `deferredPacks` из опций `:156,181,224`
- `application/session.ts:34,151`, `run-engine-types.ts:35,55`, `run-engine-prepare.ts` (legacy-ветки, precedence упрощается до capabilitySet), `ports/create-runtime.ts:52`, `ports/run-targets.ts:22`, `packs/pack-run.ts` (все 6 отложенных хитов: `attachPackTools` без deferredPacks — флаг из `def.exposure`; `reusePackRun` — удалить, кэш сегментов = capabilitySet)
- `application/graph-spawn.ts:244` и `graph-handoff.ts:110`: реестр ребёнка = `resolveCapabilitySet(childDef, sandbox(universe))`; песочница — флаг слоя резолвера: при спавн-контексте вычесть assignment `agents` и интерактив (`ask_user`), ровно текущий набор удалений воспроизводится по факту кода (перед правкой снять `rg -n "sandbox|agents|ask" src/application/graph-spawn.ts` вокруг :230-260 и `:361` комментарий; explain `denied-by-universe`, reason `spawn sandbox`); проброс `universe`: поле добавить в `ports/run-targets.ts` (RunTarget.universe), `run-engine-types.ts` (RunTargetOpts.universe), `run-engine-prepare.ts` (класть из таргета), `graph.ts` `GraphOpts.universe` и перенос в `:709,819,959`; дети получают universe родителя
- `application/llm.ts:133`: `resolved = node.tools ?? [...ctx.toolRegistry.keys()]` (`[]` остаётся none — контракт спеки)
- `application/check.ts`: тексты `tools_unresolved` без изменений (already ⊆ registry)
- `ports/tools.ts`: финальная вычитка `exposure` JSDoc
- `application/plugins/bind-agents.ts`: `definition.tools = mappedTools` (:94) удалить; вместо `packs = packsForTools(mappedTools)` через packIndex (`plugin-agents.ts:44-51` уже строит tool→pack карту; экспорт хоста) — плагин-агент получает источники-паки, а `standardAgentGraph(mappedTools)` (:240) остаётся снапшотом-сужением (легально по новому контракту); `disallowedTools`-маппинг :148 остаётся
- `packs/agents/create-agents-tools.ts` + `index.ts`: схемы create-тулов: `tools` удалить; отдельного `overrides`-параметра не вводить: `packs` уже принимает `PackAssignment` (T1-тип); description: «sources, not tool names»; `spawnCallsTargetError`/`agents_list` preview: `tools: Object.keys(registry)` — порт `AgentCatalogSummary` не меняется; описание `agents_spawn` («unknown... fail here») остаётся truthful (roster совпал после T5)
- `packs/agents/create-agent-lifecycle-tools.ts` — только если читает `def.tools` (rg подтвердить), иначе не трогать
- баррель `packages/harnesys/index.ts`: экспорты `askUser/mapTool/wait` оставить (нужны `coreCapability` внутри lib и S1-скрипту T10)

Server:
- `domain/agent.port.ts`, repo-маппинги: поле `tools` из домен-типа `Agent` удалить; `schema/agents.ts:27` — drizzle-колонку ОСТАВИТЬ до T8 (NOT NULL DEFAULT `'[]'` кормит вставки), в `toAgent` не читать, в `insert` не писать
- `application/agents/react-preset.ts:49` → `buildReactGraph(): AgentGraph` (llm-нода БЕЗ ключа `tools` = all по новому контракту); вызовы: `create-agent.use-case.ts:147`, `update-agent.use-case.ts:177` (`request.tools` удалён → stock-пересборка только при `capabilities`-изменении stock-графа), `plugin-agents.ts:67` (`standardAgentGraph` из bind-agents), `is-stock-react-graph.ts:7-11` (сверка без tools-ключа)
- `create-agent.use-case.ts:130`, `update-agent.use-case.ts:128-137`, `create-agent-from-preset.use-case.ts:63`, `agent.helpers.ts` — поля `tools`
- `adapters/http/agent/agent.body.ts:150,173` (reject `tools` текстом «tools removed; use sources»), `:48-50` (`capabilitiesBody := PackAssignmentSchema` — `true` принимается, унификация литералов)
- `adapters/agent-presets-fs.adapter.ts:36,55,129` (tools из схемы убрать, булеаны принимать)
- `adapters/capabilities/sqlite-agents-catalog.port.ts` create-input
- `adapters/store/sqlite/closed-world-materialization.ts` — файл удалить; импортёр `composition/create-host.ts:6,178` — вызвать удаление
- shared `agent.ts:49` — `tools` удалить

Client (минимальная починка компиляции, дизайн — T9):
- `features/manage-agent/model/create-agent-from-preset.ts:32`, `ui/agent-config-dialog.tsx:46,63,86` — убрать `tools` из draft/submit; `agent-graph-node-fields.tsx:91-95` ОСТАЁТСЯ (легальное сужение ноды)

- [ ] **Step 1:** Закрыть инвентарь: `rg -n "\.tools\b|\btools:|deferredPacks" packages/harnesys/src apps/studio/server/src apps/studio/shared/src apps/studio/client/src -g '!*.json'` — каждый хит: удалить / узаконить как `node.tools`-сужение (llm-ноды, bind-agents graph, node-fields редактор) / объяснить в commit message.
- [ ] **Step 2:** Child-песочница: снять точный текущий набор удалений из `graph-spawn.ts` (`rg -n "sandbox|agents pack|toolMessages" src/application/graph-spawn.ts`) и воспроизвести в `sandboxUniverse` (файл `capability-set.ts`); smoke: делегат-спавн ребёнка без `agents_spawn` в наборе.
- [ ] **Step 3:** Library/server/shared/client правки.
- [ ] **Step 4:** lint+typecheck зелёные.
- [ ] **Step 5:** Стенд: раны живые (Assistant обычный тред: files через packs, ask_user через core, `load_tools` есть; llm-нода stock-графа без снапшота видит весь набор); `run.failed` нет.
- [ ] **Step 6:** Commit `refactor!: remove tool allowlist, deferredPacks, child filterToolsForAgent`.

### Task 7: Studio server + shared: формат modes, валидации записи, explain endpoint

**Files:**
- Modify: `apps/studio/shared/src/modes.ts:14-22` (`AgentMode.packs?: string[]` → `Record<string, PackAssignment>`, add `disabledTools?: string[]`, `exposure?: Record<string, ToolExposure>`; удалить transitional `normalizeModePackMap`, созданный в T5, только в T8 после миграции данных — до T8 `effectiveMode`/таргеты читают через него)
- Modify: `apps/studio/server/src/adapters/http/agent/agent.body.ts:8-14` (mode body zod: map-форма `PackAssignmentSchema`), потребители `mode.packs` в server (`runModeFields`/`effectiveMode` цепочка)
- Modify: `apps/studio/client/src/features/manage-agent/ui/agent-mode-fields.ts:17` (zod-массив → map; дизайн T9, здесь только компилируемость)
- Modify: таргеты: `universe.mode` из типизированного `AgentMode.packs` (нормализатор остаётся до T8)
- Create: `apps/studio/server/src/application/capabilities/validate-agent-config.use-case.ts` (вызов под `runInHostToolScope`, см. Global Constraints; ошибки строками)
- Create: `apps/studio/server/src/application/capabilities/list-agent-capabilities.use-case.ts` + controller + wire (`wire-controllers.ts`, роут `GET /api/agents/:id/capabilities`: `AgentCapabilitiesView = {explain: ExplainEntry[], registry: {name, exposure, source}[], subagents: AgentRosterEntry[]}`; для plugin-агентов id с `:` резолвится через каталог-порт)
- Modify: `create-agent.use-case.ts` (удалить `intersectDelegatePlugins` :235-245 → validate; `enabledPlugins` child ⊆ creator → `{error}`), `update-agent.use-case.ts:156-157` (enabledPlugins на update child — та же проверка; обход закрыт)

**Interfaces:**
- Consumes: `resolveCapabilitySet`, `buildCapabilityUniverse`.
- Produces: `ValidateAgentConfigUseCase`, `ListAgentCapabilitiesUseCase`, `normalizeModePackMap` (transitional), `AgentCapabilitiesView` (shared тип).

- [ ] **Step 1:** Правила спеки §7: источники зарегистрированы/установлены; `disabledTools` ⊆ выход источника (через `packTools` `tool-names.ts:25-33` под `runInHostToolScope`); core ∈ packs агента и каждого режима; child ⊆ creator-effective (текст `недоступно создателю: <source>`); режим не шире агента.
- [ ] **Step 2:** HTTP 400 (`ValidationError`-паттерн), tool-path → `{error}` в результат модели.
- [ ] **Step 3:** lint+typecheck; стенд: update child с чужим плагином → 400; agents_create_subagent с чужим паком → `{error}`, creator жив (R6 частично).
- [ ] **Step 4:** Commit `feat(studio-server): modes pack-map, config validation, capabilities endpoint`.

### Task 8: Данные, пресеты, skill-тексты (закрытая таблица)

**Files и правки:**
- `apps/studio/server/src/adapters/store/sqlite/bootstrap.ts`: миграция `capability_set_v1` (после `capability_core_v1` T5): `agents.tools` DROP COLUMN (`PRAGMA table_info` guard — колонку уже могла съесть предыдущая итерация), конверсия `agents.modes_json[].packs` массив→map (`{}`-value; `"plan"` → `{"plan":{}}`) для всех строк, `mode_presets.packs_json` то же, вставка core в `modes_json[].packs` (`{"core":{}}` merge)
- `apps/studio/server/src/config/mode-preset-seed.ts`: `packs` plan-пресета `{"plan":{}}`, остальные `{}`/undefined по смыслу
- Удалить `normalizeModePackMap` (shared) и его потребителей (T7 files) — после миграции читаем map
- Пресеты `apps/studio/assets/presets/agents/*.json` (10): удалить `tools` (agent-level: coder.json:122, assistant.json:210 и т.д.), удалить НЕПУСТЫЕ снапшоты `tools` из llm-нод графов (assistant.json:43-89,210-253 и аналоги), ОСТАВИТЬ `"tools": []` на pure-decision/map_item нодах (researcher.json:109, orchestrator.json:104, assistant.json:131-135), добавить `"core":{}` в `capabilities` каждого файла
- `apps/studio/assets/skills/agent-creator/SKILL.md`: строки 12 (node-контракт: undefined=all, []=none), 66-68 (boolean допустим; «packs never widens tools» и «tools names must also appear in tools» — переписать под source-грант), 85, 93 (create без tools; overrides), Packs-таблица (meta-источники верны, сверить core-строку)
- `packages/harnesys/src/packs/agents/{create-agents-tools.ts,index.ts}` — финальная вычитка описаний после T6

- [ ] **Step 1:** Миграции bootstrap (идемпотентность через `schema_meta`).
- [ ] **Step 2:** Проверка на копии: `bun temp/capability-migration-check.ts` (скрипт в `temp/`: копирует `~/.harnesys/studio.db` в `~/.harnesys/tmp/capability-check.db`, гоняет bootstrap-миграции, SELECT: колонки `tools` нет, modes map, core везде; вывод OK/FAIL) — в git не коммитить.
- [ ] **Step 3:** Пресеты + SKILL + seed.
- [ ] **Step 4:** lint+typecheck; стенд auto-reload: Assistant тред чистый; `rg -n '"tools"' apps/studio/assets/presets/agents/` — только llm/map_item-нодовые вхождения.
- [ ] **Step 5:** Commit `feat(studio): capability_set_v1 data migration; presets sources-only; skill texts updated`.

### Task 9: Клиент: карточки источников, overrides, превью из explain

**Files:**
- Create: `apps/studio/client/src/features/manage-agent/ui/agent-source-card.tsx` (switch grant; expand: тулы источника из explain-ответа — toggle disable + radio direct/deferred; `core`: чекбокс disabled + подпись «обязателен»; plugin-карточка: тул-Expand нет (их нет как источника тулов), только skills/mcp/hooks-секции explain)
- Create: `apps/studio/client/src/features/manage-agent/model/draft-overrides.ts` (merge правок в draft `capabilities`; zod `PackOverrideSchema`, `PackAssignmentSchema`)
- Create: `apps/studio/client/src/shared/api/agent-capabilities.ts` (`GET /api/agents/:id/capabilities`)
- Modify: `ui/draft-capabilities.tsx` (список источников = packs-universe (read-only endpoint воркспейса, уже есть `GET /api/workspaces/:id/capabilities`) ∪ plugins; чекбоксы-тулов отсюда удалить), `ui/agent-config-category-panes.tsx` (Tools-pane → explain-превью + tooltip provenance; поиск по имени), `ui/agent-mode-editor.tsx` + `ui/agent-mode-fields.ts` (map-форма, карточки режимов = тот же `agent-source-card` с сужением), `entities/agent`-сторы (без tools), invalidate explain-ключа после save

- [ ] **Step 1:** Типы/zod/serialize (draft → body `capabilities: PackAssignment`-map).
- [ ] **Step 2:** Карточка источника + режимы.
- [ ] **Step 3:** Превью-pane из explain (источник данных только API).
- [ ] **Step 4:** lint+typecheck; агент-browser: Assistant — превью непустое, карточки = capabilities; disable `shell` у `files` → save → превью без `shell`; core-строка disabled-state; R7 tooltip `pack:pin-memory`.
- [ ] **Step 5:** Grep-гейт: `rg -n "\bagent\.tools\b|draft\.tools|preset\.tools|\.tools\b" apps/studio/client/src -g '!*node-fields*'` — только explain/registry-поля (редактор нод исключён из грепа осознанно).
- [ ] **Step 6:** Commit `feat(studio-client): source cards with overrides; explain-backed preview`.

### Task 10: Приёмка R1–R7 (manual: agent-browser, curl, sqlite, temp-скрипты)

- [ ] **Step 1 (создать стенд-агентов):** `POST /api/agents` (curl, workspace хозяина): агент `cap-test-empty` без capabilities (после T5 миграции core авто, это ок: core это не пак-тулы), `cap-test-full` с копиями capabilities Assistant (без plugins).
- [ ] **Step 2 (R1):** `cap-test-empty` тред: `shell echo hi` → отказ-результат (tool не в наборе — «неизвестный инструмент»/`{error}`), ран `completed`; `SELECT ... run_events ... type='run.failed'` пусто.
- [ ] **Step 3 (R2 tool):** `cap-test-empty`: `agents_spawn {agentId:'code-explorer'}` → `{error: unknown spawn target...}`; текст == строка `resolveAgentTarget`; ростер без plugin-строк (B3).
- [ ] **Step 4 (R2 node-путь, детерминированный рецепт):** tool-путь уже покрыт Step 3. Ноду проверяем через гонку, которую управляем: агент A создаёт делегата C (`agents_create_subagent`), затем одним сообщением просим A выдать пакет tool-вызовов `[agents_spawn(C), ask_user]` (ordered режим `toolMessages` гарантирует spawn до паузы ask_user); на паузе удалить C через `DELETE /api/agents/:id`; ответить на ask; ожидаем: `control:spawn` на устаревшем roster даёт per-call deny в «Spawn results» с тем же текстом `unknown spawn target` (`agent-target-resolve.ts:49` — общая функция с tool-путём), ран `completed`, `run_events` без `run.failed`.
- [ ] **Step 5 (R2+):** Assistant (feature-dev включён): спавн `code-explorer` по имени — полный цикл, child-отчёт в результатах.
- [ ] **Step 6 (R3):** `agents_list` Assistant: `packs` = 13+core; превью `tools` ⊇ `write_file`, `pin_set`, `agents_spawn`.
- [ ] **Step 7 (R4 + N+1-замер):** UI Plugins: выключить `feature-dev` → новый Assistant-тред: `agents_list` без plugin-агентов (recompute per resolve, кэша нет). Замер: время `POST agents_list` на 10+ агентах (`time` по событию tool в run_events: timestamp delta) — >150 ms → завести задачу configRevision-кэша (отдельная спека-строка, не здесь).
- [ ] **Step 8 (R5):** `temp/s1-core-host.ts`: чистые assert `resolveCapabilitySet` (без LLM): universe `{registrations:[coreCapability], baseRegistry:{echo}, roster:[], makeLoadTools: stub}`; def без packs → registry={echo}; def с `core` → +ask_user/map/wait/load_tools; print OK.
- [ ] **Step 9 (R6):** child с чужим паком (tool-path и HTTP-path) → `{error}`/400, creator ран жив.
- [ ] **Step 10:** Финальные `bun run lint && bun run typecheck`; отчёт человеку (скрины/логи по запросу).

---

## Self-review checklist (после ревью-2, все пункты сверены кодом 2026-09-15)

- Блокер 1: ports/scope в `CapabilityUniverse.registrations` (PackRegistration уже их несёт, `domain/pack.ts:53-57`); ALS-контракт прописан в Global Constraints + `runInHostToolScope` для валидаций T7.
- Блокер 2: `group:'plugin:<name>'` выдумка — удалена из T1 (плагины: subagents через `roster.plugin` + enabledPlugins; plugin-MCP через `def.mcpServers`; тулы плагина = pack-алиасы, отдельного тул-гранта нет); двойной источник subagents (roster+pluginSubagents) свёрнут в один `roster.plugin?: string`.
- Блокер 3: `[]`=none / `undefined`=all зафиксированы глобально; `tools: []` в researcher/orchestrator/assistant(map_item) НЕ удаляются (T8 таблица); «map-нода tools» вычеркнуто (`control:map` поля не имеет); `graph.ts:809` — wrap-шаг, не трогаем.
- Блокер 4: миграция modes (`bootstrap capability_set_v1`: modes_json/packs_json массив→map, seed `config/mode-preset-seed.ts`), transitional `normalizeModePackMap` с точкой удаления T8; литералы `true/false/null` унифицированы (registry-эталон, body/preset-loader/SKILL подтянуты); update-обход enabledPlugins закрыт T7 (clamp `intersectDelegatePlugins` удалён).
- Блокер 5: баррель `packages/harnesys/index.ts` (исправлено); два разных `list` пораззнены (AgentsResolve vs AgentsCatalogPort, parity ростеров — предусловие T5 Step 2, assert в T10); foreign-check остался в движе (defense-in-depth); handoff-тул имеет собственный текст (top-level) — из R2-parity исключён явно; инвентарь T6/T9 дополнен: `agent-presets-fs.adapter.ts`, `create-agent-from-preset` (server+client), `agent-config-dialog`, `agent-graph-node-fields` (легальное сужение), grep-гейт клиента переписан.
- Мелочи ревьюера: B1 строки (169/175 + shape 122) в спеке; B6 числа (DB-колонка 6 vs пресет 42/45) в спеке; черновик bak-cw из T8 удалён (проверка на копии в temp-скрипте); `PackOverrideSpec→PackOverride` синхронизированы; core-мета честная (3 тула + `CORE_SERVICE_TOOLS` грант-механика) — в спеке §2; T4 collision решён (baseRegistry минус CORE_SERVICE_TOOLS + pack-overwrite-host правило); T4 regression-окно закрыто (capabilitySet-приоритет с T5, старый `deferredPackNames` убирается тем же таском); T5-замок: каталог уже из реестра рана (`llm.ts:144`), ложное утверждение исправлено в спеке §5, load_tools-direct семантика сохранена; universe-проброс детей расписан (RunTarget.universe → RunTargetOpts → GraphOpts → sandbox в T6 Step 2); bind-agents инверсия заменена `packsForTools` + снапшот-сужение нод; DDL-порядок: domain (T6) → DROP COLUMN (T8), drizzle-колонка живёт до T8, bun-sqlite DROP COLUMN проверен; StressProbe в T10 заменён curl-созданием агентов; N+1-замер в T10 Step 7 с критерием.
- Имена между тасками едины: `resolveCapabilitySet`, `CapabilityUniverse`, `RunRegistry`, `listScopedRoster`, `buildCapabilityUniverse`, `PackOverride`, `CORE_SERVICE_TOOLS`, `normalizeModePackMap`, `effectivePlugins` (общий модуль).
