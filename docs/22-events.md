# 22. Events

**Depends:** 04, 09, 12  
**Sources:** VISION «События» (без OTLP/Nest)

Нужен при реализации `start()` / `commit`. Session (`20`) проецирует узкий `SessionEvent`; полный audit здесь.

## Envelope

Каждое событие: `eventId`, `type` (dotted), `timestamp`, `sessionId`, `runId`, `agentId`, `sequence`, `causationId`, `correlationId`. Расширение через `metadata`. Поля envelope как перечислены; layout может меняться, пока статус RFC.

## Catalog

| `type` | Когда | В `commit` |
|---|---|---|
| `run.started` / `run.completed` / `run.failed` / `run.needs_input` / `run.cancelled` / `run.timed_out` / `run.budget_exceeded` / `run.dead_lettered` | смена статуса run | да |
| `node.scheduled` / `node.started` / `node.completed` / `node.failed` | узел | да |
| `state.committed` | после commit; `kind: intent \| recorded` | да |
| `model.requested` | старт вызова модели | да |
| `model.delta` | text-delta; `{ text, index }` | нет (только live iterator `start`) |
| `model.chunk` | батч дельт / таймер; `{ text, index, chunkId }` | да |
| `model.completed` | finish; `{ text, finishReason, usage, toolCalls }` | да |
| `model.failed` | ошибка / abort | да |
| `tool.requested` | финальный tool-call модели или вход в `tool:call` | да |
| `tool.completed` / `tool.failed` | execute | да |
| `control.interrupt` / `control.approval` / `control.policy` / `control.budget` / `control.cancellation` / `control.repair` | пауза и политика | да |
| `agent.spawned` / `agent.completed` / `agent.failed` | handoff/spawn | да |
| `work.issued` / `work.completed` / `work.failed` | очередь (23) | да |

Константы батча модели: `09-graph-core.md` (`STREAM_CHUNK_*`).

Host сам мапит события на tracer. Exporter/OTLP в ядро не входят. Опциональный хелпер `eventsToSpans`: позже (`23-later.md`).

## Out of scope

SessionEvent shape (20), WorkItem payload (23).
