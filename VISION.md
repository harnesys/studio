# Harnesys — Portable Graph-Agent Runtime

Harnesys исполняет графовых LLM-агентов. `AgentDefinition` (граф, промпты, ссылки на tools/models/MCP, политики, budget) это сериализуемые данные. Definition создают литералом, билдером или генератором вне библиотеки. Host создает один или несколько `Runtime` через `createRuntime()` и запускает на них агенты без глобального синглтона.

Библиотека предоставляет примитивы для сборки harness (Nest-сервис, чат, очередь, eval, Studio) и не содержит сам harness. Планировщики, вебхуки, треды, визуальный редактор, генератор графов из LLM и адаптеры БД реализует host.

Состояние run хранит `RuntimeState`. Host передает его на каждый `run` / `start` / `resume`. Библиотека включает `InMemoryRuntimeState` для тестов, продовая реализация использует репозиторий host. Где и как хранятся байты snapshot и events решает host, runtime к хранилищу не привязан.

Статус: RFC, кода нет. Формат definition, snapshot и event незаморожен до 2.0. `envelopeVersion` и миграции появляются в 2.0. До этого breaking без миграций.

```
AgentDefinition (данные, хэшируемые)
        │  compile()                    // чисто, без I/O
        ▼
ExecutionPlan
        │  runtime.start / run / resume
        ▼
RuntimeState.commit(snapshot, events, { kind, sequence })
        ▼
RunResult: completed | failed | needs_input | cancelled
           | timed_out | budget_exceeded | dead_lettered
```

---

## Принципы

Фильтр для любого PR, пока живёт этот файл.

1. **Граф владеет control flow.** Один узел `llm:generate` это один вызов `streamText` / `streamObject` (без `execute` у tools, без `stopWhen` / maxSteps-цикла). Цикл model → tool → model пишется узлами и рёбрами.

2. **Если это уже делает AI SDK** (провайдер, `LanguageModel`, wire tool-call, `McpClient`, abort, usage), Harnesys держит ссылку в definition и пишет события. Второй клиент OpenAI, второй протокол MCP, второй тип сообщений не появляются.

3. **Durable это `recorded`. Live это `model.delta` с батчевым flush.** Runtime не пишет `commit` на каждую дельту. Дельты копятся в чанк и флашатся батчем по интервалу (`STREAM_CHUNK_INTERVAL_MS`, дефолт 1000 или 3000 мс) или по размеру (`STREAM_CHUNK_SIZE`, дефолт 3-6 дельт). `model.delta` остается live-событием в iterator `start`, в `commit` попадает только чанк. Replay восстанавливает последний закоммиченный чанк, а не отдельные дельты. `intent` записывается до необратимого эффекта, обычный write/read пишет `recorded` после успеха.

4. **Граница ядра это дедупликация.** Если без библиотеки каждый host напишет одинаковый код, этот код должен жить в ядре. Критерий: семантика `commit` (`intent`/`recorded`), формула `idempotencyKey` (`sessionId:nodeExecutionId:attempt`), прокидывание `abort` в `streamText` и `tool.execute`, pin схемы MCP, обработка `unknown` после `intent`, маппинг `ModelMessage[]`. Это около 80 строк, которые иначе копируются в каждый harness. SQL, Redis, HTTP, cron, сокет, React-чат, Cosign, OTLP endpoint остаются в host, так как их реализация различается между проектами.

5. **Новый `type:` в stdlib** проходит только если его нельзя собрать из ребра `when`, bounded loop, join, interrupt, `llm:generate` и `tool:call`. Композиция идет через subgraph, overlay и наследование графа не поддерживаются.

6. **Нет второго plugin-runtime.** Единственная точка расширения это `createRuntime({ nodes, tools, models, skills, mcp, agents, policy, clock, rng })`. Библиотека не предоставляет `ExtensionRegistry`, `CompilerPass` или `ExecutionMiddleware`.

Переносимость definition требует совпадения имен node types, tools, models, skills, MCP-серверов, наличия реализации `RuntimeState` и одинаковой версии пакета `harnesys` на обоих host.

---

## AI SDK

Под капотом узлы модели и MCP вызывают примитивы Vercel AI SDK. Host передаёт уже собранные объекты.

| Слот `createRuntime` | Тип | Чего нет |
|---|---|---|
| `models` | `Record<string, LanguageModel>` | Harnesys-клиент провайдера |
| `tools` | AI SDK `tool()` + `withPolicy(...)` | вторая schema/execute модель |
| `mcp` | готовый `McpClient` (или эквивалент SDK) | discovery, transport, MCP-сервер |

Сообщения в runtime и в snapshot это сериализуемый `ModelMessage[]` SDK. Хелпер `toModelMessages` / `fromModelMessages` в ядре избавляет host от собственного конвертера.

Вызов шага модели:

```ts
streamText({
  model: models[node.model],
  messages,                 // ModelMessage[], см. биндинг узла
  tools: schemasOnly,       // без execute; модель может попросить tool
  abortSignal: runAbort,    // cancel / deadline / budget
})
```

При `finishReason: tool-calls` runtime эмитит `tool.requested` и передает управление графу (ребро на `tool:call`, interrupt или конец узла), сам tool не исполняет.

---

## Когда брать harnesys

Брать, если нужны:

- агент как данные, тот же JSON на разных host'ах с этой библиотекой;
- граф вокруг LLM: ветки, join (`all | any | n-of-m`), bounded loop, subgraph, interrupt до tool;
- compile без ключей провайдера: CI, mermaid, diagnostics;
- граница side effect: `intent` до денег, `recorded` после обычного tool, `idempotencyKey` из ядра;
- spawn/handoff известного агента тем же пайплайном, что статическая definition;
- своё хранение через `RuntimeState`, без адаптера Postgres от библиотеки.

Не брать, если нужен один вызов модели без графа и без паузы (хватит `streamText`), или готовый оркестратор с cron, UI и встроенной БД.

`InMemoryRuntimeState` входит в пакет для тестов и локального запуска, продовая реализация использует собственный `RuntimeState`.

---

## Пример: литерал defineAgent и run

`defineAgent` возвращает сериализуемые данные, литерал считается каноном. `hashDefinition` дает стабильный digest канонического JSON на любом host при одинаковой канонизации.

```ts
import { openai } from '@ai-sdk/openai'
import { tool } from 'ai'
import { z } from 'zod'
import {
  createRuntime, defineAgent, hashDefinition, InMemoryRuntimeState,
} from 'harnesys'
import { standardNodes } from 'harnesys/standard-nodes'
import { withPolicy } from 'harnesys/tools'
import { compose, denyUnknownTools } from 'harnesys/policy'

const agent = defineAgent({
  id: 'billing.support.v3',
  prompts: {
    classify: {
      messages: [
        { role: 'system', content: 'Classify refund risk as low or high.' },
        { role: 'user', content: 'order {{ $input.orderId }}' },
      ],
    },
  },
  graph: {
    nodes: {
      start:    { type: 'core:start' },
      classify: {
        type: 'llm:generate',
        model: 'default',
        prompt: 'classify',
        output: {
          type: 'object',
          properties: { risk: { type: 'string', enum: ['low', 'high'] } },
          required: ['risk'],
        },
      },
      approval: {
        type: 'control:interrupt',
        reason: 'human_review',
        resumeSchema: {
          type: 'object',
          properties: { approved: { type: 'boolean' } },
          required: ['approved'],
        },
      },
      refund: {
        type: 'tool:call',
        name: 'refund',
        args: { orderId: '$input.orderId' },
      },
      end: { type: 'core:end' },
    },
    edges: [
      { from: 'start', to: 'classify' },
      { from: 'classify', to: 'approval', when: '$output.risk = "high"' },
      { from: 'classify', to: 'refund',   when: '$output.risk != "high"' },
      { from: 'approval', to: 'refund',   when: '$resume.approved = true' },
      { from: 'approval', to: 'end' },
      { from: 'refund', to: 'end' },
    ],
  },
  budget: { maxSteps: 24, maxTokens: 50_000, maxCost: 0.40, deadlineMs: 120_000 },
})

hashDefinition(agent) // стабильный digest канонического JSON

const refund = withPolicy(
  tool({
    description: 'Refund an order',
    inputSchema: z.object({ orderId: z.string() }),
    execute: async ({ orderId }, { abortSignal }) =>
      billing.refund(orderId, { signal: abortSignal }),
  }),
  {
    sideEffect: 'financial',
    commit: 'intent',
    replay: 'recorded-only',
    idempotency: 'required',
  },
)

const rt = createRuntime({
  nodes: standardNodes,
  models: { default: openai('gpt-4o-mini') },
  tools: { refund },
  policy: compose(denyUnknownTools()),
  pricing: ({ usage }) => ({ cost: usage.inputTokens * 0.000001 + usage.outputTokens * 0.000005, currency: 'USD' }),
})

const state = new InMemoryRuntimeState()
const result = await rt.run(agent, { input: { orderId: '42' }, state })
```

`run` исполняет граф до терминального статуса или до `needs_input` и сам вызывает `state.commit` на commit-точках. Для стрима токенов используйте `start` (async iterator), `model.delta` доступен только в нем.

`ctx.idempotencyKey` формируется runtime как `sessionId:nodeExecutionId:attempt` и подставляется в обертку tool, host вычислять его не требуется.

Промпт с id `classify` хранится в `definition.prompts`, правка текста меняет `hashDefinition`. Ссылка `prompt: 'classify'` без записи в `definition.prompts.classify` дает ошибку `compile`.

Budget в definition можно опустить: `compile` пишет warning, runtime ставит конечный default `maxSteps`. `maxCost` включает hard-stop только если в `createRuntime` передан `pricing`, без него работают `maxSteps`, `maxTokens`, `deadlineMs`.

Граф без модели компилируется для CI и replay `recorded` tools, в тестах используйте `mockModel` из `harnesys/testing`.

---

## Билдер

Тот же агент, тот же hash. На сборке `when` может быть функцией с типами контекста. `.build()` переводит её в строку выражения. В definition, которая уходит в `compile`, функций нет. Hash считается только от канонического JSON после `.build()`.

Разрешённый subset в `when(ctx => …)`: сравнения и булевы комбинации по `ctx.input`, `ctx.state`, `ctx.output`, `ctx.resume`. Иначе `.build()` бросает. JS `===` становится JSONata `=`. В `harnesys/testing`: `assertSameHash(literal, built)`.

```ts
import { agent as a, node, edge } from 'harnesys/builder'

const b = a('billing.support.v3')
  .prompt('classify', { /* те же messages, что в литерале */ })
  .node('start', node.core.start())
  .node('classify', node.llm.generate({
    model: 'default',
    prompt: 'classify',
  }))
  .node('refund', node.tool.call('refund', { args: { orderId: '$input.orderId' } }))
  .node('approval', node.control.interrupt({
    reason: 'human_review',
    resumeSchema: { /* JSON Schema, как в литерале */ },
  }))
  .node('end', node.core.end())
  .edge(edge.from('start').to('classify'))
  .edge(edge.from('classify').to('approval').when((ctx) => ctx.output.risk === 'high'))
  .edge(edge.from('classify').to('refund').when((ctx) => ctx.output.risk !== 'high'))
  .edge(edge.from('approval').to('refund').when((ctx) => ctx.resume.approved === true))
  .edge(edge.from('approval').to('end'))
  .edge(edge.from('refund').to('end'))
  .budget({ maxSteps: 24, maxTokens: 50_000, maxCost: 0.40, deadlineMs: 120_000 })
  .build()
```

`$schema` в JSON-файле definition ссылается на версию `harnesys/schemas`. Линтер выражений ловит `==` вместо `=` и неизвестные поля `$output.riskk` до запуска.

---

## Инварианты

Реализация с нарушением любого из четырех инвариантов не соответствует контракту runtime.

1. **Definition, snapshot, command и event сериализуемы.** Нет функций, замыканий, сокетов, промисов, клиентов провайдеров, секретов. `LanguageModel` и `McpClient` живут в `createRuntime`, не в артефактах. Envelope freeze в 2.0.

2. **Runtime состояние не хранит.** Он вызывает `RuntimeState.commit(snapshot, events, { kind, sequence })` и ждёт успешного возврата. Два `kind`:
   - `intent`: до необратимого эффекта (`financial`, `destructive`, `credentialed`);
   - `recorded`: после успешного execute, с результатом в логе.
   Replay смотрит `recorded`: завершённый шаг не повторяется. Краш между `intent` и эффектом даёт фазу шага `unknown` и run `needs_input` (`reason: 'uncertain_effect'`). Автоповтор execute в этой фазе запрещён.

3. **Порождённая definition, если policy пустила spawn, идет тем же путем, что статическая:** canonicalize → validate → check → policy → budget → compile. Generated agents по умолчанию выключены. Handoff на id из `agents.resolve` включён.

4. **Права не расширяются:** capabilities ребёнка ⊆ capabilities родителя ∩ host. Storage ребёнка это `RuntimeState.child(spawnId)`, не тот же объект прав.

---

## Runtime

```ts
const rt = createRuntime({
  nodes: standardNodes,
  tools: { refund, lookup },
  models: { default, cheap },          // LanguageModel
  mcp: { payments: paymentsClient },   // опционально
  agents: { resolve: (id) => catalog.get(id) },
  policy: compose(denyUnknownTools()),
  pricing: ({ model, usage }) => ({ cost, currency: 'USD' }),
  stream: { chunkIntervalMs: 1000, chunkSize: 6 }, // батчевый flush live-дельт
  clock: () => Date.now(),
  rng: () => Math.random(),
})

rt.validate(definition)   // schema и граф, без bindings
rt.check(definition)      // names: tools, models, mcp, node types, agents.resolve
rt.compile(definition)    // чисто; зовёт validate. Bindings не зондрует сетью

rt.run(definition | plan, { input, state, invocation?, onDefinitionMismatch? })
rt.start(definition | plan, { input, state, invocation?, onDefinitionMismatch? })
rt.resume(state, command, { definition, invocation?, onDefinitionMismatch? })
rt.inspect(plan | state)  // read-only, без commit и без эффектов
rt.replay(events, { until?: { sequence } })
rt.visualize(plan, 'mermaid')
rt.runWork(state, workItem) // очередь: тот же execute и те же commit
```

`hashDefinition(definition)` это свободная функция, экземпляр runtime не требуется.

`start` принимает definition или plan и возвращает async iterator живых событий (включая `model.delta`). `run` потребляет `start` до терминала или `needs_input` и возвращает `RunResult`. Live-дельты стримятся каждую дельту в iterator, а в `RuntimeState` флашатся батчами по `stream.chunkIntervalMs` или `stream.chunkSize` как `model.chunk`. Переданная definition компилируется внутри. Plan с `planHash`, не совпадающим с `compile(definition)`, отвергается.

`check` сравнивает имена в definition с картами `createRuntime` без сетевых запросов к MCP. `compile` ловит битые рёбра, циклы без лимита, неизвестные типы, дырявые схемы, пустые исходящие. Отсутствие MCP-клиента проверяет `check` или старт run, а не чистый `compile`.

Параллельные run: разные `RuntimeState`. Лимит одновременных узлов (`maxConcurrency`) считается **внутри одного run**. Лимит run на процесс ставит host (размер пула, concurrency очереди).

`inspect` читает snapshot/plan так, как их понимает runtime. Host не парсит cursor SQL, если нужно интерпретированное состояние. Snapshot в БД хранится как blob плюс колонки `sessionId`, `sequence`, `status`, `definitionHash`.

`visualize` строит mermaid из plan без ключей провайдера, визуальный редактор в библиотеку не входит.

`replay` проигрывает уже сохранённый лог событий (host достает его из таблицы, куда писал `commit`). Модель и tool не вызываются. `clock` и `rng` на replay не используются, timestamps и внешние результаты уже в событиях.

Отмены это команда `{ type: 'cancel', mode: 'graceful' | 'hard' }` на `resume`. Сахар `rt.cancel(state, { mode })` шлёт ту же команду. `AbortSignal` уходит в `streamText` и в tool `execute`.

В поверхность исполнения входят `run`, `start`, `resume`, `inspect`, `replay`, `runWork`. Pending `WorkItem` виден в `inspect(state)` и событии `work.issued`. Методы `advance`, `fork`, `dryRun` и отдельный poller `nextWork` не предоставляются.

---

## RuntimeState

```ts
type CommitKind = 'intent' | 'recorded'

type Invocation = {
  actor?: string
  tenant?: string
  scopes?: readonly string[]
}

interface RuntimeState {
  readonly sessionId: string
  load(): Promise<Snapshot | null>
  commit(
    snapshot: Snapshot,
    events: readonly Event[],
    meta: { kind: CommitKind; sequence: number },
  ): Promise<void>
  child(spawnId: string): RuntimeState
}

class InMemoryRuntimeState implements RuntimeState {
  constructor(seed?: Snapshot, sessionId?: string)
}
```

`sessionId` назначает host или генерирует `InMemoryRuntimeState`. У `run` и `start` поля `sessionId` нет, ключ хранит только `state`.

`commit` с `kind: 'intent'` должен стать прочным до `resolve`, иначе runtime не вызывает эффект. `commit` с `kind: 'recorded'` пишет результат шага. Если `commit` бросил до успешного `intent`, шаг не совершен. Если `intent` уже прочен, а процесс умер до `recorded`, шаг получает фазу `unknown`, это не откат к несовершённому.

`load` нужен на `resume` в новом процессе.

`child` для spawn использует тот же бэкенд с другим `sessionId`, детерминированным как `parentSessionId` + `nodeExecutionId` + ordinal. У Nest-реализации тот же репозиторий с другим ключом.

Идемпотентность держится на монотонном `sequence` в snapshot и на `eventId` + `idempotencyKey` у событий. Повторный `commit` с тем же `sequence` host делает как upsert или ignore. Два writer на одну сессию это ошибка host (требует lease или fencing в БД). Conformance отвергает lost update при дырявом `sequence`.

`invocation` на `run` / `resume` / `runWork` попадает в `policyHook` и в `ctx` tool и не пишется в snapshot. Секреты шага host резолвит сам через замыкание сервиса, значения в events и snapshot не логируются. Для tool с `sensitivity` или `credentialed` runtime режет аргументы по allowlist на пути `commit`, а не при экспорте.

Любая реализация, которую тащат в прод, проходит `assertRuntimeStateConformance` из `harnesys/testing`: duplicate sequence, throw внутри `commit`, load после «нового процесса», `intent` без последующего `recorded`, concurrent commit.

`commit` для host это граница транзакции: snapshot, events и outbox очереди пишутся в одном unit of work, иначе intent и job расходятся.

---

## Snapshot и cursor

```ts
type Snapshot = {
  sessionId: string
  runId: string
  definitionHash: string
  planHash: string
  sequence: number
  status: RunStatus
  runtimeVersion: string
  initialInput: unknown
  state: unknown
  cursor: Cursor
  artifacts: ArtifactRef[]
}
```

Snapshot не содержит функций, сокетов, промисов, клиентов или секретов. Крупные артефакты хранятся ссылками, host резолвит их сам.

`runId` выдает runtime на первый `run` или `start` сессии и не меняет на `resume`. `nodeExecutionId` равен `${runId}:${nodeId}:${n}`. Отдельного `attemptId` нет.

`initialInput` неизменяем. `state` меняется патчами редьюсера.

Cursor держит исполнение: активные узлы с фазой шага, pending work, join, retry, timer (`fireAt`), interrupt, cancellation, budget, tool-call ids. Это один объект с явными машинами, а не свалка полей.

Фаза шага:

```
scheduled → intent? → executing → recorded | unknown | failed
```

`intent` пропускается для `pure`, `read` и обычного `write` (сразу execute, затем `recorded`). Для `financial`, `destructive`, `credentialed` intent обязателен.

---

## Resume и смена definition

На каждый `resume` host передаёт `definition`. Runtime делает `compile` и сравнивает hash с `snapshot.definitionHash`. Plan в snapshot не хранится, его всегда можно получить из definition. Если host хочет старое поведение висящего interrupt, он передает старую definition из таблицы `definitions` по hash. Политики `onDefinitionMismatch`:

| Значение | Поведение |
|---|---|
| `reject` | ошибка `HNS-RESUME-HASH` (класс `resume-hash`), run не двигается. Дефолт |
| `compile-new-and-map-cursor` | новый compile, cursor мапится по `node id`; несмапившиеся узлы → `needs_input` с `reason: 'definition_migrated'` |

Политики исполнения старого plan из snapshot нет. Plan всегда равен `compile(definition)`. Старое поведение висящего interrupt host получает передачей definition того же hash.

---

## Выражения

JSONata над фиксированными слотами, слоты не перетирают друг друга.

| Слот | Значение |
|---|---|
| `$input` | `initialInput` всего run |
| `$state` | документ редьюсера |
| `$output` | выход узла `from` на этом ребре; на join: карта по веткам |
| `$resume` | `payload` команды, закрывшей interrupt, с которого уходит ребро |

В учебном агенте refund читает `$input.orderId`. Одобрение после HITL это `$resume.approved`, а не `$input.approved`.

---

## События

Каждое событие содержит `eventId`, `type` (dotted), `timestamp`, `sessionId`, `runId`, `agentId`, `sequence`, `causationId`, `correlationId`. Расширение идет через `metadata`.

| `type` | Когда | В `commit` |
|---|---|---|
| `run.started` / `run.completed` / `run.failed` / `run.needs_input` / `run.cancelled` / `run.timed_out` / `run.budget_exceeded` / `run.dead_lettered` | смена статуса run | да |
| `node.scheduled` / `node.started` / `node.completed` / `node.failed` | узел | да |
| `state.committed` | после commit; `kind: intent \| recorded` | да |
| `model.requested` | старт `streamText` | да |
| `model.delta` | `text-delta`; `{ text, index }` | нет, только iterator `start` (live) |
| `model.chunk` | батч из 3-6 дельт или по таймеру `STREAM_CHUNK_INTERVAL_MS`; `{ text, index, chunkId }` | да, батчевый `recorded` |
| `model.completed` | `finish`; `{ text, finishReason, usage, toolCalls }` | да, один `recorded` узла |
| `model.failed` | ошибка / abort | да |
| `tool.requested` | финальный tool-call от модели или вход в `tool:call` | да |
| `tool.completed` / `tool.failed` | execute | да |
| `control.interrupt` / `control.approval` / `control.policy` / `control.budget` / `control.cancellation` / `control.repair` | пауза и политика | да |
| `agent.spawned` / `agent.completed` / `agent.failed` | handoff/spawn | да |
| `work.issued` / `work.completed` / `work.failed` | очередь | да |

Краш до `model.completed` сохраняет последний закоммиченный чанк, повтор `streamText` догенерирует хвост. Отдельные `model.delta` после рестарта не восстанавливаются, восстанавливается последний `model.chunk` из `commit`. Интервал и размер чанка настраиваются константами `STREAM_CHUNK_INTERVAL_MS` (дефолт 1000, допустимо 1000-3000) и `STREAM_CHUNK_SIZE` (дефолт 6, допустимо 3-6 дельт) в `createRuntime({ stream })`.

Host, которому нужны спаны, мапит события на свой tracer. Функция `eventsToSpans(events, { tracer })` может жить в `harnesys/observability`, exporter и OTLP endpoint не входят. Parent context берется из `context.active()` host, runtime в сеть за спанами не ходит.

---

## Команды

На `resume` передается только объект с `type`. Голого `{ approved: true }` нет.

```ts
type Command =
  | { type: 'resume'; interruptId: string; payload: unknown }
  | { type: 'reject'; interruptId: string; note?: string }
  | { type: 'workItemFailure'; workItemId: string; error: unknown }
  | { type: 'signal'; name: string; payload?: unknown }
  | { type: 'cancel'; mode: 'graceful' | 'hard' }
  | { type: 'deadline'; timerId: string }
  | { type: 'repair'; action: 'retry-node'; nodeId: string; note?: string }
```

`resume` проверяет `payload` по `resumeSchema` узла и делает дедуп по `interruptId` + `sequence`. Несколько interrupt на run допустимы, адресат всегда `interruptId`.

`reject` закрывает interrupt и идет по рёбрам без `$resume` или по ребру без `when`. Отдельного статуса run у `reject` нет.

Успешный tool с очереди закрывается через `rt.runWork(state, item)`, а не командой с `result` снаружи. `workItemFailure` используется когда воркер не смог вызвать `runWork`.

`repair` пишет `control.repair` и идет через `policyHook('repair', payload)`. В v1 доступен только `retry-node` и только если фаза узла `failed` или `unknown`. Методы `goto`, skip, force transition и ручной patch состояния не предоставляются. Повтор `recorded` финансового шага `repair` не делает.

Таймеры хранятся в cursor как `{ timerId, fireAt }`. Будит их host командой `deadline`, runtime сам минутами не спит.

Одна пауза наружу это статус `needs_input` и объект `interrupt: { interruptId, reason, resumeSchema, nodeId, payload }`. `reason` принимает `human_review` | `policy` | `uncertain_effect` | `definition_migrated` | `work` | `wait`. Отдельного статуса `suspended` нет.

Статусы run: `completed`, `failed`, `needs_input`, `cancelled`, `timed_out`, `budget_exceeded`, `dead_lettered`. Статуса `rejected` нет, policy deny дает `failed` с классом `policy`.

---

## WorkItem

Контракт транспорта для воркера host. Runtime очередь не содержит, worker не вызывает `tool.execute` сам.

```ts
type WorkItem = {
  workItemId: string
  sessionId: string
  runId: string
  nodeId: string
  kind: 'tool' | 'node'
  payload: unknown
  idempotencyKey: string
  sequence: number
}

// host
for await (const e of rt.start(plan, { input, state })) {
  if (e.type === 'work.issued') await queue.push(e.workItem)
}

// другой процесс
worker.on('job', async (item) => {
  const state = new RepoRuntimeState(item.sessionId, repo)
  await rt.runWork(state, item)
})
```

`runWork` делает load → policy → `intent` при необходимости → `execute` из реестра → `recorded`. Inline execute остается дефолтом. `dispatch: 'queue'` на ToolPolicy узла или tool включает выдачу `WorkItem`, run тогда заканчивается `needs_input` с `reason: 'work'`.

`llm:*` всегда `inline` в процессе, который держит `start()`. Стрим из чужого воркера библиотека не собирает, `kind: 'model'` не существует.

---

## Сценарии

### Nest: состояние в репозитории

```ts
class RepoRuntimeState implements RuntimeState {
  constructor(
    readonly sessionId: string,
    private readonly repo: RunRepository,
  ) {}

  async load() {
    return this.repo.getSnapshot(this.sessionId)
  }

  async commit(snapshot: Snapshot, events: readonly Event[], meta: { kind: CommitKind; sequence: number }) {
    await this.repo.save({ sessionId: this.sessionId, snapshot, events, ...meta })
  }

  child(spawnId: string) {
    return new RepoRuntimeState(`${this.sessionId}:${spawnId}`, this.repo)
  }
}

@Injectable()
class Agents {
  constructor(
    private readonly rt: Runtime,
    private readonly repo: RunRepository,
    private readonly catalog: AgentCatalog,
  ) {}

  start(agentId: string, sessionId: string, input: unknown, invocation?: Invocation) {
    const agent = this.catalog.get(agentId)
    return this.rt.run(agent, {
      input,
      state: new RepoRuntimeState(sessionId, this.repo),
      invocation,
    })
  }

  resume(sessionId: string, command: Command, invocation?: Invocation) {
    const state = new RepoRuntimeState(sessionId, this.repo)
    const snap = await state.load()
    const agent = this.catalog.getByHash(snap.definitionHash) // или новый id, тогда mismatch
    return this.rt.resume(state, command, { definition: agent, invocation })
  }
}
```

Перед продом прогоните `assertRuntimeStateConformance(() => new RepoRuntimeState('t', repo))`. Cron, HTTP, очередь и чат вызывают `run` или `resume`, Harnesys своих триггеров не содержит.

### Interrupt, ответ через день

```ts
const out = await rt.run(agent, { input, state })
if (out.status === 'needs_input') {
  await notifyHuman(out.interrupt)
  return
}

await rt.resume(state, {
  type: 'resume',
  interruptId: out.interrupt.interruptId,
  payload: { approved: true },
}, { definition: agent })
```

Оператор после инцидента с `unknown`:

```ts
await rt.resume(state, {
  type: 'repair',
  action: 'retry-node',
  nodeId: 'refund',
  note: 'provider 503, checked ledger: no charge',
}, { definition: agent })
```

### Два агента на одном runtime

```ts
await Promise.all([
  rt.run(billing, { input: jobA, state: new InMemoryRuntimeState() }),
  rt.run(triage,  { input: jobB, state: new InMemoryRuntimeState() }),
])
```

Общие tools, models и policy. Изоляция идет через свой `RuntimeState`, неявного shared mutable state нет.

### Стрим токенов в чат host'а

```ts
for await (const e of rt.start(agent, { input: { messages, orderId }, state })) {
  if (e.type === 'model.delta') socket.send(e.text)
  if (e.type === 'run.needs_input') await notifyHuman(e.interrupt)
}
```

История принадлежит host. В definition это биндинг `messages` на `$input.messages` или `$state.messages`. Новое сообщение пользователя host либо стартует новым run с полной историей (предыдущий completed), либо шлёт `{ type: 'signal', name: 'message', payload }` в граф, который стоит на interrupt или wait. Первоклассного `thread` в библиотеке нет.

### Handoff

Узел `control:handoff` делает spawn известного id с await: definition достается через `agents.resolve`, права аттенюируются, состояние идет через `state.child`. Interrupt ребёнка всплывает наружу с `interruptId` вида `child/{spawnId}/{childInterruptId}`. `resume` родителя с этим id делегирует в child. Stdlib-пример: triage → `billing.support.v3`. Generated definition по умолчанию выключена.

### Compile в CI

```ts
const plan = rt.compile(agent)
if (plan.diagnostics.some(d => d.severity === 'error')) fail()
rt.check(agent) // без ключей; смотрит имена в createRuntime, который для CI собран с mockModel
fs.writeFileSync('graph.md', rt.visualize(plan, 'mermaid'))
```

### Replay инцидента

```ts
const events = await repo.listEvents(sessionId)
await rt.replay(events, { until: { sequence: 42 } })
```

Шаги с `recorded` не исполняются. Шаги с `intent` без `recorded` помечаются `unknown` в отчёте replay без побочных эффектов.

---

## AgentDefinition

Каноническая сериализация и JSON Schema контракта без runtime-ссылок. Поля: явный `id`; metadata (`name`, `description`, `tags`, `author`, `builtAt`); `prompts`; `graph`; `budget`; capability manifest как список имён (models, tools, MCP `{ server, name }`, node types). Одинаковые данные дают одинаковый `hashDefinition`.

Imports других definition, bundle, подпись и trust publishers в ядро 1.x не входят. Host кладёт JSON в git или в свою таблицу. Каталог для handoff это `agents.resolve`.

Нормализация и валидация идут до compile. Можно выгрузить normalized form и plan для аудита.

---

## Граф

Узел в definition это декларация. Исполнитель живёт в реестре runtime (`nodes` + `tools` + `models` + `mcp`). В графе имена, в host объекты.

Типы в definition всегда с двоеточием: `core:start`, `llm:generate`. Проза `семейство llm:*` описывает набор типов.

Stdlib, без которого harness не собрать:

```
core:start, core:end
llm:generate          // один streamText / streamObject; optional output schema; optional tools[] как schema-only
tool:call             // name из createRuntime.tools
tool:mcp              // { server, name } из createRuntime.mcp
control:interrupt
control:loop          // predicate + body subgraph + maxIterations
control:join          // await: nodeId[], mode: all | any | n-of-m
control:handoff       // agentId + input mapping
```

`core:end` без своего enum статуса: run становится `completed` или `failed`, если узел помечен как ошибка графа.

Карточка узла для исполнения: input/output schema (JSON Schema), `sideEffect`, timeout, retry, `dispatch` (`inline` | `queue`). Read-set, write-set и отдельный enum determinism не являются полями definition, replayability следует из `sideEffect` и ToolPolicy.

Рёбра: `from`, `to`, опционально `when` (JSONata), опционально `guard` (`policy:<id>`), опционально `onError` (id узла, не магическое слово `compensate`).

Топология v1:

- Несколько исходящих рёбер без `when`: fan-out, все стартуют.
- Рёбра с `when`: стартуют все истинные. Если ни одно не истинно и нет ребра без `when`, run получает ошибку пустого выхода. Xor-маршрут требует взаимоисключающих `when` плюс ребро-default без `when`.
- Join: явный `await: nodeId[]`. `all` ждёт всех, `any` первого успешного (остальные cancel graceful), `n-of-m` первых n успешных. Поля `over: коллекция` у join нет. Map по массиву делается позже или через bounded loop.
- Bounded loop: `predicate` + `maxIterations` + глобальный budget. Так пишется ReAct: generate → tool:call → generate, пока нет финального текста или пока лимит.
- Subgraph со своими портами. Композиция только через subgraph.
- Dynamic edges, `core:map` / `reduce` / `barrier`, `control:router` / `switch` / `wait` как отдельные типы в v1 не входят. Wait делается через `control:interrupt` и команду `deadline`. Router делается рёбрами `when`.

```ts
join: { type: 'control:join', await: ['alpha', 'beta', 'gamma'], mode: 'n-of-m', n: 2 }
```

K из N параллельных веток (первый валидный structured с двух из трёх моделей) это этот узел. Ретраи 3 из 5 это `RetryPolicy` на узле, а не join.

На типе узла и на tool задается `sideEffect`: `pure | read | write | destructive | financial | communication | credentialed`.

Compile до токенов ловит битые ссылки, неизвестные типы, несовместимые схемы, недостижимые узлы, пути без терминала, циклы без лимита, плохие контракты subgraph и `prompt` без `definition.prompts`.

---

## Исполнение

| Вопрос | Ответ |
|---|---|
| Узел started | после `node.scheduled` и валидации входа |
| Intent committed | `commit(..., { kind: 'intent', sequence })` до эффекта |
| Recorded committed | `commit(..., { kind: 'recorded', sequence })` после успешного execute / `model.completed` |
| Side effect | после `intent` (financial/destructive/credentialed) или сразу с последующим `recorded` |
| Краш после intent | фаза `unknown`, run `needs_input` / `uncertain_effect` |
| Resume | `state.load()` + `definition` + `Command` + политика hash |
| Replay | повтор лога; есть `recorded` → шаг не исполняется |
| Cancel | команда, `graceful \| hard`, `AbortSignal` вниз по subgraph/spawn |
| Join | `all \| any \| n-of-m` по `await[]` |
| Query | `inspect`, без commit |
| Repair | `retry-node` в логе, через policy, только `failed`/`unknown` |

Режимы планировщика: однопоточный детерминированный (тесты, replay) и concurrent внутри run. `workItemId` детерминирован.

Запрещены skip узла, force transition, ручной patch состояния и автоповтор деструктивного execute. Компенсация это узел, на который указывает `onError`, со следом в логе.

---

## Состояние и reducer

Патч узла это путь и значение. Встроенные стратегии: `replace`, `append`, `deepMerge`. Свой merge это функция в `createRuntime`, а не каталог sum/min/cas и не реестр кодеков.

После каждого патча идет валидация. Отказ не портит предыдущий snapshot. Метаданные исполнения (`runId`, `initialInput`, hashes) неизменяемы. Защита записи полей идет через `policyHook('state patch')`.

Партиции для subgraph и spawn: controlled sharing, copy-on-write, явный output mapping.

Детерминизм тестов: host подставляет `clock` и `rng` в `createRuntime`. В prod это `Date.now` и системный rng. `seed` и `fakeClock` живут в `harnesys/testing`.

---

## Модели

В definition хранится ключ карты `createRuntime.models`: `model: 'default'`. Клиент SDK и строка `llm.default` в граф не попадают.

Узел `llm:generate`:

```ts
{
  type: 'llm:generate',
  model: 'default',
  prompt: 'classify',              // id в definition.prompts
  messages: '$input.messages',     // JSONata → массив; сливается с prompt
  output: { /* JSON Schema, optional → streamObject / output */ },
  tools: ['lookup'],               // имена; в streamText уходят schema-only
}
```

Если задан `output`, runtime вызывает structured-путь SDK (`streamObject` или `streamText` с output schema), а не свой JSON-repair loop.

`model.completed.usage` кормит budget (`maxTokens` и `maxCost` если есть `pricing`). Fallback chain провайдеров host делает обёрткой `LanguageModel` до `createRuntime`. Embeddings и multimodal как отдельные типы узлов не входят, если модель принимает image parts в `ModelMessage`, граф их не запрещает.

Память (pin, summarize, truncate как подсистема) в ядре отсутствует. Truncate по `maxTokens` контекста host может сделать до `run` или отдельным своим узлом, зарегистрированным в `nodes`.

---

## Tools

В графе `{ type: 'tool:call', name: 'refund', args }`. В runtime `withPolicy(tool({ … }), ToolPolicy)`. Обёртка Harnesys вызывает `execute` после `intent` и подставляет `idempotencyKey` плюс `abortSignal`.

ToolPolicy: `replay`, `commit` (`intent` | `recorded`), `retry`, `timeout`, `compensation` (node id), `sensitivity`, `dispatch`. Graph-узел может переопределить timeout и dispatch. `policyHook` не является ToolPolicy.

| `sideEffect` | дефолт `commit` | replay |
|---|---|---|
| `pure` / `read` | `recorded` | можно повторить |
| `write` / `communication` | `recorded` | повтор по `idempotencyKey` |
| `financial` / `destructive` / `credentialed` | `intent` затем `recorded` | `recorded-only`, без автоповтора execute |

Исход `unknown` (есть `intent`, нет `recorded`) не запускает скрытый recovery subgraph. Cursor ставит фазу, run ждет `repair` или ребро, которое автор сам навел на compensate-узел.

`requireApproval({ tools: ['refund'] })` в `compose` эмитит тот же `control.interrupt` (`reason: 'policy'`) перед execute. В одном агенте не ставят одновременно узел `control:interrupt` перед тем же tool и `requireApproval` на него: два HITL на один refund запрещены на `check`.

---

## MCP

Ссылка в definition:

```ts
{ type: 'tool:mcp', server: 'payments', name: 'refund', args: { /* */ } }
```

Capability manifest перечисляет `{ server, name }` и hash input schema, зафиксированный на compile. Host передаёт готовые клиенты в `createRuntime({ mcp })`. Runtime не делает discovery и не расширяет граф живым списком tools. Новый tool с сервера не появится в run, пока его нет в definition и policy. Drift схемы на run дает ошибку `HNS-MCP-SCHEMA`, а не тихий вызов.

Транспорт, sampling, elicitation и MCP-сервер приложения остаются в SDK и в host.

---

## Ошибки

Один error model. Класс: `validation`, `policy`, `model`, `tool`, `timeout`, `cancellation`, `budget`, `compile`, `state-conflict`, `host`, `infrastructure`, `resume-hash`, `mcp-schema`. У каждой: cause chain, public/private diagnostic, retryability, origin. Код `HNS-…` (пример: `HNS-RESUME-HASH`, `HNS-MCP-SCHEMA`), узел/ребро, hint. `compile` возвращает `{ ok, plan?, diagnostics }`, а не только throw.

RetryPolicy это данные: `maxAttempts`, `deadlineMs`, `backoff` (`exponential` / `fixed`). Вешается на node, graph или класс ошибки. Для шагов с `commit: 'recorded'` ретрай execute допустим до успеха, затем пишется `recorded`. Для `intent` ретрай execute только после `repair` или явного compensate-узла, не автоматически. Краш после успешного write до `recorded` безопасен только если tool учитывает `idempotencyKey`.

На границе subgraph `onError` ведет на узел. Тихого rollback нет. Dead-letter это терминальный статус, когда retry исчерпан и `onError` отсутствует.

---

## Policy

Один `policyHook(stage, payload) → allow | deny | interrupt`. Стадии, которые реально вызываются: `compile`, `node`, `model`, `tool`, `state patch`, `repair`. Остальное не является публичным списком.

Сборка: `compose(denyUnknownTools(), requireApproval({ tools: ['refund'] }), allowMcp({ servers: ['payments'] }))`. Под капотом один хук.

PII, jailbreak, residency и allowlist моделей это реализации этого хука у host. Fail-closed или fail-open и объяснение пишутся событием `control.policy`. Исполнения недоверенного JS из графа нет, `user:*` узлов нет. Host, которому нужен свой executor, регистрирует его в `nodes`.

---

## Budget

Один объект `{ maxSteps, maxTokens, maxCost, deadlineMs }`. `maxSteps` покрывает шаги, циклы, ветки, tool calls. Soft warning и hard stop дают `budget_exceeded`. Clock дает host. Денежный лимит интерпретирует `pricing` этого runtime, между host `maxCost` не portable.

На spawn child получает остаток лимита родителя, а не отдельное бесконечное дерево reservation. Ядро содержит два именованных лимита `maxSpawnDepth` и `maxChildrenPerParent`, остальные не плодятся.

---

## Spawn

Узел порождает известный `agentId` (резолв через `agents.resolve`) или, если policy явно включила generated, новую definition. Дальше идет обычный путь и `start` на `state.child(spawnId)`. Тело generated definition, если когда-нибудь включат, кладётся в snapshot ребёнка целиком, резолвер после рестарта может исчезнуть.

v1 режим: sync in-process. Parent `start` не возвращает, пока child не терминален или не `needs_input` (interrupt всплывает). Detached spawn и отдельный join детей как второй механизм не входят, ожидание нескольких children делается через `control:join` по узлам-handoff.

Cancel: parent `hard` при child в фазе `intent` без `recorded` не убивает эффект, child переходит в `unknown`.

Кэш скомпилированных агентов хранится по hash внутри процесса.

---

## Тесты

```ts
import { createRuntime, InMemoryRuntimeState } from 'harnesys'
import {
  fakeClock, mockModel, collect, toContainEvent,
  assertRuntimeStateConformance, assertSameHash,
} from 'harnesys/testing'

await assertRuntimeStateConformance(() => new InMemoryRuntimeState())

const rt = createRuntime({
  nodes: standardNodes,
  models: { default: mockModel({ replies: [{ text: '{"risk":"high"}' }] }) },
  clock: fakeClock('2026-01-01T00:00:00Z'),
  rng: () => 0.5,
})
const state = new InMemoryRuntimeState()
const events = await collect(rt.start(plan, { input: { orderId: '42' }, state }))
expect(events).toMatchGolden('./triage.golden.jsonl')
expect(events).toContainEvent('control.interrupt')
expect(events).toContainEvent('model.completed')
```

`model.delta` в golden не обязателен, он эфемерный. Conformance RuntimeState: duplicate sequence, throw в `commit`, load после нового процесса, `intent` без `recorded`, идемпотентный повтор `recorded`, lost update.

Покрытие рантайма: compile, schema, routing, reducer, join включая `n-of-m`, retry, timeout, cancel, resume, mismatch-hash, replay, idempotency, `repair`, `runWork`, abort посередине `streamText`. Evaluation (task success, schema, cost) host вешает на события, пакета evals нет.

---

## CLI

```
harnesys validate | compile | check | inspect | visualize | run | replay | hash
```

`run` в CLI использует `InMemoryRuntimeState`, если не передали файл snapshot. `visualize` работает без ключей. Команд `migrate` до 2.0 и `bundle --sign` нет.

---

## Пакеты

```
harnesys                 типы, compile, runtime, reducer, события, InMemoryRuntimeState, toModelMessages
harnesys/builder         сахар с типизированными when(); тот же hash что у литерала
harnesys/schemas         JSON Schema контрактов (заморозка в 2.0)
harnesys/standard-nodes  core:*, control:*, llm:generate, tool:call, tool:mcp, control:handoff
harnesys/tools           withPolicy
harnesys/policy          compose, denyUnknownTools, requireApproval, allowMcp
harnesys/testing         fakeClock, mockModel, golden, collect, assertRuntimeStateConformance, assertSameHash
harnesys/observability   eventsToSpans; tracer даёт host
harnesys/cli             CLI
```

Пакетов `harnesys-adapter-postgres`, `harnesys/llm` (второй контракт модели) и стартеров Nest/Next нет. Пример `RepoRuntimeState` живёт в документации и обязан проходить conformance.

---

## Обязанности host

Host сам решает:

- когда запускать агента (HTTP, cron, очередь, чат, webhook);
- куда писать snapshot и events (SQL, диск, memory) и как делать lease/fencing;
- какие `LanguageModel`, `tool()`, `McpClient` и каталог definition (`agents.resolve`) передать в `createRuntime`;
- нужен ли визуальный редактор или LLM-генератор definition;
- как устроены inbox/outbox очереди, TTL и шифрование колонок;
- куда слать tracer и OTLP;
- как рендерить chat UX из `model.delta` и `interrupt`;
- как собирать `ModelMessage[]` до биндинга узла (кроме подстановки шаблона `definition.prompts`).

Ядро дает только контракт исполнения: definition как данные, два kind commit (`intent` и `recorded`), пауза `needs_input`, join `n-of-m`, `repair`, MCP-пин, `runWork` и стрим как live-события поверх `streamText`.

---

## Вне ядра

В ядро не входят:

- исполнение: Studio, cron, HTTP-сервер, `createDevRuntime`, первоклассный chat-thread, per-process `maxConcurrency` как замена пулу host;
- хранение: пакеты адаптеров Postgres/Redis, field-level codec, каталог редьюсеров sum/min/cas, заморозка envelope с дня 1, 25 per-* лимитов, persist `model.delta`;
- граф: `ToolLoopAgent` и внутренний tool-loop в `llm:generate`, `kind: 'model'` у WorkItem, `continue-old-plan`, `goto` / skip / тихий patch, overlay графов, detached spawn, песочница `user:*`;
- расширения: `ExtensionRegistry` / `CompilerPass` / `ExecutionMiddleware`, bundle signing и trust publishers, embeddings-узел, memory pin/summarize, автоповтор деструктивного execute, generated agents по умолчанию, глобальный синглтон.

Список фиксирует границу ядра на уровне `Runtime`, `RuntimeState` и `control:*` узлов.

---

## Дорожная карта

Сейчас RFC.

| Версия | Что |
|---|---|
| 0.8 | definition + compile/validate, литерал и билдер, `InMemoryRuntimeState`, `run`/`start`/`resume`, `commit` intent/recorded, фаза `unknown`, `llm:generate` через `streamText`, live `model.delta`, `tool:call` + `withPolicy`, `control:interrupt`, policyHook + `compose`, budget, AbortSignal, `idempotencyKey` |
| 0.9 | `check`, `agents.resolve` + `control:handoff`, MCP-пин, `onDefinitionMismatch`, `inspect`, visualize mermaid, `assertRuntimeStateConformance`, redaction на commit |
| 1.0 | `control:join` n-of-m, `control:loop`, `runWork`/WorkItem, `repair`, replay, `eventsToSpans`, subgraph |
| 2.0 | `envelopeVersion`, миграции snapshot, заморозка схем |

До 2.0 envelope не заморожен, `migrate` отсутствует. План `compile(definition)` в 0.8-1.0 считается источником правды для `visualize` и `replay`.
