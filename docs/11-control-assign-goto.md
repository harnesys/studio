# 11. control:assign и control:goto

**Depends:** 09  
**Sources:** PUBLIC_API control:assign, control:goto

## control:assign

```ts
{ type: 'control:assign', patch: { riskLevel: '$output.risk', attempts: 0 } }
```

Каждый ключ `patch` оценивается и пишется в `$state` стратегией `replace` (shallow на ключе). `messages` меняется только если задан `patch.messages`.

Циклы: `assign` + рёбра + `budget.maxSteps` / `deadlineMs`; отдельный `map` не нужен.

Параллельные писатели из `control:spawn` в один top-level ключ при `reducers[key] === 'replace'` → runtime `concurrent_write`. При `merge` или omit ключа → ок (merge по порядку `calls`).

`$output = { patched: string[] }`.

## control:goto

```ts
{ type: 'control:goto', target: '$state.nextNode' }
// литерал: { type: 'control:goto', target: '"review"' }
```

`target` → string id ноды; прыжок без `when`. `edge_endpoint` на goto не проверяется. Нет id → `goto_target_missing`. Goto не пишет `$output`.

## Out of scope

spawn/handoff (13), interrupt (12).
