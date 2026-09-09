# Pack system — редизайн инструментов библиотеки

Дата: 2026-09-09. Статус: обновлена после обсуждения ревью (решения зафиксированы в чате).

## Цель

Один механизм расширения вместо двух параллельных (capability packs + поле `tools`). Тулы группируются в паки, паки — единственный способ дать агенту инструменты. Термин Plugin остаётся зарезервированным под будущий формат «скиллы + MCP» (agent-plugins.org) и в этой работе не используется.

Два уровня, которые не смешивать:

1. **Инстанс** (воркспейс) — какие паки зарегистрированы и доступны.
2. **Агент** — какие паки включены (`def.capabilities`) и какие тулы внутри пака явно разрешены.

Регистрация ≠ включение: системные паки регистрируются в инстансе автоматически, но у агента по умолчанию не включён ни один пак и ни один тул. Индивидуальных настроек памяти у агента нет: конфиг памяти живёт в воркспейсе, агенты наследуют его.

## Тип Pack

```ts
// src/domain/pack.ts (замена domain/capability.ts)
export type PackConfig = {
  spec?: Record<string, unknown>;
  tools: string[];            // обязательный явный список имён тулов
};

export type PackSkill = {
  name: string;
  description: string;
  whenToUse?: string;
  body: string;               // markdown, inline-константа, не FS-файл
};

export type Pack<Ports = Record<string, never>> = {
  name: string;
  version: string;
  description: string;
  specSchema?: JsonSchema;    // поля конфига для формы на фронте
  tools: (ports: Ports, spec?: Record<string, unknown>) => ToolDefinition[];
  skills?: PackSkill[];       // скиллы пака, попадают в каталог при включении пака
  notes?: (ports: Ports, spec?: Record<string, unknown>) => LlmNoteProvider;
};

export type PackRegistration = {
  pack: Pack<Record<string, unknown>>;
  ports?: Record<string, unknown>;      // отсутствуют у беспортовых паков
  resolveScope?: () => CapabilityScope; // дефолт — заглушка; хост задаёт per-run
};
```

Поля `prompt` нет: каждое `ToolDefinition.description` несёт полную инструкцию по своему тулу, «как работать с группой» — скилл пака. `requires`/`dependsOn` убраны: присутствие порта проверяется отдельным guard'ом. `configFrom` убран: конфиг всегда приходит из `def.capabilities[name]`. Фабрика получает `spec` без обёртки `PackConfig`: список тулов — забота уровня резолва, паку он не нужен. Spec на каждый тул отдельно не вводится; ручка конкретного тула, если появится, — неймспейс внутри pack `spec`.

## Скиллы паков

Пак несёт скиллы inline-контентом (`PackSkill.body` — строка markdown в коде пака, рядом с тулами: `packs/plan/skill.ts`). Рантайм собирает каталог скиллов агента из двух источников:

- FS-реестр пользователя (`options.skills`), отфильтрованный по `def.skills` — как сейчас;
- скиллы включённых у агента паков — из `Pack.skills`.

Объединённый каталог идёт в skills-notes и резолвится системным тулом `load_skill`. Выключил пак — скиллы пака пропали из каталога. Приоритет имён: FS-скилл с тем же именем выигрывает у паковского; коллизия между паками — warning диагностики.

## Системные тулы

Всегда в реестре любого агента, не тоглятся, на фронте в паках не отображаются:

- `load_tools` — раскрывает deferred-тулы (MCP);
- `load_skill` — резолвит скилл из объединённого каталога;
- `ask_user` — HITL, переносится в `application/tools/ask-user.ts`.

## Регистрация в инстансе

```ts
createRuntime({
  packs: [planPack({ plan: myPort }), myCommunityPack(...)],
  ...
})
```

- Плоский массив фабрик. Системность в типах не выражается; список системных имён — экспорт `SYSTEM_PACK_NAMES: string[]`.
- Библиотека автоматически добавляет системные паки: беспортовые (`files`, `shell`, `fetch`) — как есть; порт-бэковые (`plan`, `threads`, `scheduler`, `webhook`, `agents`, `pin-memory`, `semantic-memory`, `episodic-memory`, `knowledge-memory`) — с InMemory-адаптерами портов, чтобы harness поднимался «из коробки» на время жизни процесса.
- Итоговый массив: сначала хостовые паки, затем системные, чьи имена не заняты (first wins). Хостовая регистрация с тем же именем вытесняет системную. Дубль имени внутри хостового массива — ошибка.
- Интегратор подменяет InMemory своей реализацией порта, добавив в массив пак с тем же именем и своими адаптерами.

Новые InMemory-адаптеры портов в `src/adapters/`: plan, threads, scheduler, webhook, agents-catalog, pin, semantic, episodic, knowledge. Тонкие map-based реализации без персистентности. Для volatile-портов scheduler/webhook — warning диагностики о неперсистентности при первом обращении.

## Определение агента

```ts
// AgentDefinition: умирают поля tools, memory. Остаются:
capabilities?: Record<string, PackConfig | null>;  // null или нет ключа — пак выключен
skills?: string[];                                 // allowlist FS-скиллов
mcpServers?: string[];                             // серверы
mcpTools?: Record<string, string[]>;               // per-tool: нет ключа — все тулы сервера, [] — ни одного
```

`PackConfig.tools` — обязательный явный список. Тулы никогда не включаются неявно. Пустой массив легален (пак включён, тулов нет) — warning `capability_tools_empty`.

Диагностика резолва (все — warning, ран не падает):

- `pack_unknown` — имя из `def.capabilities` не зарегистрировано хостом;
- `pack_port_missing` — порт-пак без порта резолвится как выключенный;
- `tool_unknown` — имя тула из `tools` отсутствует в паке;
- `capability_tools_empty` — пустой `tools`;
- `skill_name_collision` — коллизия имён скиллов паков.

Порядок проверки: guard портов раньше валидации имён тулов (валидация требует stub-инстанцирования фабрики, как сегодня `allCapabilityToolNames`).

## Резолв тулов рана

В ядре (`src/application/`), студийный прунинг из `studio-run-targets.adapter.ts` уходит:

1. База: системные тулы `load_tools`, `load_skill`, `ask_user`.
2. Плюс экземпляры тулов включённых паков, созданные с `spec = def.capabilities[pack].spec`; набор задаёт `PackConfig.tools`.
3. Плюс MCP-тулы воркспейса, отфильтрованные по агенту: `def.mcpServers` (уровень серверов) и `def.mcpTools` (per-tool). `filterToolsForAgent` получает второй фильтр.
4. `node.tools` — явный список паковых тулов ноды (пересечение с реестром). Ключа нет или `[]` = 0 паковых тулов. Системное трио и MCP-тулы этим полем не фильтруются: трио всегда в схемах, MCP — по `mcpServers`/`mcpTools` через deferred.

Видимость: схемы тулов паков и системные выдаются модели сразу. MCP-тулы — deferred (`exposure: 'deferred'`): скрыты до `load_tools`, который принудительно присутствует в наборе, пока есть скрытые. Deferred-фильтр применяется к MCP-подмножеству независимо от `node.tools` (сегодня он работает только при отсутствии ключа — `llm.ts:111-114` правится). Правило `node.tools === undefined → ctx.toolRegistry.keys()` из `llm.ts` и ошибка `tools: []` из `validate.ts` убираются.

Стоковый think несёт явный список: трио + включённые тулы паков. Список ведёт диалог агента (тоглы capabilities дописывают имена в черновик графа); сервер `graph_json` не переписывает.

## Политика видимости тулов

Деление deferred/immediate по источнику размера набора, не per-tool по настроению:

- immediate — курированные наборы: тулы паков (каждый включён тоглом в UI, счёт ограничен) и системная тройка. Схемы в каждом запросе.
- deferred — неконтролируемые источники: MCP-серверы. В запросе — каталог имён и описаний, схема приезжает после `load_tools`.

Зоны запроса (правило для адаптера, `ai-llm-adapter.ts`):

```
[tools]     системная тройка + схемы паков + загруженные load_tools MCP-тулы
[system]    инструкции агента
[messages]  история, append-only
[хвост]     runtime-note отдельным сообщением: budget, каталог deferred, каталог скиллов
```

Хвост уходит последним сообщением, в head-параметр `system` не вливается никогда (сейчас адаптер вливает все `role: 'system'` из массива в `system` — правится). Каталог deferred-тулов и `budgetNote` меняются каждый ход: в хвосте они не ломают префиксный кеш. Схемы паков стабильны внутри рана; кеш перевалидируется трижды за жизнь треда: первый запрос, ход после `load_tools`, ход после компакции.

Гигиена набора: имя тула `<домен>_<глагол>`; `ToolDefinition.description` несёт полную инструкцию (уже правило спеки); схема плоская, обязательные поля помечены; UI предупреждает выше 50 always-тулов, выше 100 блокирует сохранение; каталог deferred ограничен 60 записями / 4000 символами (константы `exposure.ts`); `load_tools` возвращает загруженные имена и ошибки по неизвестным.

## Компакция

Ядро компакции не знает ни про один пак: `runSummaryPassIfDue` читает только `agent.compaction` (`threshold-summary`) — в библиотеке менять нечего, зависимостей от паков там уже нет. Эпизодическая индексация по факту компакции остаётся поведением хоста: `composition/studio.ts` и `compact-thread.use-case.ts` вызывают `episodic.index(...)` после завершённой компакции, конфиг берут из настроек памяти воркспейса. Хуков и подписок на компакцию в ядре нет.

## Память — конфиг на воркспейсе

- `AgentDefinition.memory` и `AgentMemoryConfig` умирают. `defaultAgentMemory()`, `coalesceMemory` умирают. Дефолтов памяти нет: паки выключены, пока пользователь их не включил.
- Настройки Pin / Semantic / Episodic / Knowledge (поля из модалки агента) переезжают в настройки воркспейса. Все агенты наследуют. Переопределение на агента — кандидат на будущее, сейчас не делается.
- Хранение: колонка `workspaces.memory_json` (SQLite, по образцу `capabilities_json`).
- Доставка: хост при сборке определения агента вливает workspace-spec в capabilities memory-паков: `capabilities['pin-memory'] = { spec: workspaceSpec, tools: agentTools }`. `spec` приходит из воркспейса, список `tools` — от агента. Библиотека не меняется.
- `sessionTtl` убирается целиком: из `create-semantic-tools.ts`, `semantic-session-ttl.ts`, HTTP-эндпоинтов semantic, поля `SemanticSection` на фронте.
- Секция project paths в настройках памяти не переносится: `AgentMemoryConfig.project` — мёртвый код, читателей нет.
- Скоуп памяти остаётся per-agent по имени агента (R15).

## MCP

`def.mcpServers` — без изменений. Добавляется `def.mcpTools` для per-tool тоглов в MCP-вкладке модалки агента. Тулы серверов лежат в общем реестре, видимы через deferred + `load_tools`. Поле `mcp` у Pack появится позже, вместе с плагинами.

## БД (studio)

Без миграций: реальных данных нет, агенты пересоздаются.

- JSON-колонка `capabilities` переиспользуется: новые записи `{ spec?, tools: [] }`. Запись без ключа `tools` читается как «пак выключен» — единое правило, без legacy-веток.
- Колонки `tools`, `memory_json` перестают читаться и писаться. Данные остаются лежать.
- `workspaces` получает `memory_json` в `bootstrap.ts`.

## Studio

- `wire-capabilities.ts` → `wire-packs.ts`: фабрики паков с sqlite-портами.
- `studio-run-targets.adapter.ts`: прунинг тулов уходит в ядро; остаются scope, permissions, paths.
- Адаптер LLM (`ai-llm-adapter.ts`): notes уходят хвостовым сообщением, не в head-`system` (см. «Политика видимости тулов»).
- `create-agent` / `update-agent`: уходит склейка `memoryToolNames`; уходит генерация и пересборка графа кодом (`react-preset.ts`, `is-stock-react-graph.ts`, блок rebuild в update-agent). Дефолтный граф — статическая JSON-константа стокового ReAct; список `think.tools` ведёт диалог агента при тогле паков.
- `resolveAgentDefinition` отдаёт `capabilities` как есть, `tools`/`memory` не маппит; для memory-паков вливает workspace-spec.

## Фронт

Вкладка Capabilities (модалка агента):

- блок на пак из `runtime.capabilities.list()` (расширенный: name, version, description, specSchema, тулы с description, наличие скиллов);
- тогл пака; при включении фронт пишет явный `tools` (по умолчанию — все тулы пака отмечены, снимаются individually);
- тоглы каждого тула с `description`;
- форма конфига из `specSchema` → `capabilities[pack].spec`; минимальный рендер: string / number / boolean / enum;
- по умолчанию всё выключено.

Настройки воркспейса: секция Memory (поля Pin / Semantic / Episodic / Knowledge переносятся из модалки агента). У агента вкладка Memory умирает. Вкладка Skills остаётся (FS-скиллы), скиллы паков отображаются в блоке пака read-only. MCP-вкладка: per-tool тоглы внутри выбранных серверов.

## Перенос файлов

Единое место тулов — `src/packs/<name>/`. Таблица переносов (выполняет человек, пути синхронизируются IDE):

| Сейчас | Станет |
|---|---|
| `adapters/actions/fs/read-file.ts` | `packs/files/read-file.ts` |
| `adapters/actions/fs/write-file.ts` | `packs/files/write-file.ts` |
| `adapters/actions/fs/edit-file.ts` | `packs/files/edit-file.ts` |
| `adapters/actions/fs/list-dir.ts` | `packs/files/list-dir.ts` |
| `adapters/actions/terminal/glob.ts` | `packs/files/glob.ts` |
| `adapters/actions/terminal/grep.ts` | `packs/files/grep.ts` |
| `adapters/actions/files.ts`, `files-options.ts` | `packs/files/index.ts` (агрегатор растворяется) |
| `adapters/actions/terminal/shell.ts` | `packs/shell/shell.ts` + `packs/shell/index.ts` |
| `adapters/actions/web/fetch.ts` | `packs/fetch/fetch.ts` + `packs/fetch/index.ts` |
| `adapters/actions/hitl/ask-user.ts` | `application/tools/ask-user.ts` (системный) |
| `application/memory/create-pin-tools.ts` | `packs/memory/pin-tools.ts` + `packs/memory/pin.ts` (pack) |
| `application/memory/create-semantic-tools.ts` | `packs/memory/semantic-tools.ts` + `packs/memory/semantic.ts` |
| `application/memory/create-episodic-tools.ts` | `packs/memory/episodic-tools.ts` + `packs/memory/episodic.ts` |
| `application/memory/create-knowledge-tools.ts` | `packs/memory/knowledge-tools.ts` + `packs/memory/knowledge.ts` |
| `application/memory/resolve-memory-tools.ts` | умирает |
| `application/memory/memory-tool-names.ts` | умирает |
| `application/capabilities/prompt.ts` | умирает (`composeSystemPrompt` вместе с ним) |
| `capabilities/plan/*` | `packs/plan/*` (create-plan-tools.ts → plan-tools.ts, notes.ts отдельно) |
| `capabilities/threads/*` | `packs/threads/*` |
| `capabilities/scheduler/*` | `packs/scheduler/*` |
| `capabilities/webhook/*` | `packs/webhook/*` |
| `capabilities/agents/*` | `packs/agents/*` |
| `capabilities/memory/*` | `packs/memory/*` |
| `capabilities/skills.ts` | умирает; `load_skill` → `application/tools/`, каталог-notes → `application/skills/` как нативная обвязка `options.skills` + скиллов паков |
| `domain/capability.ts` | `domain/pack.ts` (новый тип) |
| `application/capabilities/*` | `application/packs/*` (резолв, каталог) |
| `adapters/actions/index.ts`, субпуть `harnesys/actions` | умирает; новый субпуть `harnesys/packs` → `src/packs/index.ts` |

## Правило границ (ради будущего распила)

`domain/`, `ports/`, `application/` не импортируют конкретные паки — только тип `Pack` и `PackRegistration`. Паки импортируют ядро. Нарушение направления = ошибка ревью. Будущий физический распил на `@harnesys/core` / `@harnesys/packs` становится механическим.

## Вне скоупа

Физический распил пакетов npm; формат Plugin (скиллы + MCP); marketplace; динамическая загрузка паков из FS; переопределение workspace-памяти на уровне агента; миграция данных старых агентов.
