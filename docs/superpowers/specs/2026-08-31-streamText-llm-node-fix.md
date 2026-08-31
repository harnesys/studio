# streamText ↔ llm:generate — фикс проекции и reasoning

**Статус:** RFC, не реализован. Источник правды до реализации — `docs/09,20,22` + код `ai@7.0.47`.
**Связано:** `packages/harnesys/src/adapters/ai-llm-adapter.ts`, `src/application/graph.ts`, `src/application/llm.ts`, `src/application/session.ts`, `src/adapters/ai-llm-provider.ts`, `apps/studio/shared/default-agent-instructions.ts`.

## 1. Диагноз (что сломано сейчас)

### 1.1 `text.includes('<tool_call')` — костыль поверх неверной проекции
- `ai-llm-adapter.ts:175` читает `result.fullStream` (в `ai@7.0.47` алиас `result.stream`, `src/generate-text/stream-text.ts:2662`) и обрабатывает только `text-delta` + `tool-call` (`:187,200`). Остальные 20 типов `TextStreamPart` (`stream-text-result.ts:576`) игнорируются.
- `result.stream` уже отдаёт `text-delta`, `reasoning-delta`/`reasoning-start/end`, `tool-input-start/delta/end`, `tool-call`, `source`, `file`/`reasoning-file`, `start-step`/`finish-step`, `start`/`finish`, `error`/`abort`/`raw`/`custom`. Мы их не прокинули → `knowledge_search` с `tool-input-delta` улетает как текст `<tool_call>`.
- `graph.ts:32 stripToolCallXml` и `session.ts:46 stripToolCallXml` чистят XML в тексте и в `model.delta`/`model.completed` — маскируют проблему вместо фикса проекции.

### 1.2 Таймаут-костыль вместо корректной проекции
- `ai-llm-adapter.ts:105 TIMEOUT_MS 25000` + `combinedSignal` + рекурсивный `callModel(...,[])` (`:151,271`) — маскирует отсутствие маппинга `TextStreamPart`. Причина зависания — обработка только 2 типов из 22, `tool-input-*` уходит в текст.
- `toAiTools:42 inputSchema: def.input as never` — в `ai@7` `tool({inputSchema})` принимает `zod` или `jsonSchema(JsonSchema)` (`src/prompt/prepare-tools.ts:48`). Сырой `JsonSchema` без обёртки может не пройти валидацию для `openai-compatible`.
- **Xiaomi проверено по Harnyx:** `Harnyx/packages/harnyx/src/adapters/chat/language-model.ts:47` `xiaomi` → `createOpenAICompatible({baseURL:'https://api.xiaomimimo.com/v1', includeUsage:true})` (как `default`). Reasoning для `xiaomi` идёт не через `providerOptions`, а через `extra: {thinking:{type:'enabled'}}` (`Harnyx/src/adapters/chat/effort-options.ts:10,44` `EXTRA_THINKING: xiaomi:true` → `Harnyx/src/adapters/chat/with-json-extra.ts:19` мержит `...extra` в `JSON body`). `stream-chat.ts:55` использует `wrapLanguageModel(extractReasoningMiddleware)` + `result.stream`. Провайдер-специфичного gate для tools нет — мультипровайдерный путь единый. Вывод: отдельного отключения tools для `mimo-v2.5` не требуется.

### 1.3 Потеря reasoning
- `application/llm.ts:26 LlmResult {finishReason,text,toolCalls,structured}` без `reasoning`/`reasoningText`/`usage`.
- `graph.ts:336` прокидывает только `model.delta|model.chunk|model.completed`, `reasoning` игнорится. Durable `model.completed` (`22-events.md:22`) без поля `reasoning`.
- `ports/session.ts:17 SessionEvent` (`20-session.md:54`) без `reasoning-delta`. UI не может рендерить thinking отдельно.
- История `$state.messages` (`graph.ts:380`) пушит `content+toolCalls` без `reasoning` → следующий `streamText` теряет контекст reasoning (Anthropic/Xiaomi требуют reasoning в `ModelMessage[]`).

### 1.4 Инструкция врёт про тулы
- `default-agent-instructions.ts:5` перечисляет `knowledge_search`, `knowledge_read`, `recall_search`, `pin_set`, `pin_list`, `pin_remove`, `memory_write` — их нет в `toolRegistry` (`server/composition/wire-host-tools.ts:50` — только `plan`, `schedule`, `webhook` + память). Модель галлюцинирует `<tool_call>knowledge_search</tool_call>` как текст, потому что тула нет в `tools` списке, а инструкция её требует.

## 2. Цель (последовательно, по одному вопросу)

Шаг 1 — подружить `streamText` из `ai@7.0.47` с `llm:generate` нодой: `result.stream` → `StreamChunk` → `Event` (`22`) → `SessionEvent` (`20`) без костылей, с поддержкой reasoning и streaming tool args. Остальные вопросы (инструкция, таймаут, Xiaomi) фиксируем, но решаем после маппинга — часть может отвалиться сама.

## 3. Полная карта TextStreamPart → Harnesys

Базовый тип `ai`: `TextStreamPart` (`src/generate-text/stream-text-result.ts:430-601`), 22 варианта. Ниже — куда каждый идёт у нас.

| `TextStreamPart.type` | Payload | `Event` (`22-events.md`) | `SessionEvent` (`20`) | Durable? | Применение у нас |
|---|---|---|---|---|---|
| `text-start` | `id, providerMetadata` | `model.text-start {id}` live | — | нет | Индекс для батча `model.chunk`. Открывает дельта-серию, нужен для `STREAM_CHUNK_SIZE` подсчёта. |
| `text-delta` | `text, id` | `model.delta {text,index}` live | `text-delta {text}` | нет → батчится в `model.chunk` | Основной текст. Сейчас единственный ловимый — оставить. |
| `text-end` | `id` | `model.text-end {id}` live | — | нет | Закрывает батч, сбросить `chunkBuffer`. |
| `reasoning-start` | `id` | `model.reasoning-start {id}` live | `reasoning-start {id}` | нет | Граница thinking-блока для UI (серый collapsible). |
| `reasoning-delta` | `text, id` | `model.reasoning {text,id}` live | `reasoning-delta {text,id}` | нет → `model.completed.reasoning` | Xiaomi `mimo` thinking, Claude extended thinking. Стримить в desk отдельно от текста. |
| `reasoning-end` | `id` | `model.reasoning-end {id}` live | `reasoning-end {id}` | нет | Закрывает thinking. |
| `reasoning-file` | `file` | `model.file {file, reasoning:true}` live | `file {reasoning:true}` | да (на `model.completed`) | Редко, но мапить на `ArtifactStore` если модель вернула файл из reasoning. |
| `file` | `file` | `model.file {file}` live | `file` | да | Генерация файлов моделью. |
| `source` | `Source {url,title}` | `model.source {source}` live | `source {url,title}` | да (на `model.completed.sources`) | Цитаты для `knowledge_search` — показывать как ссылки под ответом. |
| `tool-input-start` | `id,toolName` | `model.tool-input-start {id,toolName}` live | `tool {phase:'streaming', toolCallId:id, name}` | нет | Начало стриминга args — UI показывает "готовит вызов <tool>". |
| `tool-input-delta` | `id,delta` | `model.tool-input-delta {delta}` live | `tool {phase:'streaming', delta}` | нет | Потоковый JSON args. Собирать в адаптере, без него большой `args` теряется. |
| `tool-input-end` | `id` | `model.tool-input-end {id}` live | — | нет | Триггер парса накопленного `args`. |
| `tool-call` | `toolName,input,toolCallId` | `tool.requested {toolCallId,name,input}` | `tool {phase:'requested'}` | да | Финальный вызов. Сейчас единственный ловимый — оставить, но брать из `tool-call`, не из текста. |
| `tool-result` / `tool-error` / `tool-output-denied` / `tool-approval-*` | — | не эмитим (исполняем в `tool:call` узле) | — | — | Если позже включим `ToolLoopAgent` — мапить в `tool.completed/failed`. Сейчас игнор. |
| `start-step` | `request,warnings` | `model.step-start {request}` live | — | да | Multi-step. Писать `usage` для `budget.maxTokens` (`13`). |
| `finish-step` | `finishReason,usage,providerMetadata` | `model.step-finish {finishReason,usage}` | — | да | То же, + `rawFinishReason`. |
| `start` | — | `model.requested` (уже есть `graph.ts:316`) | — | да | Старт вызова — уже коммитим. |
| `finish` | `finishReason,totalUsage` | `model.completed {finishReason,usage}` | `done {text}` триггер | да (`model.completed`) | `finishReason: stop|tool-calls|length|error`. Сейчас выводим из `finish`, дублирует `finish-step`. |
| `abort` | `reason` | `run.cancelled` | `error {code:'cancelled'}` | да | Прокидывать `signal`. |
| `error` | `error` | `model.failed {error}` | `error {message}` | да | Вместо таймаут-ретрая — коммитить `model.failed` + throw, fallback через `agent.fallback:06`. |
| `raw` | `rawValue` | `model.raw {rawValue}` live (debug) | — | нет | Только для tracer (`server/trace.ts`). |
| `custom` | `kind, providerMetadata` | `model.custom {kind}` live | — | нет | Провайдер-специфичные части. |

## 4. Изменения по файлам

### 4.1 `packages/harnesys/src/adapters/ai-llm-adapter.ts` (центр фикса)
- Удалить: `TIMEOUT_MS`, `combinedSignal`/`AbortSignal.any`, рекурсивный fallback `callModel(...,[])` (`:105-166`, `:262-284`), `fullStream` ветку.
- Добавить: `import { jsonSchema } from 'ai'` для `toAiTools`.
- `toAiTools(names, registry)`: `tool({description, inputSchema: jsonSchema(def.input)})`, валидация `def.input.type==='object'`, пропуск если `!def`.
- `streamConfig`: `model`, `system`/`messages`/`prompt`, `tools`, `abortSignal: signal` (без таймаута), `reasoning: effortToLevel(binding.model.effort)` (мап `effort→ 'low'|'medium'|'high'` per `docs/03-ai-sdk-core/26-reasoning.mdx:13`), `providerOptions` для Xiaomi `thinking` если `driver==='xiaomi'` (прецедент: `providerOptions` побеждает `reasoning`, `26-reasoning.mdx:38`). `response_format` → `outputSchema` оставить.
- Поток: `const result = await streamText(streamConfig)`, `for await (const part of result.stream)` + `switch(part.type)` на 22 типа (таблица выше). Аккумуляторы `fullText`, `reasoningText`, `toolCalls[]`, `sources[]`, `files[]`, `usage`. `chunkBuffer/chunkCount` батчить `text-delta+reasoning-delta` в `chunk` (`STREAM_CHUNK_SIZE`).
- `StreamChunk` расширить:

```ts
export type StreamChunk =
  | { type: 'delta'; text: string; id: string }
  | { type: 'reasoning-delta'; text: string; id: string }
  | { type: 'reasoning-start'; id: string }
  | { type: 'reasoning-end'; id: string }
  | { type: 'tool-input-start'; id: string; toolName: string }
  | { type: 'tool-input-delta'; id: string; delta: string }
  | { type: 'tool-input-end'; id: string }
  | { type: 'tool-call'; name: string; args: unknown; id: string }
  | { type: 'source'; source: unknown }
  | { type: 'file'; file: unknown }
  | { type: 'chunk'; text: string; chunkId: string }
  | { type: 'completed'; finishReason: string; text?: string; reasoning?: string; toolCalls?: ...; sources?: unknown[]; usage?: unknown; structured?: unknown }
```

### 4.2 `packages/harnesys/src/application/llm.ts`
- `LlmResult`: добавить `reasoning?: string`, `reasoningText?: string`, `usage?: unknown`, `sources?: unknown[]`, `files?: unknown[]`, `outputReserved`.
- `runLlmGenerate`: прокинуть `model.reasoning` (`reasoning-delta`), `model.tool-input-*`, `model.source` как отдельные `yield {type:'model.reasoning'|...}`. `model.chunk` оставить. `model.completed` собрать с `reasoning`/`usage`.

### 4.3 `packages/harnesys/src/domain/events.ts` + `docs/22-events.md`
- Добавить `MODEL_REASONING: 'model.reasoning'`, `MODEL_REASONING_START/END`, `MODEL_TOOL_INPUT`, `MODEL_SOURCE`, `MODEL_FILE`, `MODEL_STEP`. Обновить каталог `22-events.md:14` — новые строки с `В commit? нет/да` как в таблице.

### 4.4 `packages/harnesys/src/application/graph.ts`
- Удалить `stripToolCallXml:32` и `stripToolCallXml(res.text):382,389`.
- `for await (const event of stream)` добавить ветки `model.reasoning → yield mkEv('model.reasoning')` (live), `model.tool-input-* → yield` (live), `model.source/file → yield` (live). `model.chunk → commit('running','model.chunk')` батчит `text+reasoning`.
- `model.completed` → `res.reasoning` в `metadata.reasoning`, `output` → `st[key].push({role:'assistant', content:res.text, reasoning:res.reasoning, toolCalls:res.toolCalls, finishReason})` (`:380`). Токены `tokens += usage?.totalTokens ?? 1`.

### 4.5 `packages/harnesys/src/ports/session.ts` + `docs/20-session.md`
- `SessionEvent` расширить:

```ts
| { type: 'reasoning-delta'; text: string; id?: string }
| { type: 'reasoning-start'; id: string }
| { type: 'reasoning-end'; id: string }
| { type: 'tool'; phase: 'streaming'|'requested'|...; delta?: string; ... }
| { type: 'source'; url: string; title?: string }
| { type: 'file'; mime?: string; data?: unknown }
```

- Обновить `20-session.md:54` — новая секция `SessionEvent`.
- Решение по `reasoning` в `SessionEvent`: **новый тип** `reasoning-delta/start/end`, не `text-delta` с `channel:'reasoning'`. Причина: UI desk рендерит thinking отдельным collapsible, фильтрация и стриминг требуют явного типа; `channel` скрывает семантику и ломает `model.chunk` durable.

### 4.6 `packages/harnesys/src/application/session.ts`
- Удалить `stripToolCallXml:46` и все вызовы (`:73,84`).
- `eventToSessionEvent:68` добавить маппинг `model.reasoning→reasoning-delta`, `model.reasoning-start/end`, `model.tool-input-*→tool/streaming`, `model.source→source`, `model.file→file`. `model.completed` → финальный `reasoning` push перед `done`.

### 4.7 `packages/harnesys/src/adapters/ai-llm-provider.ts` — отложено
- Повторяет Harnyx: `xiaomi` остаётся `createOpenAICompatible` без провайдер-специфичного gate. Reasoning для `xiaomi` — через `extra: {thinking:{type:'enabled'}}` как в `Harnyx/src/adapters/chat/effort-options.ts:44` + `with-json-extra.ts:19` (мерж в body), не через `providerOptions`. gate/tools не вводим — мультипровайдерный путь единый, Harnyx на том же `mimo-v2.5` работает. Проверяем после шага 1.

### 4.8 `apps/studio/shared/default-agent-instructions.ts` — отложено
- Фиксируем: инструкция содержит `knowledge_search`/`pin_*` которых нет в `toolRegistry` (`wire-host-tools.ts:50`). После маппинга проверим, уйдёт ли XML-галлюцинация сама. Решение (генерить список из registry vs заводить `knowledge_*` тулы) — после шага 1.

## 5. Xiaomi `openai-compatible` + tools: зависание 25с — отложено, проверено по Harnyx
- Harnyx: `language-model.ts:47` `default: createOpenAICompatible({includeUsage:true})` для `xiaomi`, `effort-options.ts:10` `EXTRA_THINKING xiaomi:true` → `stream-chat.ts:42` `withJsonExtra(extra)` → `with-json-extra.ts:19` `body={...body,...extra}`. Отдельного gate нет. Фикс таймаута — убрать `TIMEOUT_MS`/ретрай из `ai-llm-adapter.ts` после корректного маппинга. Проверяем на `mimo-v2.5` после шага 1, не вводим пер-провайдерную логику.

## 6. Вопросы к решению — согласовано 2026-08-31

**Шаг 1 (маппинг, решаем сейчас):**
1. `SessionEvent.reasoning` — **новый тип** `reasoning-delta/start/end` — решено.
2. `tool-input-delta` — **сохранить обе возможности**: live `tool {phase:'streaming', delta}` для UI прогресса + buffered `tool-call` с полным `input` для `tool:call` ноды. Не губить ни одну.
3. `source`/`file` — **live всегда** — транслировать в ленту треда/виджеты сразу, не ждать `model.completed`. Durable дублирует.

**Отложено (после шага 1):** JsonSchema/zod для `toAiTools` (отдельно), Xiaomi reasoning/tools (4.7/5), `default-agent-instructions` (4.8). `stripToolCallXml`+таймаут откатываем вместе с шагом 1.

## 7. Порядок реализации — шаг 1

1. `ai-llm-adapter.ts` — `result.stream` + 22 типа + `jsonSchema` + аккумуляторы `reasoning`/`toolCalls`/`sources`.
2. `llm.ts` + `events.ts` + `docs/22` — типы `LlmResult`/`Event` под reasoning/source.
3. `graph.ts` — live `model.reasoning/tool-input/source`, durable `model.completed` с `reasoning`.
4. `session.ts` + `ports/session.ts` + `docs/20` — `SessionEvent` reasoning (вопрос 1).
5. Откат `stripToolCallXml` + `TIMEOUT_MS`.
6. Ручная проверка: `streamText` с `reasoning` + 1 tool → `reasoning-delta` в desk, без XML `<tool_call>`.
