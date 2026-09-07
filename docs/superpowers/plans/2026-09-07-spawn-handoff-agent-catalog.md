# Spawn / handoff + agent catalog — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Исполнять `control:spawn` / `control:handoff` в библиотеке; дать порт и tools каталога агентов; в Studio подключить БД, скилл с JSON-пресетами и кнопку From Preset.

**Architecture:** Библиотека владеет runtime нод и пачкой `agents` над `AgentsCatalogPort`. Studio реализует порт через существующие use case’ы, монтирует `apps/studio/skills/author-agents` в skill roots, From Preset читает те же `presets/*.json`. Пресеты не протекают в библиотеку.

**Tech Stack:** TypeScript, bun, harnesys capabilities, Studio SQLite agents, FsSkillRegistry, biome.

**Spec:** `docs/superpowers/specs/2026-09-07-spawn-handoff-agent-catalog-design.md`

## Global Constraints

- Тесты запрещены (AGENTS.md). Верификация таска: `bunx biome check` на затронутых путях + typecheck (`bunx tsc -p packages/harnesys/tsconfig.json --noEmit`; в `apps/studio` — `bun run typecheck`). UI/сценарии — agent-browser по AGENTS.md, порты 3000/5173 не поднимать вторым стендом.
- `graph.ts` (~989 строк) не раздувать: spawn/handoff в отдельных файлах.
- Публичные типы библиотеки — только из спеки; слово `preset` в `packages/harnesys` не появляется.
- Коммиты: `feat(harnesys): …`, `feat(studio): …`.
- После create агент сразу виден через `agents.resolve(id)` (уже `findById`).

## File map

| Файл | Ответственность |
|------|-----------------|
| `packages/harnesys/src/ports/agents-catalog.ts` | Порт list/get/create |
| `packages/harnesys/src/capabilities/agents/*` | Пачка + tools |
| `packages/harnesys/src/application/graph-spawn.ts` | Исполнение spawn |
| `packages/harnesys/src/application/graph-handoff.ts` | Исполнение handoff (ребинд агента) |
| `packages/harnesys/src/application/graph.ts` | Ветки вызова spawn/handoff вместо `node_unsupported` |
| `packages/harnesys/src/application/run-engine*.ts` | `agents` в deps/GraphOpts; session event handoff |
| `apps/studio/server/adapters/capabilities/sqlite-agents-catalog.port.ts` | Адаптер порта |
| `apps/studio/server/composition/wire-capabilities.ts` | registerCapability(agents) |
| `apps/studio/server/application/agents/*` | optional graph на create; не затирать custom graph на update |
| `apps/studio/skills/author-agents/**` | SKILL.md + presets/*.json |
| `apps/studio/client/.../workspace-sidebar.tsx` + feature From Preset | UI |

---

### Task 1: GraphOpts + wiring `agents` в движок

**Files:**
- Modify: `packages/harnesys/src/application/graph.ts` (`GraphOpts`)
- Modify: `packages/harnesys/src/application/run-engine-types.ts` (`RunEngineDeps`)
- Modify: `packages/harnesys/src/application/run-engine.ts` (сборка `graphOpts`)
- Modify: `packages/harnesys/src/application/create-runtime.ts` (`run`/`start` передают `agents`)
- Modify: место создания `createRunEngine` (передать `agents: options.agents`)

**Interfaces:**
- Consumes: `AgentsResolve` из `ports/create-runtime.ts`
- Produces: `GraphOpts.agents: AgentsResolve`; `RunEngineDeps.agents: AgentsResolve`

- [ ] **Step 1: Расширить типы**

В `GraphOpts` и `RunEngineDeps` добавить:

```ts
agents: AgentsResolve;
```

- [ ] **Step 2: Протянуть из createRuntime / run-engine**

Во все вызовы `startGraph` / `runGraph` / сборку `graphOpts` в `run-engine.ts` передать `agents: deps.agents` / `options.agents`. Найти `createRunEngine({...})` в create-runtime/session path и добавить поле.

- [ ] **Step 3: Проверка**

```bash
bunx tsc -p packages/harnesys/tsconfig.json --noEmit
bunx biome check packages/harnesys/src/application/graph.ts packages/harnesys/src/application/run-engine.ts packages/harnesys/src/application/run-engine-types.ts packages/harnesys/src/application/create-runtime.ts
```

Expected: typecheck зелёный (или только ошибки в ещё несуществующих spawn-вызовах — их быть не должно на этом шаге).

- [ ] **Step 4: Commit**

```bash
git add packages/harnesys/src/application/graph.ts packages/harnesys/src/application/run-engine.ts packages/harnesys/src/application/run-engine-types.ts packages/harnesys/src/application/create-runtime.ts
git commit -m "$(cat <<'EOF'
feat(harnesys): wire agents resolve into GraphOpts

EOF
)"
```

---

### Task 2: Runtime `control:spawn`

**Files:**
- Create: `packages/harnesys/src/application/graph-spawn.ts`
- Modify: `packages/harnesys/src/application/graph.ts` (ветка до `node_unsupported`)

**Interfaces:**
- Consumes: `GraphOpts`, `evalExpr`, `startGraph`, `RuntimeState.child`, `compileOrThrow`, `filterToolsForAgent`
- Produces: исполнение spawn; `$output` = массив результатов; коды `spawn_target_missing`

- [ ] **Step 1: Контракт вызова**

В `graph-spawn.ts`:

```ts
export type SpawnCall = { agentId: string; input: unknown };

export type SpawnItemResult = {
  agentId: string;
  spawnId: string;
  status: 'completed' | 'failed' | 'cancelled' | 'needs_input' | 'budget_exceeded' | string;
  output?: unknown;
  error?: { code: string; message: string };
};

export async function* runSpawnNode(args: {
  node: Extract<Node, { type: 'control:spawn' }>;
  slots: { input: unknown; state: Record<string, unknown>; output: unknown; resume: unknown };
  opts: GraphOpts;
  parentCommit: (...args: /* same as local commit in startGraph */) => Promise<Event>;
}): AsyncGenerator<Event, SpawnItemResult[]>
```

Реализация (логика):

1. `callsRaw = evalExpr(node.calls, slots)` (или уже значение); нормализовать в `SpawnCall[]` (отклонить не-массив).
2. `concurrency`: `'sequential' | 'parallel'` после eval при необходимости.
3. На каждый call: `def = opts.agents.resolve(agentId)`; нет → commit failed + throw `{ code: 'spawn_target_missing' }`.
4. `spawnId = crypto.randomUUID()`; `childState = opts.state.child(spawnId)`.
5. Yield/commit событие `agent.spawned` с `metadata: { agentId, spawnId }` (тип из `EVENT_TYPES.AGENT_SPAWNED`).
6. Собрать child `GraphOpts`: тот же models/mergeState/toolMessages/notes/capabilityRegistrations/agents; `toolRegistry` = filter+load_tools для child def; `plan = compileOrThrow(def)`; `input = call.input`; `state = childState`.
7. `for await (const ev of startGraph(childOpts))` — пробрасывать наружу или агрегировать; по завершении commit `agent.completed` / `agent.failed`.
8. Sequential: по одному; parallel: `Promise.all` по child runs (если generator неудобен — собрать через внутренний async drain в Promise). Barrier `all`: дождаться всех.
9. Вернуть массив `SpawnItemResult` в порядке calls → родитель ставит `output = results`.

Подпись `parentCommit` подогнать под фактический `commit` в `graph.ts` (скопировать нужные поля ctx), либо передавать колбэки `emit(type, meta)`.

- [ ] **Step 2: Ветка в graph.ts**

Перед финальным `else` (`node_unsupported`):

```ts
} else if (node.type === 'control:spawn') {
  const results = yield* runSpawnNode({ node, slots, opts, parentCommit: commit });
  output = results;
  const e = await commit('running', 'node.completed');
  yield e;
} else if (node.type === 'control:handoff') {
  // Task 3
} else {
```

Пока handoff можно оставить на Task 3 (всё ещё unsupported).

- [ ] **Step 3: Проверка**

```bash
bunx tsc -p packages/harnesys/tsconfig.json --noEmit
bunx biome check packages/harnesys/src/application/graph-spawn.ts packages/harnesys/src/application/graph.ts
```

Ручная проверка (когда есть два агента в БД): граф родителя с одной spawn-нодой на известный uuid — дочерний ран отрабатывает, в журнале `agent.spawned` / `agent.completed`. Неизвестный id → `spawn_target_missing`.

- [ ] **Step 4: Commit**

```bash
git add packages/harnesys/src/application/graph-spawn.ts packages/harnesys/src/application/graph.ts
git commit -m "$(cat <<'EOF'
feat(harnesys): execute control:spawn

EOF
)"
```

---

### Task 3: Runtime `control:handoff` + session event

**Files:**
- Create: `packages/harnesys/src/application/graph-handoff.ts`
- Modify: `packages/harnesys/src/application/graph.ts`
- Modify: `packages/harnesys/src/ports/session.ts` (тип SessionEvent)
- Modify: `packages/harnesys/src/application/run-engine-events.ts` (`eventToSessionEvent`)

**Interfaces:**
- Consumes: `GraphOpts.agents`, `compileOrThrow`
- Produces: ребинд текущего `startGraph` на целевого агента; SessionEvent `{ type: 'agent.handoff'; agentId: string }`

**Семантика v1 (из спеки):** ран не плодит child state. После handoff-ноды тот же `startGraph` продолжает с definition цели: новый `plan`, `input` = handoff input, `cur` = start цели, toolRegistry/capabilities пересобрать под цель. Событие handoff уходит в session feed, чтобы Studio обновила `thread.agentId`.

- [ ] **Step 1: SessionEvent**

```ts
| { type: 'agent.handoff'; agentId: string; seq?: number; runId?: string }
```

В `eventToSessionEvent`: если `ev.type === 'agent.spawned'` и `metadata.handoff === true` (или отдельный event type — выбрать один и держаться его; предпочтение: metadata на `agent.spawned` с `handoff: true`, без нового EVENT_TYPES), вернуть `agent.handoff`.

- [ ] **Step 2: graph-handoff.ts**

Функция, которая по ноде и slots возвращает:

```ts
export type HandoffRebound = {
  agent: AgentDefinition;
  plan: Plan;
  input: unknown;
  toolRegistry: Map<string, ToolDefinition>;
  startNodeId: string;
};

export function prepareHandoff(node: Extract<Node, { type: 'control:handoff' }>, slots: ..., opts: GraphOpts): HandoffRebound
```

Resolve `agentId` (string или eval); нет def → throw `{ code: 'handoff_target' }`. Eval `input`. `compileOrThrow`, filter tools, start = единственный `core:start`.

- [ ] **Step 3: Ветка в startGraph**

Локальные `let agent = opts.agent`, `let plan = opts.plan`, `let input = opts.input`, `let toolRegistry = opts.toolRegistry` (сейчас часть из `opts` напрямую — завести let-копии в начале цикла/функции там, где читается agent/plan). На handoff:

1. `rebound = prepareHandoff(...)`
2. commit/yield event `agent.spawned` с `{ agentId, handoff: true }`
3. присвоить let-копии; `cur = rebound.startNodeId`; `output = null`; `continue` главного while (не инкрементировать как обычный шаг-выход на matchOutgoing — handoff сам переключает cur)

Аккуратно: не провалиться в matchOutgoing со старыми edges. После присвоения `continue` в while.

- [ ] **Step 4: Проверка + commit**

```bash
bunx tsc -p packages/harnesys/tsconfig.json --noEmit
bunx biome check packages/harnesys/src/application/graph-handoff.ts packages/harnesys/src/application/graph.ts packages/harnesys/src/ports/session.ts packages/harnesys/src/application/run-engine-events.ts
```

```bash
git add packages/harnesys/src/application/graph-handoff.ts packages/harnesys/src/application/graph.ts packages/harnesys/src/ports/session.ts packages/harnesys/src/application/run-engine-events.ts
git commit -m "$(cat <<'EOF'
feat(harnesys): execute control:handoff

EOF
)"
```

---

### Task 4: Порт `AgentsCatalogPort` + пачка `agents`

**Files:**
- Create: `packages/harnesys/src/ports/agents-catalog.ts`
- Create: `packages/harnesys/src/capabilities/agents/create-agents-tools.ts`
- Create: `packages/harnesys/src/capabilities/agents/prompt.ts`
- Create: `packages/harnesys/src/capabilities/agents/index.ts`
- Modify: `packages/harnesys/index.ts` (экспорт порта, пачки, типов; `AgentGraph`, `AgentBudget` если ещё не экспортированы)

**Interfaces:**
- Produces: типы и `agentsCapability` как в спеке (`AgentCatalogSummary`, `AgentCatalogCreateInput`, `AgentsCatalogPort`); tools `agents_list`, `agents_create`

- [ ] **Step 1: Порт** — дословно по спеке (`docs/superpowers/specs/2026-09-07-spawn-handoff-agent-catalog-design.md`, секция «Порт»). Импорты типов из `domain/agent-definition.ts` / `capability.ts`.

- [ ] **Step 2: Tools** по образцу `capabilities/plan/create-plan-tools.ts`:

`agents_list`: input `{ role?: string; name?: string }` → `port.list(scope, filter)`.

`agents_create`: input поля `AgentCatalogCreateInput` (graph как object) → `port.create`; ошибки через `runGuard` → `{ error: string }`.

- [ ] **Step 3: Пачка**

```ts
export type AgentsCapabilityPorts = { agentsCatalog: AgentsCatalogPort };

export const agentsCapability = defineCapability<AgentsCapabilityPorts>({
  name: 'agents',
  version: '1.0.0',
  description: 'List and create agents in the host catalog',
  requires: ['agentsCatalog'],
  tools: (ctx) => createAgentsTools({ catalog: ctx.ports.agentsCatalog, resolveScope: ctx.resolveScope }),
  prompt: () => AGENTS_PROMPT_FRAGMENT,
});
```

Промпт: list → create → делегирование по id через spawn/handoff. Без слова preset.

- [ ] **Step 4: Экспорт из index.ts**

- [ ] **Step 5: Проверка + commit**

```bash
bunx tsc -p packages/harnesys/tsconfig.json --noEmit
bunx biome check packages/harnesys/src/ports/agents-catalog.ts packages/harnesys/src/capabilities/agents packages/harnesys/index.ts
git add packages/harnesys/src/ports/agents-catalog.ts packages/harnesys/src/capabilities/agents packages/harnesys/index.ts
git commit -m "$(cat <<'EOF'
feat(harnesys): agents catalog port and capability

EOF
)"
```

---

### Task 5: Studio — create/update graph + адаптер порта + wiring

**Files:**
- Modify: `apps/studio/server/application/agents/create-agent.use-case.ts` (optional `graph?: AgentGraph`)
- Modify: `apps/studio/server/application/agents/update-agent.use-case.ts` (не затирать non-stock graph)
- Create: `apps/studio/server/application/agents/is-stock-react-graph.ts` (сравнение с `buildReactGraph`)
- Create: `apps/studio/server/adapters/capabilities/sqlite-agents-catalog.port.ts`
- Modify: `apps/studio/server/composition/wire-capabilities.ts`
- Modify: HTTP create body / shared types при необходимости проброса `graph`

**Interfaces:**
- Consumes: `AgentsCatalogPort`, `CreateAgentUseCase`, `agentsCapability`
- Produces: работающие tools при `capabilities.agents` у агента

- [ ] **Step 1: is-stock-react-graph**

```ts
export function isStockReactGraph(graph: AgentGraph, tools: string[]): boolean {
  return JSON.stringify(graph) === JSON.stringify(buildReactGraph(tools));
}
```

(при необходимости нормализовать ключи/порядок — если stringify хрупок, сравнить nodes/edges структурно по образцу buildReactGraph.)

- [ ] **Step 2: create** — если `request.graph` задан: `assertAgentGraphValid` и сохранить его; иначе `buildReactGraph` как сейчас.

- [ ] **Step 3: update** — блок `if (request.tools !== undefined || request.memory !== undefined)`:

```ts
const nextTools = ...;
const stock = isStockReactGraph(agent.graph, /* tools used to build current */);
if (request.graph !== undefined) {
  patch.graph = request.graph;
} else if (stock) {
  patch.graph = buildReactGraph(graphTools);
}
// else: leave custom graph
```

Точный baseline tools для stock-check: tools+memoryToolNames текущего агента до патча.

- [ ] **Step 4: SqliteAgentsCatalogPort**

`list`: `agents.listByWorkspace(scope.workspaceId)`, фильтр role/name (case-insensitive includes для name).  
`get`: `findById` + map в `AgentDefinition` тем же путём, что `workspace-harnesys.registry.resolveAgent` (вынести shared mapper, если копипаста >15 строк — в маленький `agent-row-to-definition.ts`).  
`create`: вызвать `CreateAgentUseCase.execute` с полями input; вернуть `{ id, name }`. Conflict имени — ошибка наверх (tool вернёт error).

- [ ] **Step 5: wire-capabilities**

```ts
registerCapability(
  agentsCapability,
  {
    agentsCatalog: new SqliteAgentsCatalogPort({
      agents: deps.agents,
      createAgent: new CreateAgentUseCase(deps.agents, /* models if available */),
      toDefinition: ...,
    }),
  },
  resolveScope,
),
```

Подтянуть `LlmModelRepository` в deps wiring, если create требует models (как в wire-controllers).

- [ ] **Step 6: Проверка + commit**

```bash
cd apps/studio && bun run typecheck
bunx biome check apps/studio/server/application/agents apps/studio/server/adapters/capabilities/sqlite-agents-catalog.port.ts apps/studio/server/composition/wire-capabilities.ts
git add apps/studio/server/application/agents apps/studio/server/adapters/capabilities/sqlite-agents-catalog.port.ts apps/studio/server/composition/wire-capabilities.ts
git commit -m "$(cat <<'EOF'
feat(studio): agents catalog port and custom graph save

EOF
)"
```

---

### Task 6: Studio — handoff обновляет `thread.agentId`

**Files:**
- Modify: место обработки session events при run (искать подписчиков `SessionEvent` / journal apply в studio server) — обновить `threads.update(threadId, { agentId })` при `type === 'agent.handoff'`
- Modify: `apps/studio/server/domain/thread.port.ts` / use case update thread agent, если отдельного метода нет

- [ ] **Step 1: Найти единственную точку**, где session events уже пишутся в desk/UI (например send-thread-run / event bridge).

- [ ] **Step 2: На `agent.handoff`:** проверить, что агент существует в том же workspace; `threads` patch `agentId`; desk event при необходимости, чтобы сайдбар/хедер треда сменил агента.

- [ ] **Step 3: Проверка + commit**

Typecheck + biome на затронутых файлах.

```bash
git commit -m "$(cat <<'EOF'
feat(studio): bind thread to handoff target agent

EOF
)"
```

---

### Task 7: Скилл `author-agents` + JSON пресеты + skill roots

**Files:**
- Create: `apps/studio/skills/author-agents/SKILL.md`
- Create: `apps/studio/skills/author-agents/presets/{orchestrator,explorer,researcher,coder,reviewer,tester,planner,writer}.json`
- Modify: `apps/studio/server/adapters/workspace-harnesys.registry.ts` — второй root: каталог `apps/studio/skills` (абсолютный путь от `import.meta.dir` / `fileURLToPath`)

**Interfaces:**
- Produces: скилл виден в `FsSkillRegistry`; пресеты — единый каталог для UI

- [ ] **Step 1: Пресеты JSON**

Поля: `name`, `role`, `instructions`, опционально `tools`, `skills`, `budget`, `capabilities`.  
Специалисты — без `graph` (Studio buildReactGraph).  
`orchestrator.json` — явный `graph` со start/think/act/end плюс пример spawn-ноды (calls expr на `$state.teamCalls` или статический комментарий в SKILL, как писать calls после create).

Роли: Orchestrator, Explorer, Researcher, Coder, Reviewer, Tester, Planner, Writer.

- [ ] **Step 2: SKILL.md**

Frontmatter `name: author-agents`. Тело: словарь нод; ReAct JSON-пример (ссылка на explorer.json); оркестратор; порядок `agents_list` → create → spawn/handoff по id; валидация через ошибки tool; отбор по role затем instructions. Не описывать host preset API как библиотечный.

- [ ] **Step 3: Roots**

```ts
roots: [
  join(workspace.path, '.agents', 'skills'),
  studioSkillsRoot, // .../apps/studio/skills
],
```

В обоих местах создания `FsSkillRegistry` в этом файле.

- [ ] **Step 4: Проверка + commit**

Убедиться, что skills list в runtime отдаёт `author-agents` (лог/inspector). biome на ts.

```bash
git add apps/studio/skills/author-agents apps/studio/server/adapters/workspace-harnesys.registry.ts
git commit -m "$(cat <<'EOF'
feat(studio): author-agents skill and preset JSON catalog

EOF
)"
```

---

### Task 8: From Preset UI

**Files:**
- Create: `apps/studio/server/...` endpoint или переиспользовать POST agents с телом из пресета (предпочтительно client читает пресеты через новый GET `/api/agent-presets` → список из тех же JSON на диске)
- Create: server helper `listAgentPresets()` / `readAgentPreset(id)` читает `apps/studio/skills/author-agents/presets`
- Modify: `apps/studio/client/src/widgets/workspace-sidebar/ui/workspace-sidebar.tsx` (убрать toast)
- Create: feature `manage-agent` dialog/menu выбора пресета → `createAgent` с полями + unique name (`Coder`, `Coder 2`, …)

- [ ] **Step 1: API list presets** — имена файлов без `.json`, отдать `{ id, name, role, instructions, ... }`.

- [ ] **Step 2: Unique name** — если `findByName` занято, суффикс ` ${n}` пока свободно.

- [ ] **Step 3: UI** — Dropdown From Preset → подменю или диалог со списком → create → агент в сайдбаре.

- [ ] **Step 4: agent-browser**

На живых 5173/3000: From Preset → Explorer; повторно → Explorer 2; оба с role Explorer.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(studio): From Preset creates agents from skill JSON

EOF
)"
```

---

### Task 9: Сквозная приёмка (agent-browser)

**Files:** — (только проверка)

- [ ] **Step 1:** Порты 3000/5173 слушают (не стартовать второй стенд).

- [ ] **Step 2:** Включить у оркестратора `capabilities.agents` (и skills allowlist с `author-agents` при необходимости).

- [ ] **Step 3:** Сценарии:
  1. From Preset создаёт Coder/Explorer.
  2. Оркестратор через tools: `agents_list` / `agents_create`, затем в графе spawn на созданный id (можно временно руками прописать graph оркестратора).
  3. Handoff на другого агента → следующий user message идёт уже к новому (thread.agentId сменился).
  4. Update tools у оркестратора с custom graph → spawn-ноды на месте.

- [ ] **Step 4:** Зафиксировать в чате хозяину, что прошло / что нет. Без claim «done» без прогона.

---

## Spec coverage

| Спека | Таск |
|-------|------|
| control:spawn runtime | 2 |
| control:handoff runtime | 3 |
| AgentsCatalogPort + capability | 4 |
| Studio adapter, create graph, update stock guard | 5 |
| thread follows handoff | 6 |
| skill + presets JSON + roots | 7 |
| From Preset | 8 |
| Приёмка | 9 |
| Нет preset в library | 4 (constraint) |
| Нет sourcePresetId / ensure_preset | — не делается |
| Бюджет детей раздельный | 2 (не объединяем счётчики) |

## Placeholder / consistency self-check

- Имя пачки: `agents`; порт поле ports: `agentsCatalog`.
- Коды: `spawn_target_missing`, `handoff_target`.
- Пресеты path: `apps/studio/skills/author-agents/presets`.
- SessionEvent: `agent.handoff`.
`)