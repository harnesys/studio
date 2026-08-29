# 09. Graph core (run / start / llm)

**Depends:** 03–08  
**Sources:** PUBLIC_API run/start; llm:generate; core:start/end

## Контракт исполнения

```ts
rt.run(agent, { input, state, permissions?, paths?, signal? }) → RunResult
rt.start(agent, { input, state, … }) → AsyncIterable<Event> // live model.delta
```

`run` потребляет `start` до терминала или `needs_input`. Параллельные run: разные `RuntimeState`. `maxConcurrency` узлов внутри одного run; лимит run на процесс ставит host.

### `core:start`

- Оценивает `state.initial` при `$input`.
- `$output = { input }` (копия run input).

### `core:end`

- `output` Expr → `RunSuccess.output`.
- Если не задан: непустой `$state.messages` → последний message; иначе текущий `$output`.

### `llm:generate`

- Резолв model (06). Prompt из `prompts[prompt]`; подстановка `{$…}` (03).
- `messages` Expr → история для модели.
- `tools?: string[]` → subset registry.
- `$output`: `{ finishReason, text?, toolCalls?, ...structured }`.
- При `finishReason: tool-calls` runtime эмитит tool.requested-семантику и отдаёт управление рёбрам (обычно на `tool:call`); сам tool не исполняет на этом узле.

### Stream модели

- Live: `model.delta` только в iterator `start` (в `commit` нет).
- Durable: батч `model.chunk` → `commit` `recorded`; финал `model.completed` один `recorded` на узел.
- `createRuntime({ stream })`: `STREAM_CHUNK_INTERVAL_MS` (дефолт 1000, диапазон 1000–3000), `STREAM_CHUNK_SIZE` (дефолт 6, диапазон 3–6 дельт).
- Краш до `model.completed`: повтор `streamText` догенерирует хвост от последнего закоммиченного chunk; отдельные delta после рестарта не восстанавливаются.

Catalog всех Event: `22-events.md`. AbortSignal → model/tool.

Если задан `output` (JSON Schema) на llm: structured-путь драйвера, не самодельный JSON-repair loop в ядре.

## Инварианты

- Рёбра first-wins (03).
- Commit points: intent/recorded вокруг необратимых эффектов (04).
- Один `llm:generate` = один вызов модели; tool execute только на `tool:call` (10).

## Out of scope

tool:call batch (10), interrupt/Command (12), session projection (20).
