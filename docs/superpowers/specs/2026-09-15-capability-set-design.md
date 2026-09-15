# Capability model: источники, наделение, экспозиция. Единый резолвер способностей агента

Дата: 2026-09-15. Статус: на согласовании. Реализация: `docs/superpowers/plans/2026-09-15-capability-set.md`.

Факт: шесть найденных 14–15 сентября дефектов имеют один корень. Слово «tools» значит в коде три разные вещи (реестр исполняемых определений, грант агенту, показ модели в конкретном ходу), и они перемешаны в одном канале. Агента наделяют инструментами два независимых механизма (`def.tools` allowlist и `def.packs`), они расходятся без контроля:

| # | дефект | где |
|---|---|---|
| B1 | `control:spawn` бросает `codedRunError('spawn_target_missing')` и валит ран (`run.failed`) вместо результата модели | `packages/harnesys/src/application/graph-spawn.ts:169,175` (третий throw, shape, в `parseCalls:122` не целевой), catch ветки в `graph.ts:1220-1228` |
| B2 | тул `agents_spawn` валидирует цели по каталогу с plugin-агентами, нода резолвит по ростеру без них: «тул пропустил → нода упала» структурно гарантировано | `sqlite-agents-catalog.port.ts:66-68` vs `workspace-harnesys.registry.ts:272` (`listAgentRoster`) |
| B3 | plugin-агенты утекают в `agents_list` и в цели спавна агенту, у которого плагин выключен (`enabled_plugins_json={}`) | каталог-порт подмешивает `pluginAgents.list()` без пересечения с агентом; пер-агент `effectivePlugins` есть только для хуков (`studio-run-targets.adapter.ts:186`) |
| B4 | `agents_list` показывает `packs: []` агентам с включёнными capabilities | `toAgentDefinition` каталог-порта кладёт маппинг в поле `capabilities`, инструмент читает `def.packs` (`create-agents-tools.ts:~110`); в `dbAgentDefinition` (`workspace-agent-definitions.ts:29`) маппинг `packs` есть |
| B5 | `agents_create`/`update-agent` хранят имена тулов, не покрытые ни одним включённым паком; на ране они молча вырезаются с warning-диагностикой | серверная валидация отсутствует; `client-only` синхронизация allowlist'а (`capability-allowlist.ts`, 833ccdb) |
| B6 | колонка `tools` у живых агентов это материализованный снимок старого open-world реестра (Assistant: колонка `agents.tools` живой БД = 6 имён при 13 включённых паках; в пресете `assistant.json` свои снимки: 42 имени `tools` и 45 `think.tools`, это отдельные данные), сервер не синхронит `tools` при смене capabilities | `closed-world-materialization.ts` + `update-agent.use-case.ts:128-137` (независимые поля) |

Цель: одна модель, в которой «выключено в настройках агента = недоступно ни под какими соусами», «включён источник = доступен весь его функционал», а наследование и сужение прослеживаются по построению. Ограничение рантайма: движение агента не роняет ран, запрет возвращается модели как результат операции.

## 1. Три плоскости (каркас, все следствия из неё)

| плоскость | вопрос | контракт |
|---|---|---|
| **Реестр** | что существует и умеет исполняться | `Map<name, {definition, exposure, source}>` одного рана. Движок исполняет только из него |
| **Грант** | что разрешено агенту | чистая функция `resolveCapabilitySet(def, universe)`. Настройки оперируют источниками, не именами инструментов |
| **Экспозиция** | что модель видит в текущем ходу | свойство показа (`direct` / `deferred` / `loaded`), никогда не меняет грант |

Порядок сборки замкнутыми слоями, каждый только сужает, ни один не добавляет:

```
universe(host)  —  всё, что хост зарегистрировал в этом рантайме
  ∩ агент: включённые источники (паки, плагины) + списки loose-ресурсов (skills, mcpServers)
  − агент: overrides (выключенные свитчем инструменты источника, снятые чекбоксом)
  ∩ режим: сужение (preload-подмножество паков, permission-политика, свои overrides)
  ∩ контекст рана: песочница ребёнка (agents запрещён, интерактив deny)
= эффективный набор рана
```

Закон «выключено = нет» выполняется по построению: элемент попадает в набор исключительно из включённого источника. Закон «включено = доступно» тоже: adding-тула источником не требует пересохранения агентов, потому что набор не хранится списком имён. Allowlist по инструментам нестабилен по существу (любой апдейт источника его ломает), denylist/override стабильны: вычитание переживает добавления.

Терминология фиксируется в доках и UI: **source** (пак, плагин, MCP-сервер, loose-skill, host-код), **grant** (наделение на уровне источника), **override** (вычитание/экспозиция на уровне элемента включённого источника), **exposure** (прямой показ или отложение).

## 2. Пакеты и плагины: один смысл, две доставки

Пак и плагин оба дают агенту связку: инструменты, скилы, MCP-серверы, хуки, сабагенты, notes, path entries. Разница только в способе доставки в процесс (скомпилирован в библиотеке vs загружен из IR с grant-гейтингом). На сборке источник «растворяется»: каждый элемент размечается провенансом (`source: 'pack:files' | 'plugin:feature-dev' | 'mcp:sequential-thinking' | 'host'`). Провенанс метаданные, движок на него не ветвится.

**Core pack.** `ask_user`, `map`, `wait` оформляются обычным паком `core` (`packages/harnesys/src/packs/core/`) с честным `meta.tools` ровно из этих трёх: `packCatalog`/`packTools` (`application/packs/tool-names.ts:36-46`) читают meta, declaring-двойка `load_tools`/`load_skill` разошлась бы с валидацией `disabledTools`. `load_tools`, `load_skill` и CC-алиас `Skill` (`create-runtime.ts:101-107` сегодня добавляет их автоматически) — `CORE_SERVICE_TOOLS`: резолвер добавляет их в набор только при включённом `core` (source `pack:core`), авто-регистрация в движке удаляется. Обязательность пока правило верхнего уровня: валидация хоста (Studio server) отказывает агенту/режиму без `core`; UI показывает чекбокс `core` включённым и неактивным. Снятие флага отключается позже без изменения модели (п.8 Non-goals). `load_tools` остаётся инструментом с движковым хуком: promote пишет в `state` рана (`loadedToolsOf`), но исполняется как обычный тул из набора.

## 3. Данные: смерть allowlist'а (D1-каскад)

`AgentDefinition.tools` (allowlist) удаляется совсем. Точечные запреты: `disallowedTools` (уже есть). Состав источников у каждого агента: `packs` (мапа assignment), `enabledPlugins`, `skills`, `mcpServers`. Каскад удаления:

- библиотека: `domain/agent-definition.ts:67`, `filterToolsForAgent` (становится deny-only), `agent-identity.ts:47` (диагностика `tool_unreachable` меняет смысл, п.5), схемы/тул-описания `agents_create` / `agents_create_subagent` (`create-agents-tools.ts`: параметр `tools` уходит, приходит `packOverrides`), `graph-handoff.ts`/`handoff-target.ts` (tool snapshots), `packs/agents/index.ts`;
- сервер: колонка `agents.tools` (миграция drop, schema `store/sqlite/schema/agents.ts`), `create-agent.use-case.ts` + `update-agent.use-case.ts` (поля `tools` из Request), `agent.body.ts`, `toAgentDefinition`/`dbAgentDefinition`, пресеты `apps/studio/assets/presets/agents/*.json` (перевод tools→capabilities), `closed-world-materialization` (маркер v2: tools больше не материализуются);
- клиент: панели инструментов → read-only превью из explain + свитчеры override (п.6), `shared/src/agent.ts`, draft-хелперы `capability-allowlist.ts`/`draft-capabilities.tsx`;
- скилл-тексты: `apps/studio/assets/skills/agent-creator/SKILL.md` (раздел про tools), инструкции Assistant (`# Subagents`: «spawn by id or unique name» остаётся, «tools» как аргумент create уходит).

Формат assignment расширяется overrides'ами:

```
type PackAssignment = true | PackConfig | PackOverride
type PackOverride = { spec?: Record<string, unknown>; disabledTools?: string[]; exposure?: Record<tool, 'direct'|'deferred'> }
```

Единую литеральную семантику assignment держим одну для всех слоёв: `true | {} | {spec} | PackOverride` = включено, `false | null | отсутствие` = выключено (`packs/registry.ts:77-83` уже так); HTTP-body (`agent.body.ts:48-50` сегодня `{spec}` без `true`), лоадер пресетов (`agent-presets-fs.adapter.ts`, сегодня отвергает булеаны) и текст `agent-creator/SKILL.md:66-68` подгоняются под неё же.

Контракт видимости в графах: `node.tools` на `llm:generate` остаётся, но меняет статус с гранта на сужение: `undefined` = весь набор рана, `[]` = нет тулов (pure decision-ноды, контракт `agent-creator/SKILL.md:12,15`), непустой = подмножество (валидация ⊆ набора рана уже есть, `check.ts:33-46`). Пустые `[]` из пресетов не удаляются.

`disabledTools` валидируются против выходного множества источника (вычесть нельзя то, чего источник не даёт, ошибка валидации на запись). `exposure` override: по умолчанию значение берётся из объявления тула (`ToolDefinition.exposure`); агент/режим могут перевести `direct ↔ deferred` в обе стороны только внутри эффективного набора. Для плагинов per-tool overrides нет: plugin-агент сам по себе источник-целиком, его «инструменты» это алиасы хост-паков (`bind-agents.ts:40-41,94`), отдельной группы `plugin:<name>` в тул-реестре не существует; гейтинг плагина работает на уровне источника (subagents, hooks, skills, plugin MCP серверы как `mcp:`-группы в `def.mcpServers`).

## 4. Единый резолвер и единственный шов в хосте

Библиотека экспортирует чистую относительно аргументов функцию (расширение `resolveAgentIdentity`, `packages/harnesys/src/application/agent-identity.ts`). Порты/scope паков уже внутри `registrations: PackRegistration[]`; `pack.create()` в хост-контексте без рана вызывается под `runInHostToolScope` (прецедент `closed-world-materialization.ts:60`), HTTP-пути валидации идут под существующим `requireHostToolScope`:

```
resolveCapabilitySet(def: AgentDefinition, universe: CapabilityUniverse): CapabilitySet

type CapabilityUniverse = {
  registrations: PackRegistration[]   // порты/scope внутри
  baseRegistry: Map<string, ToolDefinition>  // host-инструменты; минус CORE_SERVICE_TOOLS
  roster: AgentRosterEntry[]          // записи с plugin?: string (один источник subagents)
  fsSkills?: SkillRegistry
  makeLoadTools / makeLoadSkill       // фабрики сервисов для core-гранта
  mode?: ModeCapabilityFields         // map-форма packs + disabledTools/exposure
}
type CapabilitySet = {
  registry: RunRegistry,              // Map<name, {def, exposure, source}> — кладётся в RunTarget.capabilitySet
  packOutputs: PackRunMap,            // выходы create() без второго вызова
  skills, mcpServers, hooks, notes, pathEntries,
  subagents: AgentRosterEntry[],      // делегаты, топы, агенты включённых плагинов
  explain: ExplainEntry[],            // кем дан, кем срезан, почему deferred
  fatal: string[]                     // ошибки конфигурации — ответ хосту, не throw
}
```

Все перечислители и проверщики Studio вызывают ТОЛЬКО её (один composition-root шов, `wire-runtime.ts:96-98`):

- `RunTarget` (сегодня `StudioRunTargets.resolve`),
- `SqliteAgentsCatalogPort.list/get`: per-agent фильтр plugin-каталога по `enabledPlugins` scope-агента (пересечение по образцу `effectivePlugins` из `studio-run-targets.adapter.ts:186`, helper переезжает в общий модуль), плюс B4: `packs` заполняется маппингом `normalizeAgentPacks(capabilities)`,
- ростер спавна/handoff: `AgentsResolve.list/resolve` получают parent-деф рана (`GraphOpts.agent` его уже несёт), `listAgentRoster` как отдельная сборка списка удаляется,
- `agents_list` вывод: `tools` = имена из `registry` (preview), `packs` = assignment-карта, `level/plugin` как сейчас,
- инспектор: `GET /api/agents/:id/capabilities` (объясняет effective set по explain; используется и клиентской панелью превью).

Кэш effective-набора — опциональная оптимизация, корректность от неё не зависит: `resolveCapabilitySet` чистая, Studio пересобирает набор на каждый `resolve()` ран-таргета и на каждый каталожный вызов. Ключ `(agentId, workspaceId, modeId, configRevision)` с bump-инвалидацией вводится отдельной задачей только при измеренной необходимости. Расхождение B2 невозможно: тул-fail-fast и нода зовут одну функцию с одними входами.

## 5. Движок: контракт минимальный

Движок (`run-engine`, `graph`) видит: набор рана (`RunTarget.toolRegistry` с exposure-флагами) и новый `RunTarget.capabilitySet` (prebuilt-выход резолвера: `toolRegistry` собирается из него, `packOutputs`/universe едут с ним; `run-engine-prepare` при наличии `capabilitySet` пропускает legacy-сборку через `resolveAgentIdentity`), модель, граф, journal. Понятий «пак», «плагин», «delegate» у движка нет; `deferredPacks`-опция (`CreateRuntimeOptions.deferredPacks`, `RunTarget.deferredPacks`, `RunTargetOpts`, `RunEngineDeps`, `session.ts`, `pack-run.ts`, `create-runtime.ts`, `agent-identity.ts`, `run-engine-prepare.ts`) удалена: экспозиция прилетает флагами в наборе, `resolveProgressiveTools` (`application/tools/exposure.ts`) читает флаги. Замок `load_tools` фактически уже есть (каталог и promote читают реестр рана, `llm.ts:137-144`, `create-load-tools-tool.ts` `registry.get`), после перехода реестра на `RunToolEntry` замок остаётся по построению; поведение `load_tools` для direct-имён сохраняется (`{loaded, unknown}`), описание не врёт. `createLoadToolsTool` принимает набор рана. Реестры детей (`graph-spawn.ts:244`, `graph-handoff.ts:110`, oneshot `create-runtime.ts:173,216`, сегменты `run-engine-prepare.ts:120,126`) = `resolveCapabilitySet(childDef, sandbox(universe))`, `filterToolsForAgent(parent.toolRegistry, childDef)` уходит; песочница (запрет `agents`-пака и интерактива) — отдельный слой той же функции (п.7.4).

Сценарии контракта (проверка сценариями):

- S1 минимальный хост: `createRuntime({tools:[a,b,c]})`, def без `packs`; universe = реестр хоста, effective = весь universe (хост сам решил). Ни одного понятия о паках в коде хоста.
- S2 Studio: composition-root считает `resolveCapabilitySet` на каждый ран и на каждый «показать/перечислить».
- S3 MCP-only: сервер источник; грант `mcpServers`; override по п.3 неприменим (серверные тулы не паки), exposure по умолчанию `direct`.
- S4 делегирование: parent создаёт child; сервер валидирует child-sources ⊆ effective-set создателя до записи (п.7).
- S5 экономный режим: большой пак включён, 28 из 40 инструментов `deferred`, `load_tools` достает из набора; грант-решений в цепочке нет.

## 6. Ошибки операций всегда результат, ран живёт

Библиотека фиксирует правило: отказ агентской операции не поднимает исключение до уровня рана.

| операция | отказ | куда |
|---|---|---|
| `agents_spawn` (tool) | unknown/ambiguous/недоступная цель | `{error, available}` как tool result (уже есть fail-fast, источник тот же резолвер) |
| `control:spawn` (нода) | цель исчезла mid-run (конфиг поменяли) | per-call `{agentId, error}` в `SpawnResultItem`, остальные дети идут, ран продолжается |
| ребёнок спавна упал (fatal ребёнка) | модель-провайдер, бюджет | родитель получает результат-отчёт с `error`, свой ран не теряет |
| `agents_handoff` | цель недоступна/не топ-агент | tool result с перечнем разрешённых целей, ран остаётся текущему агенту |
| тул не в наборе, pack disabled, permission deny | model hallucinated/removed | существующий путь `{error}` без изменений |
| валидация create/update (включая child-сеты) | невалидные assignment | HTTP 4xx / tool `{error}`, не рантайм |

`codedRunError` остаётся для настоящих фаталов: journal/snapshot-целостность, отсутствие модели-провайдера, `run.failed` как terminal-событие сохраняется для них.

## 7. Наследование и правила создания (полный свод правил)

1. Настройка по умолчанию: у нового агента ничего не включено, кроме `core` (обязателен по правилу хоста, п.2). Пресеты несут явные assignment-карты.
2. Делегат (`agents_create_subagent`, parentId): создатель задаёт источники ребёнка; сервер валидирует: `packs ⊆ packs(creator)`, `enabledPlugins ⊆ effective plugins(creator)`, `skills/mcpServers ⊆ аналогично`, `disabledTools` валидны против источников. Нарушение → tool result с перечнем чего не хватает; молчаливого clamping нет.
3. Model: при отсутствии явной наследуется creator-модель (существующее `withInheritedModel` остаётся). Budget: child-call budget > def > parent, без изменений.
4. Ребёнок спавна исполняет собственное наделение плюс контекстное сужение песочницы (agents-пак вырезан, интерактив deny). Ребёнок не видит ни источников родителя, ни чужих источников: у него своё ∩ universe.
5. Режим: сужение. `mode.packs` = preload-подмножество включённых паков агента, свои `disabledTools`/`exposure` overrides того же формата, permissions-политика. Режим не может включить выключенное агенту (проверка на запись).
6. Workspace-слой: вселенная паков (read-only, из бэкенда), установленные/включённые плагины, loose-skill roots, MCP конфиг. Агент ограничен вселенной; выключенное в воркспейсе не появляется ни у кого.

## 8. Non-goals (пока)

- Отключаемый core, частичный core в пресетах.
- Слияние формата паков и плагинов в один IR-механизм.
- Пер-тул allowlist «набор инструментов только для одного агента» как грантинг (заменён override-вычитанием).
- UI массового редактирования capabilities сразу у многих агентов.

## 9. Миграция данных и совместимость

- `schema_meta` маркер `capability_set_v1`: однократно для каждого рабочего агента: `capabilities_json` признаётся источником правды; колонка `tools` удаляется (не конвертируется в overrides: материализованные снимки B6 отражают старый открытый мир, их конверсия урезала бы Assistant'а). Строки с реально намеренным ограничением (ни одного такого в живой базе на 2026-09-15: Assistant, StressProbe) пересоздаются override'ами пользователем через UI.
- Пресеты `apps/studio/assets/presets/agents/*.json`: поле `tools` убрано, вместо него корректные `capabilities`/`enabledPlugins`.
- Wire-контракт `agents_create`/`create_subagent`: `tools` удалён (D6, без shim); новые опциональные `disabledTools`/`exposure` ignored при встрече со старым хостом (ошибки нет).
- Снапшоты живых прогонов (cursor-снимки `tools` в llm-нодах) пересобираются на следующий сегмент из нового набора; явного миграционного кода нет: набор всегда freshly из `resolveCapabilitySet`.
- plugin agents: ID формата `plugin:agent` и имя без префикса остаются; видимость пер-агентная (B3).

## 10. Приёмка (регресс актуальных багов + инварианты)

- R1: агенту с `capabilities={}` и `enabledPlugins={}` (клон StressProbe) недоступен ни один pack-тул: нет в запросе модели, `load_tools` отвечает `{error}`, вызов выдуманного имени инструмента не роняет ран (B1/B5).
- R2: `agents_spawn` на имя plugin-агента выключенного плагина: у тула `{error}` (недоступная цель/список доступных), ран живёт; у включённого плагина: спавн проходит полный цикл (B2/B3).
- R3: `agents_list` Assistant показывает `packs` = все 13 включённых capability, preview `tools` непустой из effective set; у агента без плагинов plugin-строк нет (B3/B4/B6).
- R4: выключить плагин в воркспейсе, bump revision, следующий ран того же треда: ни tools, ни hooks, ни sub-agents плагина в explain (universe сжался).
- R5: include-сценарий S1: чистый хост-библиотеки без паков получает tools'ы из `createRuntime({tools})` без единого упоминания capability-структур.
- R6: child-creation с паком, которого нет у creator'а: `{error}` в tool result, агент-creator жив, child не создан.
- R7: explain любой строки превью-панели указывает source и chain-слой (по построению: один источник ответа).

## 11. Что читается в коде как «правда» после реализации

Единственные места, где принимается решение о доступности: `resolveCapabilitySet` (грант), `resolveProgressiveTools` (показ), `tool-approve`/permissions (политика). Всё остальное потребители. Поиск по `def.tools`/`filterToolsForAgent`/`listAgentRoster` в репо не находит ничего.
