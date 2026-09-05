# Agent memory tools — дизайн

Дата: 2026-09-05
Статус: согласовано в чате (три решения, подход A). Спека ожидает ревью.

## Контекст

В Harnesys перенесены порты памяти (`packages/harnesys/src/ports/memory.ts`: `PinPort`, `SemanticMemoryPort`, `EpisodicPort`, `KnowledgePort`, `MemoryScopeId`) и host-инфраструктура studio: sqlite-адаптеры (`apps/studio/server/adapters/memory/sqlite-*.port.ts`), HTTP use-cases (`apps/studio/server/application/memory/`), knowledge-индексатор, `episodic-on-compacted.ts`. Слой агентных инструментов не перенесён. В Harnyx он жил в `packages/harnyx/src/application/memory/` — `pin_set`, `pin_list`, `pin_remove`, `memory_write`, `memory_list`, `memory_delete`, `recall_search`, `knowledge_search`, `knowledge_read` — и резолвился per-thread (`Harnyx/packages/harnyx/src/composition/thread.ts:246`). Рантайм Harnesys `agent.memory` не читает; реестр тулов студии — `files/shell/fetch/askUser` + host-tools (`apps/studio/server/composition/studio.ts:93`).

## Решения

1. Слой инструментов — в библиотеке: фабрики + `resolveMemoryTools`. Публичный API `create-runtime` не меняется; гейтинг и проводку делает хост.
2. Состав — все четыре группы, 10 инструментов.
3. `composeAgentSystem` получает блок про использование инструментов.
4. Гейтинг — подход A: все 10 тулов регистрируются на workspace один раз; видимость per-agent — через allowlist, запечённый в граф.

## Библиотека

Новые файлы `packages/harnesys/src/application/memory/`:

| файл | экспорт |
|---|---|
| `create-pin-tools.ts` | `createPinTools`, `CreatePinToolsParams` |
| `create-semantic-tools.ts` | `createSemanticTools`, `CreateSemanticToolsParams` |
| `create-episodic-tools.ts` | `createEpisodicTools`, `CreateEpisodicToolsParams` |
| `create-knowledge-tools.ts` | `createKnowledgeTools`, `CreateKnowledgeToolsParams` |
| `resolve-memory-tools.ts` | `resolveMemoryTools`, `memoryScopeResolver`, `MemoryToolPorts`, `ResolveMemoryToolsInput` |
| `memory-tool-names.ts` | `memoryToolNames` |

Общая форма фабрик:

```ts
{
  port;                       // соответствующий порт из ports/memory.ts
  resolveScope: () => MemoryScopeId;
}
```

- `createSemanticTools` + `sessionTtl?: SemanticSessionTtl | (() => SemanticSessionTtl | undefined)`.
- `createKnowledgeTools` + `topK?: number | (() => number | undefined)`; `knowledge_read` требует `port.read` (в порте опционален), при отсутствии — ошибка в результате вызова.
- Отличия от Harnyx: zod → JsonSchema (`tool()` в `ports/tools.ts:43` принимает JsonSchema); порты из `../ports/memory.ts`, а не отдельных `domain/*.port.ts`; `sessionTtl`/`topK` — значение или резолвер, потому что при workspace-регистрации per-agent конфиг известен только на момент вызова.

Инструменты:

| имя | sideEffect | вход |
|---|---|---|
| `pin_set` | write | `key`, `text` |
| `pin_remove` | write | `key` |
| `pin_list` | read | — |
| `memory_write` | write | `scope` (`session\|long`), `text`, `key?` |
| `memory_list` | read | `scope?`, `limit?` |
| `memory_delete` | write | `id` |
| `recall_search` | read | `query`, `threadId?`, `limit?` |
| `knowledge_search` | read | `query`, `limit?` |
| `knowledge_read` | read | `id` |

Все — `group: 'memory'`. Возвраты — записи портов (`PinRecord`, `MemoryRecord`, `EpisodicHit`, `KnowledgeHit`).

`memoryToolNames(memory: AgentMemoryConfig | undefined): string[]` — PortRef != null даёт имена своей группы. Тип — `domain/agent-definition.ts:41`.

`resolveMemoryTools({ definition, ports, resolveScope })` — сборка `ToolDefinition[]` по PortRef определения агента. Studio его не вызывает; это публичный вход для хостов с per-thread созданием.

Экспорты добавляются в `packages/harnesys/index.ts`.

## Studio

### create-memory-tools.ts

`server/application/host-tools/create-memory-tools.ts` (новый, по образцу соседних host-tools):

```ts
type MemoryToolsDeps = {
  memory: StudioMemoryPorts; // wire-memory.ts:39
  workspaces: WorkspaceRepository;
  agents: AgentRepository;
};
createMemoryTools(deps): ToolDefinition[]
```

- `resolveScope`: `requireHostToolScope()` (`adapters/host-tool-scope.ts`: `workspaceId`, `agentId`, `threadId`) → `resolveAgentMemoryScope(workspaces, agents, ...)` (`application/memory/agent-memory-scope.ts`). agentId переводится в agentName — identity `MemoryScopeId` совпадает с HTTP-панелями памяти.
- `sessionTtl`: `() => sessionTtlFromAgentMemory(agents.findById(scope.agentId)?.memory)` (`application/memory/semantic-session-ttl.ts:3`).
- `topK`: из `agent.memory.knowledge.spec.topK` тем же путём.
- Регистрация: `WireHostToolsDeps` в `wire-host-tools.ts` получает `memory: StudioMemoryPorts`; тулы добавляются в `extraTools` и попадают в `setExtraTools` + `toolRegistry` существующим циклом (`wire-host-tools.ts:123-126`). `studio.ts` передаёт `memory` в deps — `createStudioMemory` там уже вызывается (`studio.ts:133`).

### Гейтинг per-agent

Allowlist агента запекается в граф при сохранении: `create-agent.use-case.ts:70-71` строит `buildReactGraph(request.tools ?? [])`, `update-agent.use-case.ts:119-122` перестраивает граф только при патче `tools`.

Изменения:

- `create-agent`: `buildReactGraph([...tools, ...memoryToolNames(request.memory)])`.
- `update-agent`: граф перестраивается при патче `tools` или `memory`. Эффективный allowlist = `(request.tools ?? agent.tools) + memoryToolNames(request.memory !== undefined ? request.memory : agent.memory)`. Дубликаты схлопываются через `Set`.

Каталог UI: группа `memory` уже заведена (`entities/tool-catalog/model/grouping.ts:10`, хинт «Gated per agent by its memory settings»).

### Поток вызова

Ран → `runInHostToolScope({workspaceId, agentId, threadId})` → узел `think` отдаёт tools из графа → `tool.execute` → `resolveScope` → sqlite-порт.

## Инструкции

`apps/studio/shared/default-agent-instructions.ts`, блок в `composeAgentSystem` по мотивам Harnyx (`Harnyx/apps/studio/shared/default-agent-instructions.ts:5-27`):

- корпус: `knowledge_search`, затем `knowledge_read` по hit id;
- `memory_write` scope=session — факты этого треда; scope=long — факты через треды, ключи project/module/topic; `memory_list` — обзор, `memory_delete` — чистка;
- после компакции восстановление треда: `recall_search` плюс файлы проекта;
- перед порезкой окна — флаш pin и long.

Текст статичный: у агента с выключенной памятью этих тулов нет, ссылки ни на что не указывают.

## Ограничения

- `recall_search` находит только треды, попавшие в эпизодический индекс; индексация идёт на компакции (`episodic-on-compacted.ts`). Тред без компакции не ищется.
- Рантайм по-прежнему не читает `agent.memory`; интеграция в рантайм (путь Harnyx) не делается.
- Публичный API `create-runtime` не меняется.

## Проверка

- `bunx biome check` по монорепо; typecheck.
- Тесты запрещены (мораторий).
- Ручная проверка хозяина: у агента с включённой памятью тред видит тулы; `pin_set`/`memory_write` видны в панелях Memory; `knowledge_search` находит проиндексированный корпус; у агента с выключенной памятью тулов нет.
