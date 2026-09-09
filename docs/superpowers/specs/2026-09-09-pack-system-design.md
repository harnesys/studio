# Pack system — редизайн инструментов библиотеки

Дата: 2026-09-09. Статус: черновик на ревью.

## Цель

Один механизм расширения вместо двух параллельных (capability packs + поле `tools`). Тулы группируются в паки, паки — единственный способ дать агенту инструменты. Термин Plugin остаётся зарезервированным под будущий формат «скиллы + MCP» (agent-plugins.org) и в этой работе не используется.

Два уровня, которые не смешивать:

1. **Инстанс** (воркспейс) — какие паки зарегистрированы и доступны.
2. **Агент** — какие паки включены (`def.capabilities`) и какие тулы внутри пака явно разрешены.

Регистрация ≠ включение: системные паки регистрируются в инстансе автоматически, но у агента по умолчанию не включён ни один пак и ни один тул.

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
  tools: (ports: Ports, config: PackConfig) => ToolDefinition[];
  skills?: PackSkill[];       // скиллы пака, попадают в каталог при включении пака
  notes?: (ports: Ports, config: PackConfig) => LlmNoteProvider;
};

export type PackRegistration = {
  pack: Pack<Record<string, unknown>>;
  ports?: Record<string, unknown>;      // отсутствуют у беспортовых паков
  resolveScope?: () => CapabilityScope; // дефолт — заглушка; хост задаёт per-run чтение контекста
};
```

Поля `prompt` в типе нет. Фрагменты системного промпта исчезают: каждое `ToolDefinition.description` несёт полную инструкцию по своему тулу; «как работать с группой» — скилл пака, а не текст в системном промпте.

## Скиллы паков

Проблема: пак умеет работать, но инструкции «как работать с группой тулов» некуда положить без возврата к prompt-фрагментам.

Решение (предложение на ревью): пак несёт скиллы inline-контентом (`PackSkill.body` — строка markdown в коде пака, рядом с тулами: `packs/plan/skill.ts`). Рантайм собирает каталог скиллов агента из двух источников:

- FS-реестр пользователя (`options.skills`), отфильтрованный по `def.skills` — как сейчас;
- скиллы включённых у агента паков — из `Pack.skills`.

Объединённый каталог идёт в skills-notes и резолвится системным тулом `load_skill`. Выключил пак — скиллы пака пропали из каталога. Приоритет имён: FS-скилл с тем же именем выигрывает у паковского; коллизия между паками — warning диагностики.

## Регистрация в инстансе

```ts
createRuntime({
  packs: [planPack({ plan: myPort }), myCommunityPack(...)],
  ...
})
```

- Плоский массив фабрик. Системность в типах не выражается; список системных имён — экспорт `SYSTEM_PACK_NAMES: string[]`.
- Библиотека автоматически добавляет все системные паки в массив до хостовых: беспортовые (`files`, `shell`, `fetch`) — как есть; порт-бэковые (`plan`, `threads`, `scheduler`, `webhook`, `agents`, `pin-memory`, `semantic-memory`, `episodic-memory`, `knowledge-memory`) — с InMemory-адаптерами портов, чтобы harness поднимался «из коробки» на время жизни процесса.
- Дедуп по `pack.name`: хостовая регистрация вытесняет системную (first wins по итоговому массиву — хостовые идут первыми). Дубль имени внутри хостового массива — ошибка.
- Интегратор подменяет InMemory своей реализацией порта, добавив в массив пак с тем же именем и своими адаптерами.

Новые InMemory-адаптеры портов в `src/adapters/`: plan, threads, scheduler, webhook, agents-catalog, pin, semantic, episodic, knowledge. Тонкие map-based реализации без персистентности.

## Определение агента

```ts
// AgentDefinition: умирают поля tools, memory. Остаются:
capabilities?: Record<string, PackConfig | null>;  // null или нет ключа — пак выключен
skills?: string[];
mcpServers?: string[];
```

`PackConfig.tools` — обязательный явный список. Не задавать список нельзя; тулы никогда не включаются неявно. Пустой массив легален (пак включён, тулов нет) — warning `capability_tools_empty`.

Диагностика резолва (все — warning, ран не падает): неизвестное имя пака; имя тула из `tools`, которого нет в паке; пустой `tools`; коллизия имён скиллов паков.

## Резолв тулов рана

В ядре (`src/application/`), студийный прунинг из `studio-run-targets.adapter.ts` уходит:

1. runRegistry = системные тулы (`load_tools`, `ask_user`, `load_skill` при наличии `options.skills`)
2. + MCP-тулы воркспейса, отфильтрованные по `def.mcpServers` (семантика `filterToolsForAgent` без изменений)
3. + экземпляры тулов включённых паков, созданные с `config = def.capabilities[pack]` — `spec` доезжает до `execute()`
4. `node.tools === undefined` → весь runRegistry; явный `node.tools` → пересечение с runRegistry

Системные тулы не тоглятся и на фронте не отображаются. `load_tools`/exposure работают как сейчас поверх runRegistry.

## Независимость компакции

Ядро компакции не знает ни про один пак: хук «при компакции писать эпизод» и чтение `agent.memory` из `compact-thread.use-case.ts` и `episodic-on-compacted.ts` убираются. Если episodic-паку нужны события компакции, он подписывается на них сам через event store (события компакции уже пишутся в ленту) — зависимость направлена от пака к ядру, не наоборот. `sessionTtl` читается из `capabilities['semantic-memory'].spec` внутри тулов semantic-пака, `topK` — аналогично.

## MCP

Без изменений: `def.mcpServers`, `CursorMcpJson`, инструменты серверов в общем реестре, гейтинг по агенту. Поле `mcp` у Pack появится позже, вместе с плагинами.

## БД (studio)

Без деструктивных миграций:

- JSON-колонка `capabilities` переиспользуется: записи приобретают вид `{ spec?, tools: [] }`. Legacy-записи без ключа `tools` (старый формат `{ spec? }` или `{}`) резолвятся как «пак выключен» — правило рантайма, тип `PackConfig` с обязательным `tools` применяется только к записям, которые пишет новый фронт. Пользователь включает тулы вручную в UI.
- Колонки `tools`, `memory` перестают читаться и писаться. Данные в них остаются лежать.

## Studio

- `wire-capabilities.ts` → `wire-packs.ts`: фабрики паков с sqlite-портами.
- `studio-run-targets.adapter.ts`: прунинг тулов уходит в ядро; остаются scope, permissions, paths.
- `create-agent` / `update-agent`: уходит склейка `memoryToolNames`; react-preset строит `think`-ноду без `tools`.
- `resolveAgentDefinition` отдаёт `capabilities` как есть, `tools`/`memory` не маппит.

## Фронт

Вкладка Capabilities:

- блок на пак из `runtime.capabilities.list()` (расширенный: name, version, description, specSchema, тулы с description, наличие скиллов);
- тогл пака; при включении фронт пишет явный `tools` (по умолчанию — все тулы пака отмечены, снимаются individually);
- тоглы каждого тула с `description`;
- форма конфига из `specSchema` → `capabilities[pack].spec`; минимальный рендер: string / number / boolean / enum;
- по умолчанию всё выключено.

Вкладка Memory уходит. Вкладка Skills остаётся (FS-скиллы), скиллы паков отображаются в блоке пака read-only.

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
| `capabilities/plan/*` | `packs/plan/*` (create-plan-tools.ts → plan-tools.ts, notes.ts отдельно) |
| `capabilities/threads/*` | `packs/threads/*` |
| `capabilities/scheduler/*` | `packs/scheduler/*` |
| `capabilities/webhook/*` | `packs/webhook/*` |
| `capabilities/agents/*` | `packs/agents/*` |
| `capabilities/memory/*` | `packs/memory/*` |
| `capabilities/skills.ts` | умирает; `load_skill` + каталог-notes → `application/skills/` как нативная обвязка `options.skills` |
| `domain/capability.ts` | `domain/pack.ts` (новый тип) |
| `application/capabilities/*` | `application/packs/*` (резолв, каталог) |
| `adapters/actions/index.ts`, субпуть `harnesys/actions` | умирает; новый субпуть `harnesys/packs` → `src/packs/index.ts` |

## Правило границ (ради будущего распила)

`domain/`, `ports/`, `application/` не импортируют конкретные паки — только тип `Pack` и `PackRegistration`. Паки импортируют ядро. Нарушение направления = ошибка ревью. Будущий физический распил на `@harnesys/core` / `@harnesys/packs` становится механическим.

## Вне скоупа

Физический распил пакетов npm; формат Plugin (скиллы + MCP); marketplace; динамическая загрузка паков из FS; миграция данных старых агентов.
