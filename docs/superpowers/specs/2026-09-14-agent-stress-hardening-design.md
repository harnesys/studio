# Closed-world платформа агентов: идентичность, плагины, discovery

Цель владельца: мастер-агент, общаясь с пользователем, сам собирает команду, настраивает workflow и ведёт рой (следом Issues/kanban, полная автоматизация). Фундамент: всё, что агент может, названо в его записи явно; всё остальное недоступно; любая конфигурация наблюдаема одним механизмом; расхождение «stored vs runtime vs UI» конструктивно невозможно.

Стресс-тест (2026-09-14, тред a9ff50f2) показал обратное сегодня: ребёнок живёт реестром/паками/навыками/моделью/бюджетом родителя (`graph-spawn.ts:232-280`), пустые/незаданные списки значат «всё» в definition и «ничего» в нодах (`SKILL.md:12`, `react-preset.ts:44-51`, `sqlite-agents-catalog.port.ts:216-218`), plugin-агенты не несут ни role из документа, ни materialized tools, ни гейта по агенту (`plugin-agents.ts:65-73`, `bind-agents.ts:83-84`), плагины включены «всем, у кого пусто» (`studio-run-targets.adapter.ts:185-198`), map-воркеры заново прогоняют родительский SessionStart-hook-bus на каждый item (`graph.ts:1290-1299`, `executeMap(prepared, {...opts, hooks}, ...)`) — отсюда суперпауэр-хуки «у сабагентов, где их быть не должно» и раздутые ~1.9K-токенные воркеры.

## Решения (зафиксированы с владельцем)

R1. Closed-world для наборов: `tools`, `skills`, `mcpServers`, нодовой `tools`, `enabledPlugins`, `packs` — `undefined | null | []` = ничего. Понятия «все доступные» в конфигурации нет. Инструмент доступен ⇔ назван в `tools` И его поставщик включён (base/pack/MCP); расхождения ловятся диагностиками.
R2. Делегат резолвит свою идентичность; родитель передаёт только ограничения: permissions-intersection, paths, workspace, signal/journal, явную квоту `call.budget`, и пересечение по плагинам (делегату — ∩ с набором создателя).
R3. Скалярные дефолты материализуются на create (`model` от создателя, `budget` {50,ask}/{25,error}) и видны в get; runtime-наследий нет: ребёнок без модели → `model_unresolved`.
R4. Handoff: `returnOnEnd` с unwind на completed; реbind пересобирает всё по идентичности цели.
R5. `memory_write`/`memory_delete` denied в sandbox (session-память — состояние треда).
R6. `created_by` lineage: свои top-level редактируются и удаляются из `agents_update`/`agents_delete` при отсутствии тредов.
R7. `agents_create` и `agents_create_subagent` склеены в один `agents_create` с `delegate?: true`; `agents_update` получает полный набор полей для своих агентов (owner-only только для чужих и плагинных).
R8. Plugin-агенты: `level = delegate`, `source = plugin:<name>`, `role` и `name` — из frontmatter документа (дубли допустимы: имена очеловечиваем сами, у claude имя и есть роль), `description` — из документа; read-only (не редактируются ни тулами, пока что, ни UI).
R9. Единый конвертер claude-compat делает из документа полный internal-объект: алиасы тулов, вывод паков, materialized `tools` в нодах, алиасы моделей, diagnostics вместо молчания.
R10. Новый тул `system_capabilities`: вся полнота authoring-знаний (паки, тулы, скилы, плагины, MCP, permissions, ноды, режимы, модели, бюджеты) из библиотечных каталогов, не из копий в SKILL.md.
R11. Миграция-материализация переводит текущие неявные «всё» в явные списки до флипа семантики; поведение живых агентов не меняется.

Вне скоупа: имена-коллизии делегатов (create запрещает дубликаты, `create-agent.use-case.ts:91`; ambiguous-ветка `agent-target-resolve.ts:34-47` защитная); текст superpowers-хука (вендорный плагин, правка не в репо; после R6-гейтинга он вообще периферийный); override промпта map-воркера (per-node prompts в Studio нет); тег authorAgentId; prompt caching (меряем после §8).

## 1. Резолвер идентичности

`packages/harnesys/src/application/agent-identity.ts`:

```
resolveAgentIdentity(def, host: {
  baseRegistry, packRegistrations, skills, workspaces: mcp/hook/plugin providers,
  deferredPacks?, logger?
}) -> {
  toolRegistry, packOutputs,          // сборка: base → attach своих паков → filter(def.tools/mcp/disallowed) → load_tools, load_skill
  skillsCatalog,                      // fs+pack+plugin-скилы, пропущенные через def.skills и def.enabledPlugins
  hookBindings,                       // плагины из def.enabledPlugins (name order) + agent.hooks
  pluginAgents,                       // каталог агентов включённых плагинов (spawn-видимость)
  diagnostics                         // pack_unknown, tool_unreachable, claude_tool_unmapped, ...
}
```

- `tool_unreachable`: назван в `tools`, поставщика нет (не включён пак/сервер, опечатка) — предупреждение везде, где резолвер зовётся.
- `node_tool_outside_agent`: нода называет инструмент вне `agent.tools` (проверка на `validateStructural`/compile; две прослойки теперь обе явные и не должны расходиться).
- Служебные `load_tools`/`load_skill` регистрируются поверх фильтра; нода, не назвавшая их, их не видит (closed-world довершается на уровне узла).
- Точки вызова (один источник правды): `run-engine-prepare` (обёртка над резолвером вместо `run-engine-prepare.ts:113-141`), `runOneChild` (§5), handoff rebind (§7), `agents_get`/readback (§6), REST `GET /api/agents/:id/effective`, UI-инспектор, `system_capabilities` (§6.3). Кэш на хосте по `agentId+updatedAt` (+ `pluginsFingerprint`).
- `ToolContext.agentId` уже спикер сегмента (`tool-approve.ts:172-183`); паттерн `scope-for.ts` обобщается в `scopeForExec` для всех scope-based паков (memory/plan/threads/scheduler/webhook): делегат видит только свои namespaces (`wire-packs.ts:86-91` больше не лжёт).

## 2. Материализация (миграция, до флипов)

Один guarded-проход в composition после wire паков, маркер `closed_world_materialization_v1`:
- Для каждого агента БД: `tools := ключи реестра по СТАРОЙ сборке`, `skills := все имена каталога воркспейса`, `mcpServers := подключённые серверы`, `enabledPlugins := workspace-набор (effectivePlugins при пустом override)`.
- Для каждого узла `llm:generate` без ключа `tools` в `graph_json`: `tools := [имена реестра агента минус load_tools] + служебные по текущему поведению`.
- `budget` пустым записям: дефолт stock-ReAct (уже пишет create, дописать существующим).
Домашние пресеты/vendor-плагины миграция не трогает: после флипа их пустые списки честно пустые; аудит `~/.harnesys/plugins/*/agents` и shipped `assets/presets` (все четыре пресета: `tools: None`, think без ключа — проверить при апдейте JSON) — шаг C плана. Идемпотентность по маркеру, повторный запуск no-op.

## 3. Флипы closed-world

- `AgentDefinition.tools/skills/mcpServers`: unset/null/[] = пусто; `filterToolsForAgent` (`tool-registry.ts:38-70`): `tools !== undefined` — allowlist из нуля = пустой реестр; `filterSkills` (`skills-catalog.ts:5-35`) аналогично.
- Нода `llm:generate.tools`: unset/null/[] = ни одного у узла; формулировка-SKILL «Omitting the key is not "no tools"» удаляется (инвариант tool-calls остаётся); канонический цикл в спеке — с явным списком.
- `buildReactGraph` (`react-preset.ts:44-51`): think всегда с явным `tools` (материализация дефолтного графа; пустой аргумент = пустой ключ).
- `enabledPlugins`: unset/пусто = ни одного плагина (`studio-run-targets.adapter.ts:185-198` перестает «наследовать всё»); пересечение при create делегата: `child ∩ creator`, top-level через тул: `requested ∩ workspace`.
- Auto-add пака `agents` в create удалён (`create-agents-tools.ts:184-188`): паки называет автор.
- Колоночные `'[]'`-defaults остаются, NULL-различий нет; порт не схлопывает пустое в unset (`sqlite-agents-catalog.port.ts:216-218`).
- Формы Studio: пустой выбор «без ограничений» переименован в «ничего не выбрано = недоступно», draft не пишет `[]` молча.

## 4. Конвертер claude-compat (R9)

Единственная точка: `packages/harnesys/src/application/plugins/bind-agents.ts` (уже `formats/claude-compat.ts` + IR). Контракт `buildEntry`:
- `tools`: claude-имена → `resolveToolAlias` → наши имена; unmapped (`WebSearch`, `NotebookRead`, `KillShell`, `BashOutput`, placeholder-значения `tool-aliases.ts:15-21`) → drop + diagnostic `claude_tool_unmapped`; `TodoWrite → plan_*`, `Task` не биндится (spawn-семантика другая) — фиксировать маппинг в таблице алиасов, не в головах.
- `packs := вывод из маппинга`: каждый смэпленный инструмент даёт required-pack через `Pack.meta.tools` (`domain/pack.ts:20,27-31`) — в definition попадают включённые паки поставщиков; `disallowedTools` из frontmatter остаётся вычитанием.
- `graph`: `standardAgentGraph()` материализует `tools` на think-ноде из definition (после §3 ключ обязателен по смыслу).
- `model` — алиасы (`sonnet|opus|haiku`) через существующий `resolveModel`; нерезолв → diagnostic, не runtime-borrow (R3).
- `maxTurns → budget.maxSteps` (уже есть), без policy — песочная семантика добавит `error` при спавне.
- Row-репрезентация (хост `plugin-agents.ts:65-73`): `name := doc name`, `role := doc name` (R8), `description := doc description`, `level := delegate`, `source: 'plugin:<pluginName>'`, `color` как сейчас.
- diagnostics биндинга видны в `agents_get` плагин-цели и в `system_capabilities(plugins)`.

## 5. Spawn: идентичность ребёнка (R2)

`runOneChild` (`graph-spawn.ts:218-300`): реестр/паки/скилы/notes/хуки — из `resolveAgentIdentity(childDef, host)` (bus ребёнка из его `enabledPlugins`); от родителя — permissions-intersect, paths, artifacts, models, signal, childJournal, env, mergeState, logger, квота `call.budget`; `budget = call.budget ?? def.budget` без родительского fallback; без модели → item `{ error: 'model_unresolved' }`; группа `agents` вырезается (вторая линия, nesting ban); `SubagentStart`-контекст в input остаётся (брифинг).

Map: `workerDef = { ...parent.agent, graph }` — идентичность родителя честная (subgraph родителя), но воркеру НЕ передаётся родительский hooks-bus (`executeMap` вызов с `hooks` убрать): SessionStart — событие сессии родителя, повторный прогон на item — баг (двойная стоимость, лишние subprocess). Notes воркера: providers сегмента; skills catalog по §8.

## 6. Discovery, create/update, system_capabilities

### 6.1 Ростер и get
- `agents_list` = ростер: `{ id, name, role, description?, level: top|delegate, source?, parent?, model?, instructions }`; фильтры `role | name | level | source`; plugin-строки фильтруются на тех же условиях (причина вранья: `sqlite-agents-catalog.port.ts:66-69`); `tools`/`packs` из строк убраны. Description: «roster; configuration: agents_get».
- `agents_get`: `{ ...ростер-поля, stored: { tools, skills, mcpServers, packs, enabledPlugins, model, budget }, effective: (резолвер §1).toolRegistry+skills+mcp+packs, warnings }`; плагинная цель — stored как от конвертера + `readonly: true`. Контракт одной фразой: effective никогда не добавляет к `tools`.
- Plugin-агенты в `enabledPlugins` агента видны в ростере (`source`), в UI-настройках отдельной read-only-секцией сабагентов с бейджем плагина (`agent-subagents-pane.tsx` расширить); редактирования нет ни в UI, ни тулами (owner-гейт их не пускает: ни parentId, ни createdBy).

### 6.2 Create/merge (R7)
- Один `agents_create` с `delegate?: boolean` (true: `parentId := caller`, packs.agents отвергаются, `enabledPlugins ∩` набор создателя; permissions intersection остаётся runtime-инвариантом спавна, не create-магией; false: top-level, `createdBy := caller`). `agents_create_subagent` удалён вместе с упоминаниями (скилл-таблицы, пресеты, клиент) — hard cut, shims нет.
- Поля: name, role, instructions, tools, skills, mcpServers, packs, enabledPlugins, permissions, budget, model, graph. `agents_update` — тот же список для своих (делегат + own top-level по §9); чужие/plugin → отказ с текстом правила; unknown-ключи → `additionalProperties: false` + ошибка на owner-only ключи (`nothing to update` при `graph` больше невозможен, `create-agent-lifecycle-tools.ts:141-143`).
- Результат create и readback update — форма `agents_get` (effective+warnings сразу).
- Delegate без `tools` = чат-воркер; description тула и SKILL проговаривают closed-world, чтобы не было «создал делегата, а он тупой».

### 6.3 system_capabilities
Новый тул пака `agents`: `system_capabilities({ section?: 'all|packs|tools|skills|plugins|mcp|permissions|nodes|budgets|modes|models' })`. Источники: `PackRegistration[].pack.meta` (tools+skills+specSchema паков), base-реестр (описания/группы/operations тулов), skill-реестр воркспейса (fs+pack+plugin, с учётом gating-querying-агента), установленные плагины (+enabled-состояние текущего агента, их агенты/скилы/hooks-события), MCP-подключения (`workspace-harnesys.registry.ts:212-246`), permissions-словарь (`constants.ts:265-272` + `tool-permission.ts`), каталог нод (новый `application/node-catalog.ts`: тип, поля, required, семантика — общий источник для валидатора, тула и SKILL-доков; клиентский `agent-graph-catalog.ts` сойдётся на него следующим шагом), режимы (modePresets хоста), модели (providers/models репозитории), бюджеты (enum policy, дефолты, cycle-правило). Назначение: мастер-агент собирает команду, не угадывая vocabulary из SKILL.md; доки остаются нарративом, machine-truth — этот тул.

## 7. Handoff: returnOnEnd + re-resolve (R4)

- Тул: `returnOnEnd?: boolean` (default false), результат `{ agentId, returnOnEnd? }`; формулировка: без флага передача перманентна, с флагом completed вернёт тред инициатору цепочки.
- Очередь: `STATE_HANDOFF_RETURN_KEY='handoffReturnOnEnd'` (`constants.ts:187`-соседи), consumption/clear как `handoffAgentId` (`graph-agent-controls.ts:130-181`).
- `HandoffNodeSpec.returnOnEnd?: Expr`; эффективный = node || queued.
- Стек `$state.handoffReturnStack: string[]` (снапшот, park/resume-safe): rt-rebind → push прежнего спикера; перманентный rebind → clear. `core:end` перед `run.completed` (`graph.ts:630-659`): непуст → commit `agent.handoff { agentId: stack[0], handoff: true, return: true }` + assistant-note, clear. Failed/budget-stop — без unwind (в спеке явно).
- Хост `persist-handoff-current.ts:17-78` патчит спикера на любое `agent.handoff` — обратное событие проходит; `return: true` — UI-формулировка, отдельным коммитом.
- Rebind пересобирает по идентичности цели (§1): `toolRegistry` (вместо `graph-handoff.ts:110-111`), packOutputs/skills/notes; hook-bindings следующего спикера подменяются в шине рана (PreToolUse и права новой роли, не старой).

## 8. Память, sandbox и промпт-секции (R5)

- `memory_write`, `memory_delete` в `SANDBOX_DENIED_STATE_TOOLS` (`constants.ts:193-203`, отсечка `tool-approve.ts:69-76`); чтения видят namespace ребёнка (§1). Спека L45 теряет ложь «memory is agent-namespaced».
- Capability-секции промпта из фактических возможностей узла (`llm.ts:115-154`): skills catalog только когда `load_skill` в `toolNames` узла; deferred-hints при непустом `progressive.deferredPending` (уже). map-воркер и closing-`llm:generate` (`tools: []`) теряют мёртвый каталог, instructions не режутся. Замер: `model.stats.systemChars/notesChars` (`llm.ts:157-163`) до/после на `map(3)`; prompt caching — возврат только по замерам.

## 9. Lineage своих top-level (R6)

`agents.created_by text REFERENCES agents(id) ON DELETE SET NULL` (guarded ALTER bootstrap, паттерн L273-281), маппинг `Agent`/repo, `createdBy?: string | null` в `AgentCatalogSummary`. `CreateAgentRequest.creatorId`; port create пишет `scope.agentId`, UI — NULL. Владение: `parentId === self || (parentId == null && createdBy === self)` в `resolveOwnedDelegate` (`create-agent-lifecycle-tools.ts:51-53`) и хост-гейтах (`sqlite-agents-catalog.port.ts:126-128,162-165`); тред-гвард остаётся; dangling lineage → только UI.

## 10. Документация и UI (в коммитах соответствующих срезов)

`agent-creator/SKILL.md`: §invariant (omit = none), §Nodes (`returnOnEnd`, tools-ключ), §control:spawn (identity-ребёнка, memory-deny, `model_unresolved`, budget), §handoff L49, §Packs L65-84 (closed-world, `agents_get`, `system_capabilities`, таблица паков = ссылка на machine-source), §Permissions (память), §Budget, §Presets (пустой tools = none). Инструкции `presets/agents/{assistant,orchestrator,coder,researcher}.json`: явные `tools` в записях и think-нодах + handoff-раздел. `workspace-ops/SKILL.md:86-120`. Клиент: `agent-graph-catalog.ts:92,107` (`returnOnEnd`), форма manage-agent (closed-world-подсказки, пустой draft ≠ «всё»), `agent-subagents-pane.tsx` (секция плагинных read-only с бейджем `source`), тумблеры `enabledPlugins` (поле формы уже есть, `agent-config.ts:12`), инспектор effective+warnings из REST.

## 11. Порядок работ

A. `resolveAgentIdentity` как extract старой сборки (без смены поведения) + внедрение в prepare/spawn/handoff/get.
B. Миграция §2 на живой семантике (маркер, idempotent).
C. Флипы §3 + `tool_unreachable`/`node_tool_outside_agent` + конвертер §4 + аудит пресетов/плагинов + правки client-форм.
D. Identity spawn/handoff-rebind §5/§7-bus + memory-deny §8 + scopeForExec.
E. Промпт-секции §8 + removal map-worker bus-refire (замер systemChars).
F. Тулы: merge create (§6.2, hard cut), `agents_get`, ростер, update full-fields + readback + owner-only ошибки, `system_capabilities` + `node-catalog.ts`, REST effective.
G. Lifecycle: `returnOnEnd` (§7), lineage (§9), UI-секции (§6.1/10).

Риски: (1) B до C обязательно, иначе closed-world обесточит стенд; (2) плагинные/домашние определения без списков после C теряют возможности — ожидаемо, аудит в C; (3) child pack materialization — create() на каждый ребёнок, кэш по updatedAt+fingerprint; (4) пересечение плагинов создателя и делегата материализуется в `enabledPlugins` записи ребёнка при create (видно в stored/get), runtime-гейт второй раз не нужен; (5) merge create ломает ссылки в доках/пресетах/клиенте — D1-cascade правка в одном коммите; (6) bus-refire в map и подмена bindings на rebind меняют ран-механику — покрывается прогоном §12 до мержа.

## 12. Приёмка (ручной прогон Studio; автотесты запрещены)

1. Миграция: effective ассистента до B == tools после C (явные списки в записи и think-ноде, `GET /agents/:id/effective` совпадает с `agents_get`).
2. Closed-world: новый агент без `tools` — пустой effective, чат работает; `["read_file"]` без files-пака — `tool_unreachable`; нода без `tools` — ноль у узла; `enabledPlugins` пусто — ни плагинных скилов, ни хуков.
3. Делегат `packs:{files}, tools:["read_file","glob","grep","shell"]` под оркестратором без files — читает файлы (своя идентичность); под родителем `fs.read: deny` — вызов `denied in subagent context`; делегат без модели → `model_unresolved`; `memory_write` → deny, `memory_list` → пусто; skills catalog ребёнка не содержит родительских.
4. Плагины: feature-dev enabled у Assistant, выключен у Orchestrator → у того в ростере `source`-строк нет и `agents_spawn` по plugin-id → unknown; `code-reviewer`: `level=delegate`, `role="code-reviewer"`, `description` из документа, `readonly`, spawn работает, в get — `claude_tool_unmapped` по unmapped-именам; в UI-настройках Assistant — read-only-секция с бейджем.
5. Map(3): ни одного повторного SessionStart-вызова плагина (счётчик скрипта/логи), systemChars воркера без skills-catalog, результат без изменений.
6. Handoff: returnOnEnd=true → completed возвращает спикера инициатору (событие `return:true`, тред GET, UI); без флага — прежнее; chain → возврат на A; перманентный rebind очищает стек; failed — спикер остаётся; после rebind PreToolUse-хуки нового спикера, не старого.
7. Тулы: merge create (`delegate:true/false`), отсутствие `agents_create_subagent` в ростере/доках/пресетах; `agents_list(name=...)` без plugin-строк, фильтр `level`/`source`; readback update с budget; owner-only/unknown-ключи — честные ошибки; `system_capabilities(nodes)` содержит `control:handoff.returnOnEnd`, `system_capabilities(packs)` = machine-таблица.
8. Lineage: Assistant удаляет `TestSpecialist` (04c857e9, треды переведены) — мусор стресс-теста закрыт из инструмента; чужой top-level → `not your delegate`.
9. Прозрачность для мастера: полный цикл «спросил capabilities → создал делегата с packs/tools → получил effective+warnings → заспавнил» проходит без обращения к SKILL.md-угадыванию.
