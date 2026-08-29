# 04. RuntimeState

**Depends:** 01  
**Sources:** docs merge; VISION commit/cursor (без Nest)

## Контракт

Runtime вызывает `commit` и ждёт успех; байты не пишет сам.

```ts
type CommitKind = 'intent' | 'recorded'

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
```

`InMemoryRuntimeState` в пакете для тестов / локального CLI. Прод: репозиторий host.

### Snapshot

Минимальный состав: `sessionId`, `runId`, `definitionHash`, `planHash`, `sequence`, `status`, `runtimeVersion`, `initialInput`, `state`, `cursor`, `artifacts`.

Snapshot без функций, сокетов, промисов, клиентов провайдеров, секретов. Крупные артефакты ссылками (19).

- `runId` выдаёт runtime на первый `run`/`start` сессии; на `resume` не меняется.
- `nodeExecutionId` = `${runId}:${nodeId}:${n}`. Отдельного `attemptId` нет.
- `idempotencyKey` (ядро) = `${sessionId}:${nodeExecutionId}:${attempt}` (подставляется в tool execute / side-effect path).
- `initialInput` immutable. `state` меняется патчами reducer.

### Cursor

Держит исполнение: активные узлы с фазой шага, pending work, interrupt, cancellation, budget, tool-call ids, timers (`fireAt`) когда появятся.

Фаза шага:

```
scheduled → intent? → executing → recorded | unknown | failed
```

| sideEffect (tool/узел) | commit | replay |
|---|---|---|
| `pure` / `read` | сразу execute → `recorded` | можно повторить |
| обычный `write` / `communication` | execute → `recorded` | повтор с учётом `idempotencyKey` |
| `financial` / `destructive` / `credentialed` | `intent` → execute → `recorded` | без автоповтора execute |

Краш после `intent` без `recorded` → фаза `unknown`, run `needs_input` (`reason: 'uncertain_effect'`). Автоповтор execute запрещён (нужен `repair` или compensate-узел автора графа; см. `23-later.md`).

## Инварианты

- Повторный `commit` с тем же `sequence`: host upsert/ignore.
- Reducers на top-level ключах `$state`: `'replace' | 'merge'`. Ключ без записи → `merge`. `merge(a, b)`: оба массива → `[...a, ...b]`; оба plain object → рекурсивный merge по ключам; иначе `b`. `replace` → всегда `b`. `createRuntime({ mergeState?(key, a, b) })` перекрывает named reducer для ключа.
- Spawn/handoff: `state.child(spawnId)`.
- `commit` для host = граница unit of work (snapshot + events + outbox, если есть).

## Out of scope

Полный catalog Event (`22-events.md`), session UX (20), очередь WorkItem (`23-later.md`).
