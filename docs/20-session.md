# 20. Session / AgentRun

**Depends:** 05, 12, 14–19  
**Sources:** RUNTIME Session / AgentRun / hello-world

## Контракт

```ts
rt.session(agentId | AgentDefinition, { state?, permissions?, paths? })

session.send(input, opts?) → AgentRun
session.resume(opts?) → AgentRun // после load needs_input

// opts: { signal?, permissions?, paths? }
```

### SendInput (как Harnyx)

```ts
type SendInput =
  | string
  | {
      text?: string
      images?: SendFile[]
      audio?: SendFile[]
      video?: SendFile[]
      files?: SendFile[]
      origin?: string
    }
```

Вход: `SendInput`. История между `send` в `RuntimeState`. Session нормализует во `input.messages` (+ attachments) для graph.

### Guards (как Harnyx)

- `send` при live `running`|`needs_input` → `ThreadBusyError`
- `send` при pending ask → `PendingHitlError`
- `resume` при live `running`|`needs_input` → `ThreadBusyError`

### AgentRun

```ts
{
  id: string
  status: 'running' | 'needs_input' | 'completed' | 'failed' | 'cancelled'
  stream(): AsyncIterable<SessionEvent> // exclusive; после respond: хвост того же run
  output: Promise<{ text: string }>
  respond(askId, payload): Promise<void> // → Command.resume; validate ask.schema
  reject(askId, { note? }): Promise<void>
  cancel(): void // → Command.cancel
}
```

### SessionEvent

```ts
| { type: 'text-delta'; text: string }
| {
    type: 'tool'
    phase: 'requested' | 'completed' | 'failed' | 'skipped'
    toolCallId: string
    name: string
    input?: unknown
    output?: unknown
  }
| {
    type: 'ask'
    askId: string // === interruptId
    schema: JsonSchema
    source: 'permission' | 'approve' | 'middleware' | 'interrupt' | 'ask_user'
    prompt?: string
    tool?: { name: string; input: unknown; toolCallId: string }
  }
| { type: 'done'; text?: string }
| { type: 'error'; code: string; message: string }
```

Permission/approve schema:

```ts
{ approved: boolean, input?: unknown, reason?: string }
```

`approved: false` → tool skipped.

### Живой процесс и краш

1. `ask` → status `needs_input` → `respond`/`reject` → тот же `stream()` до `done`.
2. Краш: snapshot `needs_input` в RuntimeState → `load` → `session(agent, { state })` → `resume()` → снова stream + respond.  
   Низкий `rt.resume(state, Command, { definition })` остаётся. Idempotent resume (12).

Полный audit Event VISION: в `start()` / commit; в SessionEvent не дублируем `model.chunk` / `state.committed`.

## Out of scope

Graph Event catalog (VISION), memory/compaction.
