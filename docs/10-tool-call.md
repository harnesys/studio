# 10. tool:call и approve

**Depends:** 07, 09  
**Sources:** PUBLIC_API `tool:call`, barrier approve

## Формы

```ts
{ type: 'tool:call', name: 'refund', args: { orderId: '$input.orderId' } }

{
  type: 'tool:call',
  calls: '$output.toolCalls',
  concurrency: 'parallel',
  approve?: {
    tools: string[]
    reason: string
    resumeSchema: JsonSchema // минимум { approved: boolean }
  },
}
```

## Правила batch

- `concurrency` → `'parallel' | 'sequential'` иначе `concurrency_invalid`.
- `parallel`: `maxConcurrency = min(calls.length, host.maxToolConcurrency ?? calls.length)`.
- `sequential`: `maxConcurrency = 1`.
- `calls.length` > `tool_call_limit` (default 32) → `tool_call_limit`.
- `barrier?: { policy: 'all' }` (omit = `all`). Тот же `barrierDone`, что у spawn (`13`). v1 только `all`.
- Узел завершён, когда `barrierDone`: каждый слот terminal (`ok` | `error` | `skipped` | `cancelled`).
- `$output.results` до барьера → `output_not_ready`.
- Parallel execute копит результаты по индексу `calls`; в `$output.results` и в `$state.messages` порядок всегда = `calls`, не порядок завершения. Abort/cancel одного call → слот `cancelled`/`error`; при `all` барьер ждёт остальные.
- Flush в path `messages` предшествующего `llm:generate` (обычно `$state.messages`): политика `createRuntime.toolMessages` (`05`). Default `'barrier'`: один append всего массива tool-messages когда batch terminal. `'ordered'`: message `i` после terminal `0..i`. Смена политики не меняет модель результатов (индексный буфер общий). Молчаливый drop запрещён. Если у llm нет `messages`, batch историю не пишет.
- Assistant от llm уже в messages до входа в batch.
- Live `SessionEvent` / `tool.*` events могут идти per-call до flush в `$state.messages`.

## HITL approve

Единственный runtime-примитив паузы: `control:interrupt`. `approve` на batch → compile в per-call interrupt. После compile сахара `approve` в runtime нет.

**Barrier:**

1. Разделить `calls` на `needsApprove` (имя ∈ `approve.tools`) и `free`.
2. Сначала по индексу все `needsApprove`: один active `needs_input` за раз; до resume call не execute; `approved: false` → `{ skipped: true, isError: false }`.
3. Когда все `needsApprove` terminal: `free` по `concurrency`.
4. Batch не откатывает уже выполненные siblings.
5. `$resume` на approve-call только на время этого call.
6. `interruptId`: `batch/{nodeExecutionId}/{callIndex}`.
7. Approve → SessionEvent `ask` с `source: 'approve'` и обязательным `tool: { name, input, toolCallId }` (`20`). Args UI берёт из `tool.input`, не из парсинга `interruptId`.

Ветвление: `when: '$output.results[0].isError = true'`, `exists($output.results[0].skipped)`, или `assign` перед рёбрами.

Permissions ask (14) и middleware `ask` (05) до execute: тот же interrupt-путь, schema `{ approved, input?, reason? }`. SessionEvent `source`: `permission` | `middleware`. После approve на call повторный `ask` → `duplicate_hitl` (`08`).

## Out of scope

Пайплайный `control:interrupt` (12), ask_user (16), session respond (20).
