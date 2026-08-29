# 23. Later (не блокер текущего плана 01–22)

Сюда сведена польза из старого VISION, которая **не** входит в первый проход реализации coding CLI / graph v1 по темам 01–22. Чтобы не потерять и не включать в каждый план.

## Post-v1 graph

- `control:join` (`all` | `any` | `n-of-m`), `control:loop` (bounded)
- `tool:mcp` как тип ноды (сейчас MCP = tools в registry, 18)
- subgraph ports, detached spawn
- fan-out «все истинные when» отклоняем: first-wins (03)

## WorkItem / runWork

Очередь host: `work.issued` → worker → `rt.runWork(state, item)`.  
`dispatch: 'queue'` на tool; run → `needs_input` `reason: 'work'`.  
`llm:*` всегда inline в процессе `start()`. `kind: 'model'` у WorkItem нет.

## Command extensions

```ts
| { type: 'deadline'; timerId: string }
| { type: 'repair'; action: 'retry-node'; nodeId: string; note?: string }
| { type: 'workItemFailure'; workItemId: string; error: unknown }
| { type: 'signal'; name: string; payload?: unknown }
```

`repair`: только фаза `failed` | `unknown`; через policy; повтор financial `recorded` не делает.  
Таймеры в cursor `{ timerId, fireAt }`; будит host командой `deadline`.

## middleware compose helpers

Покрыто `middleware` в `05-create-runtime.md`. Compose-хелперы (`compose(…)`) optional later.

## Прочее отложенное

- `hashDefinition`, `inspect`, `replay`, mermaid visualize
- `harnesys/builder`, `harnesys/observability` (`eventsToSpans`)
- RetryPolicy как данные на узле; `onError` → узел; dead_lettered
- `envelopeVersion` / миграции snapshot (позже)
- MCP schema pin / `HNS-MCP-SCHEMA` drift
- clock / rng в createRuntime для детерминизма

## Явно не переносим из старого VISION

Nest-сценарии, golden-тесты как продукт, CLI UX, «когда брать harnesys», публичный AI SDK `LanguageModel`/`tool()` наружу, маркетинговые пакеты как продукт, memory/embeddings как ядро.
