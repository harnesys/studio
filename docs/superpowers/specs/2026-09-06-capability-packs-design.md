# Capability packs — дизайн

Дата: 2026-09-06
Статус: черновик, ожидает ревью.

## Контекст

Цель библиотеки — переносимый агент: запись агента плюс тот же набор capability-пачек даёт то же поведение на любом хосте. Сейчас это сломано в трёх местах:

1. **Сборка промпта в хосте.** `apps/studio/shared/default-agent-instructions.ts` (`DEFAULT_AGENT_SYSTEM`, `composeAgentSystem`) клеит процедурное ядро в студии и вызывается из `workspace-harnesys.registry.ts:130` и мёртвого `threads/agent-document-from-row.ts`. Текст описывает инструменты, которые могут быть не включены у агента (pin/memory/schedule/webhook упоминаются всегда).
2. **Инструменты-граждане второго сорта.** `plan_*`, `schedule_*` + `thread_list`, `webhook_*` живут в студии (`server/application/host-tools/create-*-tools.ts`), портов в библиотеке нет. Память уже сделана правильно: порты `src/ports/memory.ts`, фабрики `src/application/memory/create-*-tools.ts`, гейтинг `resolveMemoryTools` по `AgentDefinition.memory`.
3. **Мёртвые заделы переносимости.** `filterSkills`/`formatSkillsCatalog` экспортируются и не вызываются; `projectForWindow` реализован в pin/semantic-портах без вызовов; allowlist `agent.skills` ни где не применяется.

Существовавшие ранее «файловые» инструкции (`.studio/*`, session ritual) вынесены из хостового блока в запись агента (Jarvis, 2026-09-06) — хост не учит агента вести проект, это текст самой записи.

## Решения

1. **CapabilityPack — атом переносимости**: инструменты + фрагмент системного промпта + скиллы + требуемые порты, версионируемый. Включённая пачка добавляет и толы, и текст; выключенная не добавляет ничего.
2. **Сборка системного промпта — только библиотека.** Хост кладёт в `prompts.main.instructions` текст агента как есть. Итоговый system собирается в рантайме: identity-блок → фрагменты включённых пачек (детерминированный порядок) → текст агента. `DEFAULT_AGENT_SYSTEM` и `composeAgentSystem` из студии удаляются, их секции раскладываются по пачкам.
3. **Пачки plan/scheduler/webhook/threads — в библиотеку** за портами `PlanPort`/`SchedulerPort`/`WebhookPort`/`ThreadsPort`, по образцу памяти. Описания и схемы инструментов переезжают дословно. `thread_list` — пачка `threads`, `scheduler` объявляет `dependsOn: ['threads']`.
4. **Память — те же пачки без слома API.** `AgentMemoryConfig` остаётся источником включения для pin/semantic/episodic/knowledge; их фабрики и фрагменты оформляются как встроенные пачки. Новый общий механизм `AgentDefinition.capabilities` — для plan/scheduler/webhook/threads и будущих пачек.
5. **Расширение — два уровня, один документ-контракт.** Data-плагины (SKILL.md, MCP-конфиг; формат совместим с Claude plugin/Agent Skills) и code-пачки (`defineCapability`, TS-модуль). Реестр/marketplace, hooks/monitors-аналоги, динамическая загрузка code-пачек — вне скоупа.
6. **Compaction — вне скоупа.** Потребление `agent.compaction` в библиотеке отсутствует; ждём референс-проект от хозяина.

## Модель пачки

`packages/harnesys/src/domain/capability.ts`:

```ts
export type CapabilityScope = {
  workspaceId: string;
  agentId: string;
  threadId: string;
};

export type CapabilityConfig = { spec?: Record<string, unknown> };

export type CapabilityPackContext<Ports> = {
  ports: Ports;
  resolveScope: () => CapabilityScope;
  config: CapabilityConfig;
};

export type CapabilityPack<Ports = Record<string, unknown>> = {
  name: string;                      // 'plan', 'scheduler', 'pin-memory'
  version: string;                   // семвер; текст фрагмента привязан к версии
  description: string;               // для каталога/UI
  requires?: string[];               // имена портов, которые обязан дать хост
  dependsOn?: string[];              // имена других пачек
  tools: (ctx: CapabilityPackContext<Ports>) => ToolDefinition[];
  prompt?: (ctx: CapabilityPackContext<Ports>) => string;   // фрагмент системного промпта
  notes?: (ctx: CapabilityPackContext<Ports>) => LlmNoteProvider;  // активный план и т.п.
};

export type CapabilityRegistration<Ports = Record<string, unknown>> = {
  pack: CapabilityPack<Ports>;
  ports: Ports;
  resolveScope: () => CapabilityScope;
};

export function defineCapability<Ports>(
  pack: CapabilityPack<Ports>,
): CapabilityPack<Ports>;
```

`defineCapability` — единственная точка определения; валидирует name/version/description и возвращает пакет как есть. Точка расширения для сторонних code-пачек — npm-пакет, экспортирующий `CapabilityPack`, хост передаёт его в `createRuntime`.

## Включение в определении агента

`AgentDefinition` получает поле:

```ts
capabilities?: Record<string, CapabilityConfig | null>;
```

Ключ — `pack.name`; запись со `null`/отсутствие ключа — выключено; присутствие — включено, `spec` конфигурирует пачку. Память не дублируется: `memory.pin/semantic/episodic/knowledge` остаются источником включения для четырёх встроенных memory-пачек (мост `memory → capabilities` делает библиотека при резолве, см. «Сборка»).

Пример записи Jarvis: `capabilities: { plan: {}, threads: {}, scheduler: { spec: { maxSchedules: 8 } } }` плюс `memory` как сейчас.

## Сборка (библиотека)

Новый модуль `packages/harnesys/src/application/capabilities/`:

| файл | экспорт |
|---|---|
| `registry.ts` | `resolveCapabilities(def, registrations)` — валидация requires/dependsOn, детерминированный порядок (sort by name), диагностика `unknown_capability`, `capability_port_missing`, `capability_dep_missing` |
| `prompt.ts` | `composeSystemPrompt(def, resolved)` — identity + фрагменты + текст агента |
| `tool-names.ts` | `capabilityToolNames(def, registrations)` — имена толов включённых пачек |

`createRuntime` получает `capabilities?: CapabilityRegistration[]`. Промпт собирается лениво в `runLlmGenerate` (llm.ts): `prompt = composeSystemPrompt(agent, resolvedPacks)` вместо прямого чтения `prompts[promptId].instructions`; `substitutePrompt` (`{$expr}`-слоты) применяется к финальному тексту. Notes-провайдеры пачек добавляются к `opts.notes` на том же месте graph.ts, где сейчас budget/plan notes.

Identity-блок (постоянная библиотеки, версионируется с пакетом) — минимум, не упоминающий конкретные инструменты: роль «ты агент рабочей области», правило «используй только инструменты из списка, не выдумывай XML-вызовы», «конвенции проекта — в AGENTS.md воркспейса, читай перед правкой в дереве». Всё остальное из старого `DEFAULT_AGENT_SYSTEM` раскладывается по пачкам:

| секция DEFAULT_AGENT_SYSTEM | пачка |
|---|---|
| Retrieval: read_file/grep/glob/list_dir | `files` (обёртка над `harnesys/actions` files) |
| Retrieval: fetch | `fetch` |
| Retrieval: knowledge_search/read | `knowledge-memory` |
| Retrieval: recall_search | `episodic-memory` |
| Durable state: pin | `pin-memory` |
| Durable state: memory_write/list/delete | `semantic-memory` |
| Durable state: compaction | вне скоупа (текст переедет в пачку compaction с отдельной спекой) |
| Wake: schedule_*, threadId-семантика, `<schedule>` конверт | `scheduler` |
| Wake: webhook_* | `webhook` |
| Wake: thread_list | `threads` |
| Workspace: git status/diff/log | `shell` |
| Tool calling | identity-блок |

Фрагменты самодостаточны: не ссылаются на текст других пачек; межпачечные связи — только через `dependsOn`. Порядок фрагментов детерминирован (имя пачки, asc) — требование prefix-caching провайдеров; фиксируется тестом-инвариантом при снятии моратория.

## Порты и переезд инструментов

Новые файлы `packages/harnesys/src/ports/`:

- `plan.ts`: `PlanPort { save(scope, input): Promise<PlanSnapshot>; updateItem(scope, input): Promise<PlanItemResult>; get(scope): Promise<PlanSnapshot | null> }` — типы плана (`PlanSnapshot`, `PlanItem`) переезжают из `apps/studio/shared/plan-types.ts` в домен библиотеки.
- `threads.ts`: `ThreadsPort { list(scope): Promise<ThreadSummary[]> }`, `ThreadSummary = { id, name, agentId?, hasSchedule? }`.
- `scheduler.ts`: `SchedulerPort { list, get, peek, create, update, remove }` над `ScheduleRecord` (тип переезжает из `apps/studio/server/domain/schedule.port.ts`; `PermissionMode`/`ScheduleHistory` — в домен).
- `webhook.ts`: `WebhookPort { list, create, update, remove }` над `WebhookRecord`.

Критерий минимальности: `execute()` каждого инструмента выражается 2–3 методами порта; orchestration (UoW, desk-события, cron-калькулятор, очередь fires, чистка attachments при delete) остаётся в студийной реализации порта.

Фабрики инструментов: `packages/harnesys/src/capabilities/plan/create-plan-tools.ts` и т.д. — перенос файлов из `apps/studio/server/application/host-tools/` дословно, замены: `requireHostToolScope()` → `ctx.resolveScope()`, `runHostTool` → библиотечный `runToolGuard` (тот же try/catch), импорты типов — из домена библиотеки. Конверт wake-события (`<schedule name="…">…</schedule>`) — экспорт пачки `scheduler` (`formatScheduleWake`), хост обязан доставлять fire этим текстом; это контракт переносимости.

`active-plan` note-провайдер (`apps/studio/server/application/threads/plan-notes.ts` + `plan-mode-prompt.ts`) переезжает в пачку `plan` (`notes`). `PLAN_MODE_PROMPT` — префикс user-текста, остаётся в студии (это поведение композера, не пачка).

## Studio: сервер

- `composition/studio.ts`: `WorkspaceHarnesysRegistry` получает `capabilityRegistrations`; `wire-host-tools.ts` удаляется вместе с вызовом.
- `adapters/workspace-harnesys.registry.ts`: `prompts: { main: { instructions: agent.instructions } }` без композиции; `createRuntime({ capabilities })`; notes-провайдеры пачек вместо `createPlanNotesProvider`.
- Реализации портов: `adapters/capabilities/sqlite-plan.port.ts`, `sqlite-scheduler.port.ts`, `sqlite-webhook.port.ts`, `sqlite-threads.port.ts` — тонкие обёртки над существующими use case/repo (CreateScheduleUseCase и др. не меняются).
- `adapters/studio-run-targets.adapter.ts`: фильтр реестра по `capabilityToolNames` (заменяет частный `memoryToolNames`).
- Запись: колонка `agents.capabilities_json` (bootstrap + ALTER, образец `budget_json`), `Agent.capabilities` в `domain/agent.port.ts`, repo-mapping, zod в `agent.body.ts`, create/update use cases, `shared/types.ts`.
- Удалить: `shared/default-agent-instructions.ts`, `application/threads/agent-document-from-row.ts` (мёртвый дубль).
- Каталог для UI: `GET /api/workspaces/:id/capabilities` → `{ capabilities: [{ name, version, description, toolNames, requires }] }` из `runtime.capabilities.list()` (новое поле RuntimeHandle).

## Studio: клиент

- `entities/agent`: поле `capabilities` в `Agent`/`AgentDraft`/`AgentPatch`; schema и merge в `features/manage-agent/model/agent-fields.ts`.
- Новый каталог-запрос `workspaceCapabilitiesQuery` в `shared/api/workspaces.ts` (образец `workspaceToolsQuery`).
- Диалог конфигурации: категория `capabilities` в `AGENT_CONFIG_CATEGORIES` (после `instructions`), панель `draft-capabilities-packs.tsx`: чек-лист пачек из каталога хоста, запись в `draft.capabilities`; секции memory/compaction не трогаем (источник включения — `agent.memory`).
- `draft-capabilities.tsx`: убрать спец-фильтр `group.id !== 'memory'` — тул-каталог после переезда сам корректен; tools-allowlist остаётся поверх пачек (механизм графа не меняется).

## Документ-контракт

`docs/capability-packs.md`: модель пачки, два уровня расширения (data: SKILL.md/MCP — формат совместим с Claude plugin manifest `name/version/description/author`; code: `defineCapability`), правила фрагментов (самодостаточность, детерминированный порядок, prefix-cache), критерий минимальности порта, чеклист добавления пачки (порт → фабрика → фрагмент → регистрация у хостов → каталог → UI).

## Риски

- **Раздувание портов.** Границы `SchedulerPort`/`WebhookPort` проверяются на переезде: если execute() не выражается 2–3 методами — границу двигать до кода, не после.
- **Двойственность включения** (`memory` vs `capabilities`) — временная, до спеки compaction; мост только в `resolveCapabilities`, хосты её не видят.
- **Перестановка фрагментов ломает prefix-caching** — порядок по имени зафиксирован в контракте; правка текста пачки = bump версии пачки.
- **Мораторий на тесты** — инварианты (порядок, гейтинг) проверяются вручную на стенде в конце каждого таска; при снятии моратория — первым делом тесты сборки промпта.

## Вне скоупа

Compaction-рантайм и его фрагмент; marketplace/реестр плагинов; hooks/LSP/monitors-аналоги; динамическая загрузка code-пачек из FS; авто-инъекция `projectForWindow` (пин-окно) — отдельная маленькая спека; применение `filterSkills` к allowlist агента — таск в этом плане (пачка `skills`).
