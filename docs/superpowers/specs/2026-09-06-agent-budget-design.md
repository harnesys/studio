# Budget агента — дизайн

Дата: 2026-09-06
Статус: согласовано в чате (budget interrupt через HITL, счётчик в промпте, неподдерживаемые ноды падают громко). Спека ожидает ревью.

## Контекст

`GRAPH_REVIEW.md` зафиксировал пять существенных находок движка графа и пять пунктов качества. Главный риск: циклический граф агента Jarvis исполняется без бюджета. Студия не проставляет `budget` в definition (`workspace-harnesys.registry.ts:124`), `validateStructural` у резолвленных агентов не вызывается, diagnostics из `compile()` отбрасываются (`run-engine.ts:117`, `create-runtime.ts:101,119`).

Требования хозяина:

1. Лимиты настраиваются на фронте студии.
2. Превышение по умолчанию не обрывает ран с ошибкой: движок ставит ран на паузу и показывает карточку подтверждения, как при HITL-approve тула. Пользователь решает: продолжить или остановить.
3. Политика настраивается: предупреждение с подтверждением (`ask`) или ошибка (`error`).
4. Модель получает счётчик оставшихся итераций, чтобы корректно завершить мысль до исчерпания бюджета.
5. Динамические подсказки агенту (бюджет, статус плана, будущие) — единый расширяемый механизм библиотеки, а не правки текста в хостских use-case.

## Решения

1. `AgentDefinition.budget` получает политику: `policy: 'ask' | 'error'`. Дефолт библиотеки — `'error'` (текущее поведение). Студия ставит `'ask'`.
2. Превышение при `ask` — interrupt через существующий HITL-механизм: `cursor.interrupt` + событие `interrupt.triggered` → `ask` → пауза → `respond`/`reject`. Сегментный слой (`run-engine-segment.ts`) не меняется.
3. Динамические подсказки модели идут через механизм runtime notes: библиотека владеет точкой инъекции и форматом, хост регистрирует провайдеры. Доставка — одно транзиентное system-сообщение в хвосте каждого запроса; системный промпт и история не мутируют (мутирующий префикс сбрасывает prompt-кэш разговора).
4. `control:spawn`, `control:handoff`, `custom:*` в интерпретаторе не реализуются: ран падает с `node_unsupported`.
5. Находки 1–5 из ревью и пункты качества чинятся в том же ходе.
6. create/update студии валидируют собираемый definition через `validateStructural` библиотеки: diagnostics severity `error` → студийная `ValidationError` с текстами диагностик. Циклический граф нельзя сохранить без бюджета — лимит вводится там же, где настраивается. Студия не навязывает дефолтных значений бюджета: требование определяет форма графа через валидатор, пресеты и будущий визуальный редактор идут через один и тот же вход.
7. Статус активного плана студии переезжает с префикса user-сообщения (`send-thread-run.use-case.ts:129-156`) на провайдер runtime notes: подсказка обновляется перед каждым вызовом LLM, а не один раз при отправке, XML-блоки исчезают из сохраняемой истории. `PLAN_MODE_PROMPT` остаётся в тексте задачи — это статичная инструкция рана, не динамический статус.

## Библиотека: типы

`domain/agent-definition.ts`:

```ts
export type BudgetPolicy = 'ask' | 'error';
export type AgentBudget = {
  maxSteps?: number;
  maxTokens?: number;
  deadlineMs?: number;
  policy?: BudgetPolicy;
};
```

`AgentDefinition.budget?: AgentBudget` (inline-тип заменяется на именованный).

`domain/snapshot.ts`: `Cursor.interrupt` дополняется `source?: string` и `output?: unknown`; `Cursor.budget` дополняется `startedAt: number` (epoch ms, часы — `Date.now()`).

`validate.ts`: новые диагностики — `budget_policy` (error, значение вне союза) и `budget_value` (error, отрицательные maxSteps/maxTokens/deadlineMs). Проверка `cycle_budget` остаётся без изменений.

## Движок: бюджет

### Проверка

Три копии бюджет-чеков (`graph.ts:272-284`, `771-783`, `816-828`) сворачиваются в один локальный хелпер `budgetOver(): { kind: 'steps' | 'tokens' | 'deadline'; limit: number; used: number } | null`. Точка отсчёта дедлайна — `startedAt`, восстановленный из снапшота (см. «Окно бюджета»). Вызовы остаются в трёх местах (выход через skip-entry, `control:goto`, хвост цикла), каждое — две строки.

### Политика `error`

Как сейчас: `commit('budget_exceeded', 'run.failed', 'recorded', { code: 'budget_exceeded', kind, limit, used })` → break. Метаданные уточняют код ошибки на фронте: сегодня `run.failed` приходит без `code` и маппится в общий `run_failed`.

### Политика `ask`

По образцу `control:interrupt` (`graph.ts:785-809`):

- `interruptId = budget/${runId}/${cur}/${steps}`;
- `reason` — по kind: `Step budget of ${limit} reached` / `Token budget of ${limit} reached` / `Deadline of ${limit}ms exceeded`;
- `resumeSchema = { type: 'object', properties: { approved: { type: 'boolean' }, reason: { type: 'string' } } }`;
- в `cursor.interrupt` пишутся `source: 'budget'` и текущий `output`;
- коммит `needs_input` + событие `interrupt.triggered` (метаданные включают `source: 'budget'`) → break.

`runSegment` уже превращает `interrupt.triggered` в `ask` и делает transition `needs_input`. `run-engine-events.ts:216` и `ports/session.ts:62` расширяют union source значением `'budget'`.

### Resume

`startGraph` читает `loaded.cursor.interrupt.source` (у него уже есть загруженный снапшот, новых полей `GraphOpts` не нужно):

- **Continue** (`respond {approved: true}`): вход в прерванную ноду пропускается. `isSkippedEntry` (`graph-edges.ts:23`) получает третий параметр `interruptSource?: string` и скипает любую ноду при `interruptSource === 'budget'`. Дальше — `matchOutgoing` от этой ноды; исполненная нода не исполняется повторно. Окно бюджета сбрасывается: `steps = 0`, `tokens = 0`, `t0 = Date.now()`.
- **Stop** (`reject` → `rejected: true`, а также защитный случай `payload.approved === false`): `commit('cancelled', 'run.cancelled', 'recorded', { reason: 'budget_exceeded' })` → break. Пользователь выбрал остановку, это не ошибка.

### Окно бюджета

`startGraph` восстанавливает счётчики из снапшота: `steps` и `tokens` из `cursor.budget`, `startedAt` из `cursor.budget.startedAt` (сейчас `graph.ts:199-201` начинает с нуля, дедлайн на resume отсчитывается заново — находка 5 ревью). Crash-recovery продолжает то же окно; явный approve budget-interrupt выдаёт новое окно. `mkSnap` (`graph-snap.ts`) пишет `startedAt`.

### Runtime notes

Единая точка доставки динамических подсказок — сборка запроса в `llm.ts`. Механизм живёт в библиотеке; бюджет — первый note, обслуживаемый самим движком, хостские провайдеры подключаются массивом без правок интерпретатора.

`packages/harnesys/src/application/llm-notes.ts` (новый файл):

```ts
export type LlmNote = { tag: string; text: string };
export type LlmNoteContext = {
  agentId: string;
  runId: string;
  sessionId: string;
  nodeId: string;
  steps: number;
  state: Readonly<Record<string, unknown>>;
};
export type LlmNoteProvider = (ctx: LlmNoteContext) => LlmNote[] | Promise<LlmNote[]>;
export function assembleNotes(notes: LlmNote[]): string;
export function budgetNote(left: BudgetLeft): LlmNote;
```

- `assembleNotes` строит текст одного system-сообщения: рамочная строка `Runtime notes (refreshed before this step):` и блоки `<tag>` / `text` / `</tag>`.
- `BudgetLeft = { stepsLeft?, stepsTotal?, tokensLeft?, tokensTotal?, msLeft? }` — заполняются только включённые в бюджете измерения.
- `budgetNote` форматирует `steps remaining: 3/50 · tokens remaining: ~12000 · time remaining: ~4 min. Wrap up the task within the remaining budget.` (время — вверх до минут), tag `budget`.

Доставка:

- `LlmContext` получает `notes?: LlmNote[]`; `llm.ts` при непустом массиве дописывает в копию массива messages транзиентное сообщение после последнего: `{ role: 'system', content: assembleNotes(notes) }`. В `state.messages`, снапшот и историю ничего не попадает. Кэш-префикс (промпт + история) переживает итерации цикла, меняющийся хвост остаётся в зоне сильного внимания.
- Адаптер уже маппит `role: 'system'` (`ai-llm-messages.ts:64`). Поведение на провайдерах, не принимающих хвостовое system, проверяется живым стендом; fallback — подмешивание notes в содержимое последнего user-сообщения на уровне адаптера.
- Счётчик — рекомендация модели. Принудительную остановку делает движок (`budgetOver`), на самоконтроль модели бюджет не опирается.

Сборка в движке:

- `GraphOpts.notes?: LlmNoteProvider[]` — хостские провайдеры; движок вызывает их перед каждым `llm:generate`, каждый в try/catch: упавший провайдер даёт пустой список, ран продолжается.
- `graph.ts` формирует итоговый массив: `budgetNote(...)` (когда бюджет задан) + результаты провайдеров.

Проводка провайдеров: `CreateRuntimeOptions.notes?: LlmNoteProvider[]` → `RuntimeContext` → `GraphOpts.notes`; прямой путь `run`/`start` получает тот же массив из options.

### Сохранение output при interrupt (находка 1 ревью)

Во всех трёх местах прерывания в `cursor.interrupt.output` пишется текущий `output`: catch `AskUserInterrupt` в `tool:call` (`graph.ts:658-688`), нода `control:interrupt`, budget-interrupt. `run-engine.ts` берёт `outputHint: snap?.cursor.interrupt?.output ?? null`; `GraphOpts.outputHint` становится `unknown`. `restoreReActOutput` и тип `ReActOutput` в `graph-helpers.ts` удаляются вместе с обратным проходом по `state.messages`.

## Движок: остальные фиксы ревью

- **Неподдерживаемые ноды (находка 2):** `else`-ветка `graph.ts:810` → `commit('failed', 'run.failed', 'recorded', { code: 'node_unsupported', nodeType: node.type })` → throw `Error` с `code: 'node_unsupported'` и типом ноды в сообщении. Паттерн как у `unknown node` (`graph.ts:243`).
- **`maxTokens` (находка 3):** проверяется в `budgetOver()`.
- **Токены (находка 4):** `tokens += totalTokens ?? (inputTokens + outputTokens) ?? 0`; модели без usage не увеличивают счётчик.
- **Diagnostics:** `compile.ts` получает `compileOrThrow(def): Plan` — бросает `codedRunError('agent_invalid', …)` со списком diagnostics severity `error` (warning игнорируются). Вызывают `run-engine.execute` и `create-runtime` в `run`/`start`. `check.ts` продолжает использовать сырой `compile`. `map-coded-error.ts` студии получает запись `agent_invalid`.
- **Fallback-модели:** `resolveFallbackBindings` становится async и покрывает оба пути (`ProviderConfig[]` через `findBind`, `ModelsPort` через `resolveModelForPort` + `port.get`); inline-цикл из `graph.ts:403-416` исчезает.

## Чистка

- `stateKeyOf(expr)` в `graph-helpers.ts` — один парсер `$state.X` → ключ вместо трёх копий (`graph.ts:549`, `llm.ts:42`, `tool-call.ts:78`).
- `llm.ts`: таблица `CHUNK_EVENT` (chunk.type → event.type) вместо 12 веток.
- `graph.ts`: множество passthrough-типов `model.*` вместо 10 веток форвардинга; `model.chunk` и `model.completed` остаются спец-ветками.
- `nodeSteps` остаётся: это источник `nodeExecutionId` в `cursor.nodes`. Формулу `nodeExecutionId` в `tool-call.ts:650` не трогаем, чтобы не переименовать interruptId у уже висящих в базе прерванных ранов.

## Studio: сервер

- `shared/types.ts`: тип `AgentBudget` (структурная копия библиотечного, по образцу `AgentGenerationSettings`); `Agent.budget: AgentBudget | null`.
- `server/domain/agent.port.ts`: `Agent.budget`, `AgentPatch.budget?`.
- `update-agent.use-case.ts`: патч `budget`. `create-agent.use-case.ts`: `budget: request.budget ?? null` в записи.
- Оба use-case перед записью собирают определение (id, prompts, graph, budget) и прогоняют `validateStructural` из `harnesys`; diagnostics severity `error` → `studio.error.ValidationError` с сообщениями диагностик (например `cycle_budget`). Проверка не зависит от формы графа.
- `sqlite/schema/agents.ts`: колонка `budget_json text NULL`; миграция в bootstrap — только `ALTER TABLE agents ADD COLUMN budget_json`, backfill данных не делается.
- `agent-document-from-row.ts`: парсинг JSON → `budget: AgentBudget | null`.
- HTTP-контроллер агента: в схему патча — опциональный `budget` с валидацией полей (positive int, enum policy).
- `workspace-harnesys.registry.ts:124`: проброс `budget: agent.budget ?? undefined` в definition.
- Провайдер notes плана — `server/application/threads/plan-notes.ts` (рядом с `plan-mode-prompt.ts`): фабрика `(deps: { getThreadPlan: GetThreadPlanInput }) => LlmNoteProvider`. Провайдер читает активный план треда (`ctx.sessionId` — это threadId), выбирает next item по той же логике, что сегодня `send-thread-run.use-case.ts:150-152` (`in_progress` → первый `pending`), и возвращает `{ tag: 'active-plan', text: planFollowPrompt(plan, next) }`. Формат текста сохраняется, меняется канал доставки; выбор next переезжает сюда из use-case.
- `workspace-harnesys.registry.create`: `createRuntime({ …, notes: [planNotesProvider(deps)] })`; deps реестра получают доступ к планам треда.
- `send-thread-run.use-case.ts:129-156`: префикс `planFollowPrompt` из исходящего текста убирается — XML больше не попадает в сохраняемое user-сообщение. `PLAN_MODE_PROMPT` остаётся.
- `react-preset.ts` не меняется: бюджет — свойство агента, не графа.

## Studio: клиент

- `manage-agent/model/agent-fields.ts`: поля `budgetMaxSteps`, `budgetMaxTokens`, `budgetDeadlineSec` (`optionalPositiveInt`), `budgetPolicy` (`z.enum(['ask','error'])`, дефолт `'ask'`); маппинг в `emptyAgentFields` / `agentFieldsFrom` / `toAgentDraft` → объект `AgentBudget | null`.
- `manage-agent/ui/agent-budget-fields.tsx`: по образцу `agent-tool-output-fields.tsx`; policy — `ToggleGroup` «Спрашивать» / «Падать с ошибкой». Новая панель «Limits» в `agent-config-dialog.tsx`.
- `manage-agent/model/update-agent.ts` / `create-agent.ts`: маппинг полей в запрос.
- `send-message/ui/hitl-prompt.tsx`: `source === 'budget'` → `BudgetCard`: текст — `interrupt.reason` (например «Step budget of 50 reached»), кнопки Continue (`respond {approved: true}`) и Stop (`reject`). Карточка в стиле `ConfirmCard`, без тул-сводки.
- `shared/types.ts` (SessionEvent): source union дополняется `'budget'`.

## Порядок

1. Библиотека: типы, механизм runtime notes (`llm-notes.ts`, проводка через `create-runtime`/`GraphOpts`), бюджет (policy, interrupt, окно, счётчик), находки 1–5, diagnostics-гейт.
2. Чистка: `stateKeyOf`, таблицы стримов, fallback, `compileOrThrow`-проводка.
3. Studio-сервер: типы, миграция, use-case с save-валидацией, registry, контроллер, провайдер notes плана, съём префикса `planFollowPrompt`.
4. Studio-клиент: форма «Limits», BudgetCard.

Шаги 1–2 идут до 3–4: save-валидация в use-case опирается на `validateStructural` и `AgentBudget` из библиотеки.

## Ограничения

- `control:spawn`, `control:handoff`, `custom:*` в этой итерации не реализуются: ран падает с `node_unsupported` вместо молчаливого успеха. Реализация — следующий этап после кристаллизации движка; громкий отказ — промежуточное состояние, словарь остаётся публичным контрактом.
- Runtime notes не заменяют middleware: `domain/middleware.ts` (стадии run/node/model/tool, `GuardDecision`) остаётся публичным контрактом для гейтов; сопряжение провайдеров notes и `beforeModel` решается отдельным этапом кристаллизации.
- Существующие записи агентов сохранены до ввода save-валидации. Backfill не делается: после деплоя циклический граф без бюджета не запускается с `agent_invalid`/`cycle_budget`, лимит задаётся один раз в новой панели.
- `maxTokens` не считается для моделей без `usage` — контроль остаётся на `maxSteps`/`deadlineMs`.
- Бесконечный цикл при `ask` возможен только при бесконечных ручных подтверждениях; каждое окно ограничено заново.

## Проверка

- `bunx biome check` по монорепо, typecheck.
- Тесты запрещены (мораторий).
- Ручной сценарий хозяина: у агента `maxSteps = 3`, сообщение с циклом тула → карточка «Step budget of 3 reached» → Continue даёт новое окно, Stop завершает ран; политика `error` рвёт ран с кодом `budget_exceeded`; модель видит хвостовое system-сообщение с блоком `<budget>`. При активном плане каждый шаг видит свежий `<active-plan>` со статусами тудушек, а user-сообщение в истории — без XML. Сохранение циклического агента без лимита падает с `cycle_budget`, с лимитом — проходит.
