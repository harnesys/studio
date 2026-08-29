# 13. spawn, handoff, task, budget

**Depends:** 05, 09, 12  
**Sources:** PUBLIC_API control:spawn, handoff, Subagent, budget inheritance

## control:spawn

```ts
{
  type: 'control:spawn',
  calls: '$state.queries', // -> [{ target: string, input?: unknown }, ...]
  concurrency: 'parallel' | 'sequential' | Expr,
  barrier?: { policy: 'all' }, // omit = { policy: 'all' }
}
```

**Resolve target:**

1. `target` ∈ `graph.nodes` → in-graph branch.
2. Иначе `agents.resolve(target)` → child agent (как handoff).
3. Иначе `spawn_target_missing`.

Реализация: оценить разделение in-graph branch и child-agent на разные типы нод. Сейчас оба пути в одном `control:spawn`.

**In-graph branch:**

- Локальный `$input` = `call.input` или копия parent `$input`.
- `$state` ветки: `state.child(spawnId)`; на barrier в parent по `reducers` (`replace` | `merge`; ключ без записи → `merge`; leaf conflict → later в `calls`, см. `04`).
- Старт с ноды `target`, рёбра first-wins. Терминал ветки: `core:end` | failed | cancelled (cursor ветки независим).
- `output` ветки = `core:end.output` или последний `$output` ветки.
- Parent рёбра после spawn: только после barrier.

**Agent branch:** полный child `run` на `state.child(spawnId)`; права ⊆ parent ∩ host (VISION).

### Barrier (spawn и тот же predicate у `tool:call` batch)

Слоты = массив по `calls`. Ветка/call пишет в `results[i]` при terminal; закрытие узла = `barrierDone(policy, slots)`.

| `policy` | v1 | Закрытие барьера |
|---|---|---|
| `all` (default) | да | каждый слот terminal: ok \| error \| skipped \| cancelled |
| `any` / `n-of-m` | нет (`23`) | тот же слот-буфер; меняется только predicate |

`calls.length` > `spawn_call_limit` (default 32) → `spawn_call_limit`. Лимиты ядра: `maxSpawnDepth`, `maxChildrenPerParent` (в runtime, не в definition).

Долгий хвост при `all`: cancel зависшего child (`Command.cancel` + `spawnId`, `12`) → слот `cancelled` → если остальные terminal, барьер закрывается. Отдельный `n-of-m` для этого не нужен.

`$output = { results: [{ target, output, isError?, cancelled? }] }` порядок = `calls`.

## control:handoff

- `input` → аргумент дочернего `run`.
- Child `completed` → `$output = { agentId, output: child.output }`.
- Child `needs_input` → parent `needs_input`;  
  `interruptId = 'child/' + encodeURIComponent(spawnId) + '/' + encodeURIComponent(childInterruptId)`.
- Child терминал failed|budget_exceeded|… → parent тот же класс, `nodeId` = handoff, `cause` с кодом ребёнка.

## tool task

| Когда | Как |
|---|---|
| Модель сама решает | tool `task` в `tools[]`; host `createRuntime.tools.task` → `rt.run(childId\|def, { input, state: parent.child(spawnId) })` с теми же budget/interrupt правилами, что handoff |
| Пайплайн всегда | `control:handoff` |

## Budget inheritance (handoff и spawn-agent)

- Child: для каждого лимита `min(parentRemaining, child.budget[dim] ?? +∞)`.
- `steps` / `tokens` / `cost` ребёнка суммируются в родителя синхронно.
- `deadlineMs` считает только активное исполнение; на `needs_input` таймер паузится.
- Child `budget_exceeded` → parent `budget_exceeded` + `cause`.
- Cancel parent `hard`, если child в фазе `intent` без `recorded`: child → фаза `unknown` (04); откат уже начатого эффекта ядро не делает.
- Права ребёнка ⊆ parent ∩ host.
- Кэш скомпилированных агентов в процессе: по `definitionHash`.

Hard-stop: `maxSteps` / `maxTokens` / `deadlineMs`. `Usage.cost?` опциональная телеметрия (host/middleware); ядро по cost не останавливает. Cost guards: middleware (`05`).

## Out of scope

Session UI для child ask (20), detached spawn, `barrier.policy` кроме `all` (`23`).
