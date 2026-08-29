# 01. Boundaries

**Depends:** -
**Sources:** бывшие PUBLIC_API / RUNTIME / VISION principles (отфильтровано)

## Контракт

| Ответственность | Где |
|---|---|
| Байты snapshot и events, lease, TTL, encryption | Host `RuntimeState` |
| Models, `tool()`, MCP, skills, permissions, middleware, artifacts, каталог агентов | `createRuntime({ … })` |
| Граф, prompts, budget, model/paths/skills | `AgentDefinition` |
| `commit`, `idempotencyKey`, abort в model/tool | Ядро |
| Chat DX (`session` / `send` / `respond`) | Session-слой (`20-session.md`) |

Два слоя исполнения:

| Слой | Для кого | Поверхность |
|---|---|---|
| Session | coding CLI, чат Studio | `rt.session` → `send` → `AgentRun` |
| Graph | portable definition, cross-process | `run` / `start` / `resume` + `RuntimeState` + `Command` |

Session вызывает graph. `ai` / `@ai-sdk/*` наружу не выходят.

Точка расширения: `createRuntime({ nodes, tools, models, skills, mcp, agents, permissions, paths, artifacts, middleware, clock, rng, … })`. Контракт middleware: `05-create-runtime.md`.

## Принципы (для PR / плана)

1. **Граф владеет control flow.** Один `llm:generate` = один вызов модели (без tool-loop внутри узла). Цикл model→tool→model = узлы и рёбра.
2. **Durable = `recorded`. Live = `model.delta` с батчевым flush.** В `commit` не каждая дельта; см. `22-events.md`.
3. **Граница ядра = дедупликация.** В ядро: семантика `intent`/`recorded`, формула `idempotencyKey`, abort в model/tool, фаза `unknown` после intent. SQL/Redis/HTTP/cron/React-чат/OTLP = host.
4. **Новый `type:` в stdlib** только если нельзя собрать из рёбер `when`, interrupt, `llm:generate`, `tool:call` (+ уже принятые control-ноды в `02`). Overlay/наследование графов нет.
5. Переносимость definition: совпадение имён node types / tools / models / skills / MCP, реализация `RuntimeState`, одна версия `harnesys`.

## Инварианты

- Библиотека состояние не хранит: host передаёт `RuntimeState` на каждый `run` / `start` / `resume`.
- HITL payload на wire: поле `approved` (boolean). Alias `allow` для HITL нет.
- Session и graph используют статус `needs_input` (см. `20-session.md`, `12-hitl-run-result.md`).
- SoT контракта: только `docs/`.

## Out of scope этой темы

Реализация нод, session API, permissions map. См. следующие номера.
