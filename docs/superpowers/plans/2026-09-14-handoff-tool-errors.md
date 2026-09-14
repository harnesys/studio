# Handoff и spawn-контур: понятные ошибки, непойзонный стейт, мелкая починка контрактов Implementation Plan

> **For agent workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ])` syntax for tracking.

**Goal:** Отказ handoff приходит модели как текст тул-ошибки с объяснением и подсказкой (как у `agents_spawn` сегодня), рун после отказа живёт и не травит снапшот; успех handoff оставляет цели записку «тред теперь твой». Мелкие контрактные правки из spawn-ретеста (D2/D3/D8) и валидация skills при create (D5). Порядок `spawn`/`handoff` в одном шаге перестаёт терять spawn-интенты.

**Architecture:** Валидация цели переезжает в `execute` тула `agents_handoff` (roster + `resolveAgentTarget` уже используются у spawn); `prepareHandoff` остаётся last line of defense для граф-уровневых `control:handoff`. Failure-путь узла `control:handoff` чистит `state.handoffAgentId` до commit — ребаинд не наследует отравленный queue. Приоритет рёбер — порядок массива (`matchOutgoing` first-wins), правится в пресетах Studio.

**Tech Stack:** TypeScript, bun, biome; пакет `packages/harnesys`, пресеты и сервер `apps/studio`.

**Решения, зафиксированные обсуждением (не переспрашивать):**
- handoff остаётся transfer of ownership: возврат не гарантирован движком; «невозвращающую» top-level цель не запрещать (OpenAI: specialist owns the rest of the turn; пользовательский возврат — `origin` + `PATCH /api/threads/:id {agentId}`).
- handoff на делегата (roster `parentId != null`) отказывать на уровне тула текстом с именем родителя и указанием на `agents_spawn`, а не `run.failed`.
- зацикливание A→B→A гасить существующим `budget.maxSteps` (`graph.ts:1199`), новых механизмов не вводить.
- авто-handoff-back тулы агентам не выдавать (ломает `filterToolsForAgent` и дублирует `agents_spawn`).
- Spawn-ретест: D3/D8/D2/D5 чиним здесь; D1 (sandbox-мутации shared state), D6 (spawn-наблюдаемость), D9 (lifecycle-инструменты агентов) — отдельные спеки, см. «Отложено».

## Global Constraints

- Тесты запрещены (AGENTS.md): не создавать `*.test.ts`/`*.spec.ts`. Ворота: `bun run lint` (корень) и `bun run typecheck` там, где скрипт есть + ручная проверка agent-browser.
- Дев-стенд поднят хозяином (API `3000`, Vite `5173`): не поднимать второй, не убивать чужие процессы. Перед браузерной проверкой: `agent-browser skills get core`.
- Публичные типы библиотеки не расширяем: `AgentRosterEntry.parentId` и `AgentCatalogSummary.parentId` уже есть (`ports/create-runtime.ts:27-31`, `ports/agents-catalog.ts:10-16`). Формы тул-результатов (JSON вывода) менять можно — это не типы API.
- Типы по правилам репо: именованные, без `T['field']` и `Parameters<typeof fn>[0]`.
- Удаления полные (RULE D1–D6).

---

### Task 1: `agents_handoff` — валидация цели в туле

**Files:**
- Modify: `packages/harnesys/src/packs/agents/create-agents-tools.ts` (`tool('agents_handoff', ...)`, строки 310–329)
- Modify: `packages/harnesys/src/packs/agents/index.ts:30-32` (meta-описание того же тула — синхронно)

**Interfaces:**
- Consumes: `deps.agents.list(scope)` → `AgentCatalogSummary[]` (поле `parentId`); `resolveAgentTarget(query, roster)` из `application/agent-target-resolve.ts` (уже импортирован).
- Produces: результат тула `{ agentId }` (канонический id после prefix/name-резолва) либо `{ error }`.

- [ ] **Step 1: Переписать `execute` на async с проверками по образцу spawn (строки 288–308)**

Порядок: shape (`agentId` непустая строка) → `const scope = deps.resolveScope(); const rows = await deps.agents.list(scope);` → `resolveAgentTarget(rec.agentId, rows.map(({id, name, parentId}) => ({id, name, parentId})))`. Ошибки:

1. неизвестный таргет → `{ error: \`unknown handoff target "<query>". Available top-level agents: <Name (id), ...>\` }` — список только top-level (`parentId == null`, формат `formatAgentTargets`);
2. делегат → `{ error: \`"<name>" is a subagent of "<parentName>". Handoff passes the thread only between top-level agents; run a delegate with agents_spawn and its result returns to you.\` }` (`parentName` — `rows.find(r => r.id === entry.parentId)?.name ?? entry.parentId`);
3. успех → `{ agentId: resolved.id }`.

Обернуть в `runGuard`.

- [ ] **Step 2: Описания тула**

В обоих местах (`create-agents-tools.ts:313-314` и `packs/agents/index.ts:31-32`) добавить: `Top-level agents only; delegates must be run via agents_spawn.` Остальной текст не переписывать.

- [ ] **Step 3: lint + typecheck, коммит**

---

### Task 2: Failure-путь узла `control:handoff` без poison pill

**Files:**
- Modify: `packages/harnesys/src/application/graph.ts` (catch-блок строки 1173–1182)

- [ ] **Step 1: Очистка queued-intent до commit**

В catch добавить `clearQueuedHandoff(st);` перед `commit('failed', ...)` (`mkSnap(ctx())` сериализует текущий `st`). Только эта строка; `prepareHandoff` и бросок не менять (граф-уровневый `control:handoff` — детерминированная ошибка конфигурации, `run.failed` уместен).

- [ ] **Step 2: `rg -n "STATE_HANDOFF_AGENT_ID_KEY" packages/harnesys/src`** — запись ключа только в `applyAgentControlToolResults`, очистка на обоих исходах узла.

- [ ] **Step 3: lint + typecheck, коммит**

---

### Task 3: Заметка новому агенту после успешного rebind

**Files:**
- Modify: `packages/harnesys/src/application/graph-agent-controls.ts` (экспорт `appendAssistantNote`, строка 142)
- Modify: `packages/harnesys/src/application/graph.ts` (success-ветка `control:handoff`, строки 1183–1204)

- [ ] **Step 1: Экспортировать `appendAssistantNote`**, сигнатуру не менять.

- [ ] **Step 2: Записка до перезаписи имени**

В success-ветке после emission-commit и до `agent = prepared.agent;` сохранить `const previousName = agent.name;`; после `clearQueuedHandoff(st);` вызвать `appendAssistantNote(st, lastMsg, \`Thread handed off to you by "${previousName}". You own the conversation from here.\`)` — паттерн `appendSpawnResultsMessage(st, lastMsg, ...)` (строка 1161). Emission/типы не трогать.

- [ ] **Step 3: lint + typecheck, коммит**

---

### Task 4: `agents_spawn` — бюджет с `policy`, пустой батч (D3, D8)

**Files:**
- Modify: `packages/harnesys/src/packs/agents/create-agents-tools.ts` (`agents_spawn`: schema 250–287, execute 288–308)

- [ ] **Step 1: Разрешить `policy` в spawn-budget (D3)**

Рантайм уже игнорирует лишние ключи (`parseSpawnBudget`, `graph-spawn.ts:98-123` читает только maxSteps/maxTokens/deadlineMs). В JSON-схему (`create-agents-tools.ts:271-279`) добавить `policy: { type: 'string', enum: ['ask', 'error'], description: 'Accepted and ignored: a sandboxed child never asks and always closes with a report.' }` — описание тула (строка 270) остаётся честным.

- [ ] **Step 2: Пустой `calls` — явная ошибка (D8)**

В execute перед shape-проверкой: `if (rec.calls.length === 0) return { error: 'no spawn calls provided' };`

- [ ] **Step 3: lint + typecheck, коммит**

Атомарность батча (валидный call[0] не стартует из-за битого call[1]) НЕ менять: частичный запуск хуже явного отказа, индекс проблемного колл уже в тексте (`calls[idx].budget ...`).

---

### Task 5: `agents_list` — уровень деклараций vs effective (D2)

**Files:**
- Modify: `packages/harnesys/src/packs/agents/create-agents-tools.ts` (`agents_list` execute 68–93, описание 60)
- Modify: `packages/harnesys/src/packs/agents/index.ts:15-17` (meta-описание — синхронно)

**Fact:** `tools: def?.tools ?? []` — только декларированные имена; у Assistant они реально `[]`, всё остальное доходит из дефолтных packs хоста. Фраза описания «effective set may be smaller» врёт в другую сторону: effective может быть **больше** декларации.

- [ ] **Step 1: Добавить в строку вывода поле `packs`** — `def?.packs ? Object.keys(def.packs) : []` (или `null`-значения как у host: проверить форму `AgentDefinition.packs` прежде чем писать). Тип публичного API не трогать.

- [ ] **Step 2: Описание: заменить «may be smaller» на «effective set adds default host/pack tools and may also shrink (host/MCP filtering)»** в обоих местах.

- [ ] **Step 3: lint + typecheck, коммит**

---

### Task 6: Валидация `skills` при create в Studio (D5)

**Files:**
- Modify: `apps/studio/server/src/application/agents/create-agent.use-case.ts`

**Fact:** хост валидирует model, name-уникальность, modes; `skills` (`request.skills ?? []`, строки 114+) уходит в запись без проверки. Ошибка видна только в рантайме.

- [ ] **Step 1: Проверять имена скиллов по реестру skills-порта хоста** (там же, где `agent-creator` скил лежит: `apps/studio/assets/skills` + `~/.harnesys/skills`). Незнакомое имя → ошибка вида `unknown skill: <name>` как и прочие rejection-ы create (T6-паттерн). `mcpServers` — тем же списком, если реестр доступен в тех же deps; если нет — не додумывать, оставить skills.

- [ ] **Step 2: lint + typecheck сервера, коммит**

---

### Task 7: Порядок рёбер `act → spawn` раньше `act → handoff` + доки контракта

**Files:**
- Modify: `apps/studio/assets/presets/agents/assistant.json`, `apps/studio/assets/presets/agents/orchestrator.json`
- Modify: `apps/studio/assets/skills/agent-creator/SKILL.md`

- [ ] **Step 1:** Поменять местами `{"from":"act","to":"handoff"}` и `{"from":"act","to":"spawn"}` (spawn первым) в обоих пресетах. `matchOutgoing` first-wins по порядку массива (зафиксировано в SKILL.md:34). `map`/`wait`/`think` не трогать.

- [ ] **Step 2: SKILL.md, точечно:** в пункт `control:handoff` (строка 49): делегаты отказываются на уровне тула `agents_handoff` (tool error, не run failure); handoff передаёт тред и не гарантирует возврат — возврат это `agents_handoff` у цели либо смена спикера пользователем. В пункт `agents_create_subagent` (строка 82): `not handoff targets`.

- [ ] **Step 3: lint, коммит**

---

### Task 8: Ручная проверка на живом стенде (agent-browser)

Стенд после сброса базы: агенты пересоздаются из починенных пресетов (Task 7), ручной ремонт снапшотов/графов не нужен.

- [ ] **S-отказ:** Assistant вызывает `agents_handoff` на свой сабагент → completed с текстом ошибки про subagent + spawn-подсказкой, рун живёт, модель уходит в `agents_spawn`; в снапшоте `handoffAgentId` нет.
- [ ] **S-happy:** handoff на top-level агента → `agent.handoff`, спикер сменился, `origin` прежний, цель видит записку `Thread handed off to you by "Assistant"`.
- [ ] **S-невозврат:** handoff на explorer (без `agents` pack) → рун завершается у цели, падений нет; возврат спикера вручную (desk/PATCH).
- [ ] **S-шаг-в-шаге:** spawn+handoff в одном акте → spawn-результаты в истории до смены спикера.
- [ ] **D3:** `agents_spawn` с `budget:{maxSteps:4, policy:"error"}` → принимается, у ребёнка стоит лимит 4.
- [ ] **D8:** `calls:[]` → `no spawn calls provided`.
- [ ] **D5:** `agents_create` с выдуманным skill → `unknown skill: ...`, агент не создан.
- [ ] **S-петля:** два top-level с agents pack передают тред друг другу → `run.failed` на budget, без бесконечного цикла.
- [ ] **Финал:** `bun run lint` зелёный; `git diff HEAD` пуст; чужие процессы не тронуты.

## Отложено (нужны отдельные спеки, не делать в этом плане)

- **D1 (sandbox и shared state).** Факт: `plan_save`/`pin_set`/`schedule_set`/`webhook_set` у ребёнка проходят — они не декларируют operations и не гейтуются (SKILL.md:57, гейт только для fs.write/process/network/mcp, `tool-permission.ts:121`). Это дыра между намерением пресетов («sandboxed… Do mutations yourself») и механизмом. `memory_write` — не phantom: скоуп включает `agentName` (`memory-scope.ts`), запись легитимно оседает в памяти делегата и не видна родителю; мусор — побочный вопрос D9. Варианты (hard-deny write-тулов в sandbox против child-scoped пространств) — отдельное решение по permission-модели библиотеки.
- **D6 (наблюдаемость результатов спавна).** Часть претензий не подтвердилась: очередь `state.spawns` переживает рун (снапшот, коммит на completed — в этом стенде 12 накопленных как раз из-за порядка рёбер), `signal` родителя передаётся детям (`graph-spawn.ts:272`), «orphan-дети жрут токены» protection есть. Реальный остаток: `spawn_peek`/журнал детей и потеря уже выполнившихся результатов при падении между коммитами — продуктовая фича, отдельная спека.
- **D7.** В текущем коде нет строки `unknown handoff target` (тестер видел старую сборку); Task 1 вводит ровно этот текст консистентно для id/prefix/name.
- **D4.** Не подтверждено: строковый `input` уже нормализуется в `{messages:[user]}` на очереди (`graph-agent-controls.ts:43-48`), `input:{}` — легальный one-shot прогон на instructions. Ужесточение схемы без сломанных потребителей не нужно.
- **D9 (`agents_delete`/`agents_update`).** Отдельная фича: чистка мусора делегатов и child-scoped памяти зависит от её принятия.

## Не делать

- Не менять публичные типы `harnesys`.
- Не добавлять `handoff_back`-тулы, флаги «возвращаемости» и рантайм-проверку «сможет ли цель вернуться».
- Не гейтовать shared-state-тулы в sandbox в этом плане (см. «Отложено», нужно решение по permission-модели).
- Не чинить автотестами (запрещены).
