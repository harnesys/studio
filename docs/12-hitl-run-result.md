# 12. HITL graph: interrupt, RunResult, Command

**Depends:** 04, 09, 10  
**Sources:** PUBLIC_API control:interrupt, «Результат run и команды»; RUNTIME approved / needs_input

## control:interrupt

```ts
{
  type: 'control:interrupt',
  reason: string,
  resumeSchema: JsonSchema,
}
```

`$output` не пишется. После успешного resume `$resume` = payload; очищается при уходе с узла по ребру. `when` на рёбрах от interrupt читает `$resume`.

Host tool (напр. `ask_user`) инициирует тот же примитив / `needs_input`; отдельной ноды нет.

Wire payload HITL: поле **`approved`** (boolean) где schema это подразумевает. Alias `allow` нет.

`interrupt.reason` (канон для реализации):  
`human_review` | `policy` | `uncertain_effect` | `definition_migrated` | `work` | `wait`.

## RunResult

```ts
type Usage = { steps: number; tokens: number; cost?: number }

type RunSuccess = {
  status: 'completed'
  runId: string
  output: unknown
  state: Record<string, unknown>
  usage: Usage
}

type RunInterrupted = {
  status: 'needs_input'
  runId: string
  interrupt: {
    interruptId: string
    reason: string
    resumeSchema: JsonSchema
    nodeId: string
  }
  usage: Usage
}

type RunFailed = {
  status: 'failed' | 'budget_exceeded' | 'timed_out' | 'dead_lettered'
  runId: string
  error: {
    code: string
    message: string
    nodeId?: string
    retryable?: boolean
    cause?: { code: string; message: string; nodeId?: string }
  }
  state: Record<string, unknown>
  usage: Usage
}

type RunCancelled = {
  status: 'cancelled'
  runId: string
  state: Record<string, unknown>
  usage: Usage
}

type RunResult = RunSuccess | RunInterrupted | RunFailed | RunCancelled

type Command =
  | { type: 'resume'; interruptId: string; payload: unknown }
  | { type: 'reject'; interruptId: string; note?: string }
  | {
      type: 'cancel'
      mode: 'graceful' | 'hard'
      /** omit = весь run; spawnId = одна ветка control:spawn → слот cancelled (13) */
      spawnId?: string
    }
// post-v1: deadline | repair | workItemFailure | signal → 23-later.md
```

На `resume` передаётся только объект с `type`. Голого `{ approved: true }` без `type` нет.

| status | Когда |
|---|---|
| `completed` | `core:end` без ошибки |
| `needs_input` | interrupt / uncertain_effect / work |
| `failed` | ошибка шага, policy deny, child error |
| `budget_exceeded` | maxSteps / maxTokens / активный deadlineMs |
| `timed_out` | host deadline вне budget (если задан) |
| `cancelled` | `Command.cancel` |
| `dead_lettered` | retry исчерпан и нет onError (когда retry войдёт) |

Policy deny → `failed`. Статуса `rejected` нет. У каждого варианта обязательны `runId` и `usage`. Session status: `running` | `needs_input` | `completed` | `failed` | `cancelled` (`20`).

## Resume / reject / hash

```ts
rt.resume(state, command, { definition }) // definition обязателен
```

- Payload валидируется по `resumeSchema`. Невалидный → `resume_validation_failed`, остаёмся в `needs_input`, `$resume` не пишется.
- Тот же `interruptId` + тот же payload после успеха → no-op. Другой payload → `already_resumed`.
- Сравнение payload: canonical JSON equality.

`reject`: закрывает interrupt, default-ребро (без `$resume`) или ребро без `when`.

### onDefinitionMismatch

На каждый resume: `compile(definition)`, сравнить hash с `snapshot.definitionHash`. Plan в snapshot не хранится.

| Политика | Поведение |
|---|---|
| `reject` (default) | ошибка `resume_hash` / `HNS-RESUME-HASH`; run не двигается |
| `compile-new-and-map-cursor` | новый compile; cursor по `node id`; несмапившиеся → `needs_input` (`definition_migrated`) |

Host обязан хранить `AgentDefinition` по `definitionHash` (или эквивалент) и на `resume` при политике `reject` передавать ту же версию. Свежий код бэкенда сам по себе snapshot не оживляет.

Permission/approve schema (фиксированная для gate):

```ts
{ approved: boolean, input?: unknown, reason?: string }
```

`approved: false` → tool skipped (как в barrier).

## Out of scope

Session `respond` / SessionEvent (20), child interrupt id prefix (13), `repair`/`runWork` (23).
