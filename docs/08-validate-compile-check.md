# 08. defineAgent / compile / check

**Depends:** 02, 03, 05–07  
**Sources:** PUBLIC_API «Validate / compile / check»

## Этапы

| Этап | Вход | Что делает |
|---|---|---|
| `defineAgent(def)` | literal | Структурные checks без registry; успех → `AgentDefinition`, иначе throw со списком `code` |
| `rt.compile(def)` | definition | Plan + diagnostics; без I/O и без probe bindings |
| `rt.check(def)` | definition + runtime maps | Имена tools/models/mcp/agents/node types |

## Коды structural (`defineAgent` / `compile`)

| code | Правило |
|---|---|
| `id_required` | `id` непустой string |
| `version_format` | `version` semver если задан |
| `start_count` | ровно один `core:start` |
| `end_count` | ≥ 1 `core:end` |
| `edge_endpoint` | каждый `from`/`to` ∈ nodes (`control:goto.target` не здесь) |
| `outgoing_required` | у каждого узла кроме `core:end` и `control:goto` ≥ 1 исходящее ребро |
| `missing_default` | есть `when` на `from` → есть default последним |
| `default_edge` | ≤ 1 default на `from`; он последний |
| `prompt_missing` | `llm:generate.prompt` ∈ `prompts` |
| `tool_call_shape` | XOR fixed/batch |
| `spawn_shape` | `calls` Expr; `concurrency` Expr или литерал |
| `barrier_policy` | `tool:call` batch / `control:spawn`: `barrier.policy` задан и ≠ `'all'` (v1) |
| `goto_target` | `target` Expr |
| `expr_syntax` | `when`, path-поля, `{$…}` парсятся |
| `expr_path` | path выводим из schema/state → ошибка если нет |
| `cycle_budget` | цикл / spawn / handoff-рекурсия → задан `maxSteps` или `deadlineMs` |
| `concurrent_replace` | parallel spawn, статически известные `calls`/targets: ключ пишут ≥2 ветки и `reducers[key] === 'replace'`; `merge`/omit → ок; sequential → не ставится |
| `spawn_targets_dynamic` | warning: parallel spawn, `calls` или `target` не статически перечислимы; конфликт `replace` тогда только runtime `concurrent_write` |
| `messages_path` | у `llm:generate` есть `messages`, Expr не path в `$state.*` |

Reachability: недостижимый узел кроме start → warning.

## Коды `check` (bindings)

| code | Правило |
|---|---|
| `tools_unresolved` | имена tools / fixed `name` ∈ registry |
| `model_unresolved` | llm/agent model не резолвится в `createRuntime.models` |
| `handoff_target` | литеральный `agentId` резолвится; Expr резолвится в runtime |
| `unsupported_node` | `custom:*` или тип ∉ `nodes` |
| `duplicate_hitl` | `approve.tools` ∩ tools, у которых effective permissions = `ask` (map на runtime); middleware ask статически не проверяется |

## Коды runtime (шаг / run)

| code | Когда |
|---|---|
| `concurrency_invalid` | concurrency ∉ `parallel\|sequential` |
| `unknown_path` | path не резолвится при evaluate |
| `goto_target_missing` | goto target нет в nodes |
| `spawn_target_missing` | target не нода и не agent |
| `spawn_call_limit` / `tool_call_limit` | длина массива |
| `concurrent_write` | parallel spawn barrier: ключ `replace` и ≥2 ветки реально записали ключ |
| `duplicate_hitl` | `beforeTool` вернул `ask` для call, который уже прошёл approve-interrupt в этом batch-узле |
| `output_not_ready` | чтение `$output.results` до барьера |
| `no_matching_edge` | нет ребра |
| `budget_exceeded` | лимит |
| `resume_validation_failed` / `already_resumed` / `resume_hash` | resume |
| `output_key_reserved` | warning: structured ∩ системный ключ |

## Out of scope

Исполнение шагов (09–13).
