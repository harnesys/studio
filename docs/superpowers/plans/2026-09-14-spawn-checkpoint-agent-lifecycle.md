# Spawn-checkpoint и lifecycle агентов (D6, D9) Implementation Plan

> **For agent workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spawn-результаты переживают падение родителя и не переигрываются при retry; модель может обновлять и удалять своих делегатов, а удаление агента (моделью или из UI) не оставляет мусора в schedules/webhooks/pins/memory.

**Architecture:** В движке: стабильный `spawnId` рождается при очереди интента, каждый завершившийся ребёнок чекпоинтится в state узла `control:spawn` с коммитом, повторный вход в узел пропускает уже готовые. В библиотеке: `AgentsCatalogPort` получает опциональные `patch`/`remove` (без них тулы не регистрируются); в Studio-порту они работают через существующие репозитории. Очистка побочных записей при удалении — уровень хоста (DeleteAgentUseCase), потому что расписание/пины/память — хостовые таблицы.

**Tech Stack:** TypeScript, bun, biome; `packages/harnesys` (application, packs/agents, ports), `apps/studio/server` (use-cases, adapters), `apps/studio/assets` (SKILL.md, пресеты).

**Spec:** этого документа достаточно; он же — предложение на согласование. Пункты D1/D6-peek уже решены/срезаны (см. «Не делать»), спорить здесь не о чем.

## Факты разведки (не перепроверять, верить коду на 2026-09-14)

- `run-engine.ts:118-145`: события детей уже журналируются хостом — строка `runs` с `runId = spawnId`, `parentRunId = runId`, терминал закрывает ран; `RunLifecycleStore.childrenByParent` есть (`ports/run-lifecycle-store.ts:56`).
- Клиент уже стримит детей: `use-spawn-stream.ts` подключает `/api/runs/:id/events` по spawnId; `Spawn results` в истории содержит `spawnId` (`SpawnResultItem`, `appendSpawnResultsMessage`).
- Значит пользователю журнал уже доступен. Остаток D6 — надёжность движка: `executeSpawn` ждёт барьер целиком (`graph.ts:1146-1166`), emissions/результаты коммитятся только после него; падение/lease-lost между завершением детей и `node.completed` = результаты потеряны, retry прогоняет детей заново.
- `spawnId` сейчас генерируется в `resolveTargets` (`graph-spawn.ts:184`, `crypto.randomUUID()`) при каждом prepare — при retry это уже другие id, дедупликации нет.
- `QueuedSpawnCall` (`graph-agent-controls.ts`, строки ~40-70): `{agentId, input, budget?}`; очередь живёт в `state[STATE_SPAWNS_KEY]`, переживает рун.
- `AgentsCatalogPort` (`ports/agents-catalog.ts`): `list/get/create`. Реализация Studio — `adapters/capabilities/sqlite-agents-catalog.port.ts`; `list` уже фильтрует видимость: top-level + свои делегаты.
- `DeleteAgentUseCase` (`application/agents/delete-agent.use-case.ts`): каскад своих делегатов + `threads.deleteByAgent`, но NOT schedules/webhooks/pins/memory.
- Таблицы с ссылкой на агента: `schedules.target_agent_id`, `webhooks.target_agent_id`, `semantic_memories.agent_name`, `agent_pins.agent_name` (ключ — ИМЯ, не id; одно имя может носить другой агент — удалять только если имя осиротело).
- Тул-пак `agents`: `createAgentsTools({agents, resolveScope})`; `CapabilityScope` = `{workspaceId, agentId, agentName?, threadId}`; ошибки тулов — `{ error }` через `runGuard`.

## Global Constraints

- Тесты запрещены (AGENTS.md). Ворота: `bun run lint` в корне, `bun run typecheck` в корне (harnesys + studio), ручная проверка на живом стенде (API 3000 / Vite 5173 подняты хозяином; свой стенд не поднимать, чужие процессы не трогать; перед браузерной проверкой `agent-browser skills get core`).
- Изменения публичной поверхности `harnesys` (новый опциональный метод порта, новые имена тулов) — только как в этом плане, без расширения «заодно».
- Файлы ≤ ~350 строк (biome `noExcessiveLinesPerFile`); при упоре — выделять sibling-файл по ответственности, как сделано в `packs/agents/handoff-target.ts`.
- Типы именованные, без `T['field']`/`Parameters<typeof fn>[0]`. Проза описаний тулов/SKILL.md — по контракту репозитория (факт → детали, без слоганов).
- Формат событий не ломать: `agent.spawned/agent.completed/agent.failed` сохраняют типы и metadata; меняется только момент их появления (по завершении ребёнка, а не после барьера).

---

### Task 1: Стабильный `spawnId` на этапе очереди

**Files:**
- Modify: `packages/harnesys/src/application/graph-agent-controls.ts` (`QueuedSpawnCall`, `spawnCallsOf`)
- Modify: `packages/harnesys/src/application/graph-spawn.ts` (`SpawnCall`, `parseCalls`, `resolveTargets`)

**Interfaces:**
- Produces: `SpawnCall = { agentId: string; spawnId?: string; input: unknown; budget?: AgentBudget }`; `QueuedSpawnCall = SpawnCall`. Элементы `state.spawns` несут `spawnId`, сгенерированный один раз при очередировании.
- Consumes (из текущего кода): `STATE_SPAWNS_KEY`, `spawnInputOf`.

- [ ] **Step 1:** В `graph-agent-controls.ts` добавить в тип `QueuedSpawnCall` поле `spawnId: string`, в `spawnCallsOf` — `spawnId: crypto.randomUUID()` для каждого валидного ряда.
- [ ] **Step 2:** В `graph-spawn.ts`: `SpawnCall.spawnId?: string`; `parseCalls` пробрасывать `spawnId` строкой если задан; `resolveTargets` — `spawnId: call.spawnId ?? crypto.randomUUID()` (ручной `calls`-expr без очереди остаётся рабочим).
- [ ] **Step 3:** `bun run lint && bun run --cwd packages/harnesys typecheck`; коммит `feat: stable spawn ids queued with the spawn intent`.

### Task 2: Пер-рёберный коммит результатов спавна и идемпотентный повторный вход

**Files:**
- Modify: `packages/harnesys/src/application/graph-spawn.ts` (`executeSpawn`, `prepareSpawn`, `SpawnNodeOutcome`)
- Modify: `packages/harnesys/src/application/graph.ts` (ветка `control:spawn`, строки ~1130-1169)
- Modify: `packages/harnesys/src/constants.ts` (новый ключ состояния)
- Modify: `apps/studio/assets/skills/agent-creator/SKILL.md` (пункт `control:spawn`: события появляются по мере завершения детей; упавший рун на retry не переигрывает завершившихся детей)

**Interfaces:**
- Consumes: `spawnId` из Task 1.
- Produces: `STATE_SPAWN_RESULTS_KEY = 'spawnResults'` в constants; узел пишет в `st[STATE_SPAWN_RESULTS_KEY]` массив завершённых `SpawnResultItem` (в порядке фактического завершения) и коммитит снапшот на каждого ребёнка; при входе узел отфильтровывает из очереди целевые `spawnId`, уже присутствующие в чекпоинте, и доносит их результаты из чекпоинта; `node.completed` очищает чекпоинт вместе с очередью.

- [ ] **Step 1:** `constants.ts`: `export const STATE_SPAWN_RESULTS_KEY = 'spawnResults';`. Проверить, что `WORKER_STATE_DROP_KEYS` (`graph-map.ts:153`) получает и этот ключ (worker не наследует родительский чекпоинт).
- [ ] **Step 2:** `executeSpawn(prepared, opts, runChild, onChildDone?)`: после получения каждого `SpawnResultItem` (parallel pool — по факту готовности; sequential — сразу) `await onChildDone(item)` до продолжения барьера. `prepareSpawn` принимает `done: SpawnResultItem[]` и исключает их цели из `targets`; `SpawnNodeOutcome` дополнить `carried: SpawnResultItem[]` (уже готовые из чекпоинта).
- [ ] **Step 3:** Ветка `control:spawn` в `graph.ts`. Генератор не может `yield` из коллбэка — прокинуть события через очередь с wake-проомисом (полный паттерн, воспроизвести как есть):

```ts
const pending: Event[] = [];
let wake: () => void = () => {};
const note = (ev: Event): void => {
  pending.push(ev);
  wake();
};
const spawnPromise = executeSpawn(prepared, ctx, startGraph, async (item) => {
  carried.push(item);
  st[STATE_SPAWN_RESULTS_KEY] = carried.slice();
  const ev = await commit('running', item.error ? 'agent.failed' : 'agent.completed', 'recorded', {
    agentId: item.agentId,
    spawnId: item.spawnId,
    ...(item.error ? { code: item.error.code, message: item.error.message } : {}),
  });
  note(ev);
});
let spawnSettled = false;
let spawnError: unknown;
spawnPromise.then(() => { spawnSettled = true; wake(); }, (err) => { spawnSettled = true; spawnError = err; wake(); });
while (!spawnSettled || pending.length > 0) {
  while (pending.length > 0) {
    yield pending.shift() as Event;
  }
  if (!spawnSettled) {
    await new Promise<void>((r) => { wake = r; });
  }
}
if (spawnError !== undefined) {
  throw spawnError; // прежний catch-блок узла: run.failed + очистка очереди и чекпоинта
}
```

`ctx` — тот же объект, что передаётся в `executeSpawn` сейчас. `commit` остаётся сериализованным: все `onChildDone` выстроены в `.then`-цепочку пула, одновременных `commit` не возникает (проверить по факту вызова в `runBatchWorkerPool`: если пул зовёт коллбэк параллельно — обернуть `onChildDone` в локальную promise-chain `tail = tail.then(() => handle(item))`).
- [ ] **Step 4:** `output = [...carried-from-checkpoint, ...results]` в том же порядке, что и `state.spawns`; `appendSpawnResultsMessage` без изменений формата; `clearQueuedSpawns` + `delete st[STATE_SPAWN_RESULTS_KEY]` до `node.completed`.
- [ ] **Step 5:** SKILL.md: в пункт `control:spawn` добавить два предложения: эмиссии идут по завершении каждого ребёнка; результаты завершившихся детей чекпоинтятся в состояние узла и повторный вход (retry после падения) их не переигрывает.
- [ ] **Step 6:** lint + typecheck; коммит `feat: checkpoint spawn results per child and honor them on re-entry`.

### Task 3: Порта `patch`/`remove` и тулы `agents_update`/`agents_delete`

**Files:**
- Modify: `packages/harnesys/src/ports/agents-catalog.ts`
- Create: `packages/harnesys/src/packs/agents/create-agent-lifecycle-tools.ts`
- Modify: `packages/harnesys/src/packs/agents/index.ts` (meta-список тулов capability — синхронно, по образцу существующих)
- Modify по месту сборки тулов: найти, где `createAgentsTools(...)` вызывается (`rg -n "createAgentsTools" packages/harnesys/src`), и добавить `...createAgentLifecycleTools(deps)` в результат.

**Interfaces:**
- Consumes: `CreateAgentsToolsParams` (`agents`, `resolveScope`); `AgentCatalogSummary` (`parentId`).
- Produces (публичная поверхность библиотеки — точные формы):

```ts
export type AgentCatalogPatch = {
  name?: string;
  role?: string;
  instructions?: string;
  budget?: AgentBudget;
};

export type AgentsCatalogPort = {
  // list/get/create без изменений
  patch?(scope: CapabilityScope, id: string, patch: AgentCatalogPatch): Promise<void>;
  remove?(scope: CapabilityScope, id:string): Promise<{ ok: true } | { error: string }>;
};
```

- Тулы `agents_update` (`{agentId, name?, role?, instructions?, budget?}`) и `agents_delete` (`{agentId}`), `sideEffect:'write'`, группа `agents`; регистрируются только когда `deps.agents.patch`/`deps.agents.remove`分别是 `undefined`-free.

- [ ] **Step 1:** Типы порта выше; никаких других правок `agents-catalog.ts`.
- [ ] **Step 2:** `create-agent-lifecycle-tools.ts`: общий резолв цели по образцу `resolveHandoffTarget` (тот же `resolveAgentTarget` по строкам `agents.list(scope)`), затем гейт: цель обязана быть делегатом ВЫЗВАВШЕГО (`parentId === scope.agentId`); иначе один текст на обе ошибки отказа владения: `"<name>" is not your delegate; only delegates created by you can be <updated|removed> here (top-level agents are managed in the workspace UI).` `budget` валидировать существующим `parseSpawnBudget` (тот же контракт: хотя бы один лимит, числа ≥0). Пустой патч (ни одного поля кроме agentId) → `{ error: 'nothing to update' }`. Успех: `{ agentId }` / `{ removed: id, name }`.
- [ ] **Step 3:** Описания тулов (по одному предложению на факт, стиль соседних): update — «patch name/role/instructions/budget of your own delegate; graph, tools and packs are owner-only». delete — «remove your own delegate that is not running anywhere; workspace UI manages top-level agents». `packs/agents/index.ts`: те же формулировки в meta.
- [ ] **Step 4:** lint + typecheck; коммит `feat: agents_update and agents_delete tools for own delegates`.

### Task 4: Studio-реализация порта: patch + безопасный remove

**Files:**
- Modify: `apps/studio/server/src/adapters/capabilities/sqlite-agents-catalog.port.ts`
- Modify по необходимости: `apps/studio/server/src/domain/agent.port.ts` + `adapters/store/sqlite/repos/sqlite-agent.repo.ts` (только если нет update-примитива/существования потоков — см. шаги)

**Interfaces:**
- Consumes: Task 3 (`AgentCatalogPatch`, сигнатуры `patch`/`remove`); существующие `deps.agents` (`AgentRepository`), `deps.createAgent` (валидация модели при смене `modelId` не нужна — model не в патче).
- Produces: `remove` — физическое удаление строки агента; `patch` — частичное обновление.

- [ ] **Step 1:** `patch`: проверить наличие метода обновления в `AgentRepository` (`UpdateAgentUseCase` его уже использует — взять тот же путь). Найдение агента по scope.workspaceId; unknown id → бросок `NotFoundError` (тул завернёт в `{error}` через runGuard). Имя при смене — проверить уникальность тем же `uniqueAgentName`-подходом, что и create (конфликт → `ValidationError('agent name "<x>" already exists')`).
- [ ] **Step 2:** `remove`: проверка порядка (первая найденная ошибка — возврат `{error}`):
  1. целевой — делегат и `parentId === scope.agentId` (повторной защитой, хост не доверяет тулу);
  2. у цели нет непустых threads (`threads` repo: выбрать `agent_id = target` — если есть → `{ error: 'agent still owns threads; delete them first' }` — порт получает thread-репозиторий через deps, при отсутствии — добавить опциональный dep по образцу `createAgent`);
  3. `agents.delete(id)` (каскад делегатов у модели недоступен — у цели делегатов не бывает по построению create_subagent).
- [ ] **Step 3:** lint + typecheck сервера; коммит `feat: catalog patch/remove in the Studio agents port`.

### Task 5: Очистка мусора при удалении агента (и UI-путь, и модельный)

**Files:**
- Modify: `apps/studio/server/src/application/agents/delete-agent.use-case.ts`
- Modify по месту: репозитории `sqlite-schedule.repo.ts`, `sqlite-webhook.repo.ts` (или их порты), порт/адаптер `agent_pins`, порт/адаптер `semantic_memories` (`rg -ln "agent_pins|semantic_memories" apps/studio/server/src` — использовать существующий writer, не дублировать SQL)

**Interfaces:**
- Consumes: `DeleteAgentUseCase.execute` (UI и из Task 4-пути, если remove пойдёт через тот же use-case — выбрать: remove в порту вызывает `DeleteAgentUseCase`, чтобы не плодить каскады; тогда шаги 2 Task 4 становятся тонкой обёрткой над этим use-case с доп. проверкой threads).
- Produces: после удаления агента и его делегатов не остаётся строк `schedules`/`webhooks` с `target_agent_id` удалённых; `semantic_memories`/`agent_pins` удаляются только для осиротевших имён.

- [ ] **Step 1:** Собрать список имён: удаляемый агент + его делегаты (текущий цикл уже их находит). Для каждого id: удалить schedules/webhooks по `target_agent_id` (методы репозиториев; если их нет — `DELETE ... WHERE target_agent_id = ?` в существующем репо, без нового слоя).
- [ ] **Step 2:** Для каждого имени: если в workspace больше нет ни одного агента (живого, включая top-level) с таким `name` — удалить `semantic_memories` и `agent_pins` по `(workspace_id, agent_name)`. Не осиротело — не трогать (имя общее, данные могут принадлежать другому агенту).
- [ ] **Step 3:** lint + typecheck; коммит `fix: cascade schedules, webhooks and orphaned pins/memory when an agent is deleted`.

### Task 6: Докуентация контракта + живой прогон

**Files:**
- Modify: `apps/studio/assets/skills/agent-creator/SKILL.md`
- (опционально) Modify: `apps/studio/assets/presets/agents/orchestrator.json` — абзац Subagents

- [ ] **Step 1:** SKILL.md, инструменты `agents`-пака: добавить `agents_update`/`agents_delete` в таблицу паков с одной строкой каждый (свои делегаты; graph/tools/packs — только через UI); к пункту `agents_create_subagent`: жизненный цикл делегата — `agents_update`/`agents_delete`, мусор памяти/пинов чистится при удалении, если имя осиротело.
- [ ] **Step 2:** orchestrator.json «Subagents»: заменить накопление-без-уборки на «delete finished delegates with agents_delete». Текст — фактами, тот же стиль.
- [ ] **Step 3:** Коммит `docs: agent lifecycle tools in the creator contract`.

**Живая верификация (после Task 1-5, на стенде хозяина):**
- V1 (checkpoint): Assistant спавнит General с `budget:{maxSteps:1}` (упрётся) и обычным — `agent.failed`+`agent.completed` приходят до барьера; затем в том же треде: смоделировать разрыв нельзя (tets forbidden), поэтому проверка идемпотентности статическая — rg по `STATE_SPAWN_RESULTS_KEY` показывает write на каждом ребёнке, read на входе узла, delete на `node.completed`.
- V2 (lifecycle): Assistant из `agents_create_subagent`-делегата обновляет его (`agents_update` name/role) и удаляет (`agents_delete`); `agents_delete` чужого делегата → `{error}`; `agents_delete` top-level → `{error}`; после удаления — `SELECT count(*) FROM agents WHERE id='<тот>'` = 0.
- V3 (мусор): делегату выдать `memory_write` (свое имя) и `pin_set`, затем удалить делегата моделью → `semantic_memories`/`agent_pins` по осиротевшему имени пустые; второй агент с таким же именем — данные не тронуты.
- V4 (UI-путь): создать+удалить агента через desk; schedules/webhooks на него исчезают, чужие — остаются.
- Финал: `bun run lint && bun run typecheck` зелёные; тестовых агентов/тредов на стенде не остаётся; `git status` чист.

## Отложено (не делать в этом плане)

- `spawn_peek`-тул: родитель блокирован барьером до завершения детей, живых детей видно в UI по стрим-событиям (`/api/runs/:id/events`), итоговые результаты — в messages с `spawnId`. При блокирующей семантике тул не даёт новой информации. Если появится fire-and-forget спавн — вернуться.
- Асинхронные (неблокирующие) спавны и параллельные треки детей — отдельная большая фича.
- `agents_update` для top-level агентов и для graph/tools/packs — намеренно вне модели: вектор self-escalation.

## Не делать

- Не менять типы/очерёдность существующих событий кроме момента эмиссии в Task 2.
- Не вводить каскад «удали делегатов вместе с top-level» для модельного `agents_delete` (top-level — зона ответственности владельца).
- Не чистить память/пины неосиротевших имён и не удалять threads моделью.
- Не трогать `knowledge_*` (workspace-скоуп, не агентный).
