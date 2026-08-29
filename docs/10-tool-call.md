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
- Узел завершён, когда все элементы terminal (`ok` | `error` | `skipped`).
- `$output.results` до барьера → `output_not_ready`.
- Порядок `results` и tool-messages = порядок `calls`. Индекс `i` в messages только после terminal `0..i`.
- Результаты пишутся в path `messages` предшествующего `llm:generate` (обычно `$state.messages`). Append всегда в этот path; молчаливый drop запрещён. Если у `llm:generate` нет `messages`, история в `$state` этим batch не пишется.
- Assistant от llm уже в messages до входа в batch.

## HITL approve

Единственный runtime-примитив паузы: `control:interrupt`. `approve` на batch → compile в per-call interrupt. После compile сахара `approve` в runtime нет.

**Barrier:**

1. Разделить `calls` на `needsApprove` (имя ∈ `approve.tools`) и `free`.
2. Сначала по индексу все `needsApprove`: один active `needs_input` за раз; до resume call не execute; `approved: false` → `{ skipped: true, isError: false }`.
3. Когда все `needsApprove` terminal: `free` по `concurrency`.
4. Batch не откатывает уже выполненные siblings.
5. `$resume` на approve-call только на время этого call.
6. `interruptId`: `batch/{nodeExecutionId}/{callIndex}`.

Ветвление: `when: '$output.results[0].isError = true'`, `exists($output.results[0].skipped)`, или `assign` перед рёбрами.

Permissions ask (14) и middleware `ask` (05) до execute: тот же interrupt-путь, schema `{ approved, input?, reason? }`. SessionEvent `source`: `permission` | `middleware`. После approve на call повторный `ask` → `duplicate_hitl` (`08`).

## Out of scope

Пайплайный `control:interrupt` (12), ask_user (16), session respond (20).
