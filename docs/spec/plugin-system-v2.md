# Plugin system v2: IR, адаптеры форматов, hook-подсистема

Статус: согласовано с хозяином репозитория 2026-09-12; правки по ревью от 2026-09-12.
Опора — код (`packages/harnesys`, `apps/studio`) и живые спецификации форматов; старые
документы не используются. Осознанные упрощения против Claude/AP и правила их допуска
собирает `PLUGIN-V2-GAPS.md` в корне.

## 0. Цель и принципы

Полноценная нативная поддержка двух форматов плагинов: **Agent Plugins 1.0.0**
(agent-plugins.org, spec published) и **Claude-compat** (code.claude.com
plugins-reference). Маркетплейс отображает формат явно. Плагин не «мешок файлов
с хардкод-разбором», а поставщик типизированных компонентов в единую внутреннюю
модель.

Принципы:

1. Формат — атрибут, не ветвление. После разбора в IR ни один потребитель не
   спрашивает `sourceFormat`.
2. Ноль тихих потерь. Каждый компонент плагина ∈ {native, inert(reason),
   blocked_by_grant, dropped(diagnostics)}. Карточка плагина показывает все четыре.
3. Grant-класс проверяется один раз в binder; ран-движок не знает про доверие.
4. Совместимость с каталогом: Superpowers (Claude-compat, `hooks/hooks.json`
   SessionStart, `${CLAUDE_PLUGIN_ROOT}`) проходит без правки исходников.
5. Плагин — декларативный пакет. Исполняемый JS-код плагина в систему не
   попадает (в отличие от паков библиотеки, у паков другой контракт).

## 1. Plugin IR и валидация

### 1.1 Модель (`packages/harnesys/src/domain/plugin.ts`)

Тип `Plugin` заменяется на `PluginIr`:

```ts
type PluginIr = {
  identity: PluginIdentity;          // name, displayName?, version?, description?, author?, license?, keywords?, homepage?, repository?
  sourceFormat: 'agent-plugins' | 'claude-compat';
  declaredSchema?: string;           // значение $schema из манифеста
  components: PluginComponent[];
  grants: PluginGrants;              // { needsProcess, needsNetwork }: что плагин декларирует, вывод из components
  diagnostics: PluginDiagnostic[];
};

type PluginComponent = {
  kind: PluginKind;
  spec: unknown;                     // типизирован per-kind ниже
  source: { file: string; pointer: string }; // плагин-относительный путь + якорь
  status: 'native' | 'inert' | 'blocked_by_grant' | 'dropped';
  inertReason?: string;
};

type PluginKind =
  | 'skill' | 'command' | 'agent' | 'hook' | 'mcp-server' | 'lsp-server'
  | 'monitor' | 'path-entry' | 'setting-default' | 'config-option'
  | 'theme' | 'workflow' | 'channel' | 'output-style' | 'eval';
```

Инертные kinds (`theme`, `workflow`, `channel`, `output-style`, `eval`) парсятся и
валидируются, но не исполняются; `inertReason` обязателен. Состояние «молча
потерян» отсутствует: ошибка разбора = `dropped` с diagnostic (код, путь, текст).

### 1.2 Валидация

- Канонические JSON-схемы лежат копиями в `packages/harnesys/src/application/plugins/schemas/`
  (AP `plugin.schema.json`, AP `mcp.schema.json` версии 1.0.0 с указанием source URL
  в шапке файла; Claude manifest schema из json.schemastore.org). Fetch схемы
  во время загрузки плагина запрещён (AP §5.2 MUST NOT).
- `$schema` выбирает валидатор и версию AP. Неизвестный AP-`$schema` = отказ плагина
  с diagnostic `unsupported_schema_version`.
- Ajv (уже в зависимостях) со `strict: false`. Правила, которые схемы не выражают,
  в отдельном чекере `plugin-conformance.ts`: имя плагина (AP §5.5), containment
  путей (AP §4.1: `./`-префикс, resolved-путь внутри plugin root, symlink-политика),
  уровни отказа. Три уровня по AP §4.1: reject plugin / invalidate component type /
  skip entry. Непонятный top-level = «report and ignore» (AP §5.2), не отказ.
- Claude-манифест открыт: неизвестные поля = warning (`unknown_manifest_field`, как
  `claude plugin validate`), неверный тип известного поля = фатал (`invalid_manifest`).
  Ошибки `additionalProperties` от вендоренной schemastore-схемы понижаются до warning
  независимо от содержимого схемы; версия схемы фиксируется в шапке файла
  (`x-vendored-from`).

### 1.3 Адаптеры форматов

`application/plugins/formats/agent-plugins.ts` и `formats/claude-compat.ts`.
Общий контракт адаптера: `detect(listing) -> layout`, `parse(root, pluginData) -> PluginIr`.

- AP: root `plugin.json` (закрытый манифест), `skills/*/SKILL.md`, `mcp.json`,
  reverse-domain extensions: `extensions` в манифесте и/или top-level директория
  `com.harnesys.studio/` (AP §8). Наш namespace остаётся домом хуков/мониторов/
  агентов/команд для AP-плагинов, fallback-чтение из корневых `hooks/`, `agents/`,
  `commands/` сохраняется. Fallback — осознанное отклонение от AP §8.2 (клиентские
  файлы должны жить в namespace-директории): совместимость с AP-плагинами,
  выпущенными до v2; зафиксировано в `PLUGIN-V2-GAPS.md`.
- Claude: `.claude-plugin/plugin.json` (открытый манифест), path-override'ы
  компонентов (`skills` дополняет дефолт, `commands`/`agents`/`hooks`/`mcpServers`/
  `lspServers`/`outputStyles`/`workflows` заменяют или inline-объекты),
  `.mcp.json`, `.lsp.json`, `hooks/hooks.json`, `monitors/monitors.json` и
  `experimental.monitors` (inline-массив или строка-путь на нестандартный файл),
  `settings.json`, `bin/`, `themes/`, root `SKILL.md` = одиночный скилл,
  `userConfig`, `dependencies`, `defaultEnabled`, `experimental.*`,
  плоские `commands/*.md`.
- Оба адаптера понимают обе MCP-конвенции пути (`mcp.json` AP / `.mcp.json` Claude),
  приоритет — у формат-родного.
- `parseClaudePluginManifestJson` больше не подставляет AP-`$schema` и не гоняет
  Claude-манифест через закрытый AP-парсер (нынешняя потеря полей устраняется).

## 2. Хуки как домен

### 2.1 Contract (`packages/harnesys/src/domain/hook.ts`)

Событие — именованное сообщение с payload: `session_id`, `run_id`, `agent_id`,
`thread_id`, `cwd`, `permission_mode`, плюс per-event поля (tool-события:
`tool_name`, `tool_input`, `tool_use_id`; compact: `trigger`; subagent: `agent_type`
с namespacing `plugin:name`; PostToolBatch: `tool_results`; model-call:
`model: {provider, model}`, `usage: {steps, tokens, cost?}`; node-события:
`node: {id, type}`).

Ответ-эффект (union): `block(reason)`, `context(text)`, `updateInput(newInput)`,
`updateOutput(newOutput)`, `ask(reason)`, `stop(reason)`, void. Блокировка
UserPromptSubmit выражается эффектом `block` (паритет Claude); `stop` валиден
только на `Stop`/`SubagentStop`.

Claude-оболочка совместимости для `command`-handler'ов: JSON на stdin;
stdout-JSON читается на любом exit code. Поля вывода: `continue`, `stopReason`,
`systemMessage`, `decision: "block"` + `reason`, `hookSpecificOutput` с обязательным
`hookEventName`: `permissionDecision` (`allow`/`deny`/`ask`; `defer` игнорируется),
`updatedInput` (заменяет объект целиком), `additionalContext`, `updatedToolOutput`.
`watchPaths` и `sessionTitle` игнорируются с warning-диагностикой;
`initialUserMessage` не поддерживается. Строковые значения вывода обрезаются
до 10 000 символов. Exit 2 = `block`: причина из JSON-decision, иначе текст stderr.
Прочие коды: при валидном JSON исход решает только JSON, без JSON — non-fatal
diagnostic и продолжение.

Формат stdin = Claude-контур, не внутренний payload: обязательные
`hook_event_name`, `session_id`, `cwd`, `permission_mode`. Поля, которых у нас нет,
в stdin не пишутся: `transcript_path`, `prompt_id`, `scratchpad_dir`. Внутренний
`HookPayload` дописывает `run_id`/`agent_id`/`thread_id` теми же именами.
Маппинг внутренних полей на поля stdin:

| HookPayload | stdin | События |
|---|---|---|
| `message` | `prompt` | UserPromptSubmit |
| `tool_name`, `tool_input`, `tool_use_id` | те же | tool-события |
| `tool_output` | `tool_response` | PostToolUse |
| `failure_reason` | `error` | PostToolUseFailure |
| `notification` | `message`, `notification_type` | Notification |
| `source` | `source` | SessionStart |
| `agent_type` | `agent_type` | Subagent* |

### 2.2 Handler'ы

```ts
type HookHandler =
  | { type: 'command'; command: string; args?: string[]; timeoutS?: number; async?: boolean; env?: Record<string, string> }
  | { type: 'http'; url: string; headers?: Record<string, string>; timeoutS?: number }
  | { type: 'mcp_tool'; server: string; tool: string; input?: Record<string, string> } // ${dotted.path} подстановка из payload
  | { type: 'prompt'; prompt: string; model?: string; timeoutS?: number }
  | { type: 'agent'; prompt: string; model?: string; timeoutS?: number } // inert до hook-verifier рантайма
  | { type: 'inline'; fn: (payload: HookPayload) => HookEffect[] | void | Promise<HookEffect[] | void> }; // host-код, парсерами не производится
```

Поле `if` (permission-rule на отдельном handler'е) в v1 нет: матчинг события и
инструмента полностью покрыт `matcher`, permission-правила вычисляются
подсистемой permissions (поле вернётся вместе с hook-тип `agent`).

`command`: argv-form (`args` задан → прямой spawn, без шелла; `args` нет → одна
строка разбирается токеном+аргументами с поддержкой кавычек; shell-конструкции
`|`, `&&`, `$VAR`, globs — `invalid_command_form`; `bash -lc` не используется).
Плейсхолдеры: `${CLAUDE_PLUGIN_ROOT}` = `${PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`
= `${PLUGIN_DATA}`, `${CLAUDE_PROJECT_DIR}`; env процесса: `PLUGIN_ROOT`,
`PLUGIN_DATA`, `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_PROJECT_DIR`,
`HARNESSYS_PLUGIN_OPTION_<KEY>`, `CLAUDE_EFFORT`.
`http`: POST payload, ответ = тот же JSON-контракт. `mcp_tool`: server плагина
адресуется `plugin:<name>:<server>`; значения `input` поддерживают подстановку
`${dotted.path}` из payload (например `${tool_input.file_path}`). `prompt`:
однопроходная LLM-проверка; плейсхолдер `$ARGUMENTS` подставляет JSON payload
(без `$ARGUMENTS` payload дописывается в конец промпта), ответ — JSON
`{ok: boolean, reason?, impossible?}`, `reason` обязателен при `ok: false`.
`agent`: инертный слот `inertReason: 'needs_verifier_runtime'`. `mcp_tool`
пропускается на SessionStart до готовности MCP-клиентов (как Claude). Env
`HARNESSYS_PLUGIN_OPTION_<KEY>` экспортирует все опции, включая sensitive;
monitor-процессы переменных опций не получают (паритет Claude).

`inline`: вызов в процессе хоста без спавна, сериализации и grant-класса.
Инвариант: парсеры манифестов хендлер `inline` не производят никогда,
биндинги с ним конструирует только composition хоста (`origin: 'host'`).
Назначение: observability (трейсинг/метрики на `Post*`-событиях с `usage`
в payload) и guard'ы хоста (`block` на `PreModelCall`).

Процесс-менеджмент `command`-хендлеров. Все пути завершения идут через один
исполнитель, норма без исключений:

1. Порождение: `Bun.spawn` с `detached: true`. На POSIX дочерний процесс
   становится лидером собственной группы процессов (`pid == pgid`), потомки
   наследуют группу. Адресуемая единица убийства: ветка целиком, не только
   головной процесс.
2. Пути завершения с групповым убийством `kill(-pid, SIGKILL)` (при `ESRCH`
   фолбэк `kill(pid, SIGKILL)`): истечение `timeoutS`; abort по сигналу
   AbortController emit'а при победившем `block`; `RuntimeHandle.close()`.
   Самостоятельный выход процесса: ничего не убивается.
3. Reap обязателен на всех путях: `await proc.exited` в `finally`. Спавн без
   ожидания `exited` запрещён, это единственная защита от зомби.
4. Подписка на `AbortSignal` снимается по завершении emit: повторные эмиты
   не накапливают листенеры.
5. Stdin закрывается после записи payload: хук, зависший на чтении stdin,
   не пережимает таймаут.
6. `async: true`: процессы регистрируются в реестре шины при старте;
   `close()` группово убивает их из реестра до emit `SessionEnd`, затем
   дренируется deferred-очередь.
7. stdout/stderr, накопленные к моменту убийства, включаются в diagnostic
   `hook_timeout`/`hook_failed`: автор плагина видит вывод умершего процесса.

Граница средства: намеренный `setsid` покидает процесс-группу. Это не утечка
исполнителя: произвольный код уже одобрен grant-классом `process`, намеренный
побег закрывается sandbox-решением из `PLUGIN-V2-GAPS.md` (`command`-source),
а не исполнителем. Group-kill закрывает класс осиротевших потомков хука,
умершего по таймауту или abort: тест-раннеры, dev-серверы, пайплайны.

### 2.3 Карта событий Claude → точки движка

Нативные (швы в ран-движке):

| Claude event | Точка в Harnesys |
|---|---|
| `SessionStart` (startup/resume/clear/compact/fork) | старт рана; compact-источник — compaction-пайплайн; источник ставит session/run-контекст |
| `SessionEnd` | закрытие сессии |
| `UserPromptSubmit` | вход user-текста в ран, до модели |
| `PreToolUse` / `PostToolUse` / `PostToolUseFailure` / `PostToolBatch` | `application/tool-call.ts` (single + batch) |
| `Stop` | завершение Graph-рана агентом |
| `SubagentStart` / `SubagentStop` | `control:spawn` (`graph-spawn.ts`) |
| `PreCompact` / `PostCompact` | compaction |
| `Notification` | `HookBus.emitNotification` (единый вход для мониторов и хост-уведомлений; доменной шины событий для хуков нет) |
| `PermissionRequest` | `application/tool-permission.ts` (before ask) |
| `FileChanged` | matchers по путям (watcher поверх workspace path, subject = `file_path`) |
| `PreModelCall` / `PostModelCall` | `runLlmGenerate` (`application/llm.ts`), единственный шов вызова модели; payload: `model`, на Post также `usage` |
| `NodeStart` / `NodeEnd` | цикл диспетчеризации узлов `startGraph` (`application/graph.ts`) |

Нет аналога в движке → diagnostic `event_unsupported` при enable (не при install).
18 событий:
`Setup`, `PermissionDenied`, `UserPromptExpansion`, `MessageDisplay`, `TeammateIdle`, `TaskCreated`,
`TaskCompleted`, `WorktreeCreate`, `WorktreeRemove`, `ConfigChange`, `CwdChanged`,
`DirectoryAdded`, `InstructionsLoaded`, `StopFailure`, `PreModelSwitch`,
`PostModelSwitch`, `Elicitation`, `ElicitationResult`.
Итого 15 нативных + 18 неподдерживаемых = 33 события Claude-контракта.
Плюс 4 события Harnesys-namespace: `PreModelCall`, `PostModelCall`,
`NodeStart`, `NodeEnd` (не входят в Claude-контракт, имеют нативные швы,
биндятся как обычные события; Claude-плагины их не называют, Harnesys-native
плагины могут). `NATIVE_HOOK_EVENTS` = 19.

Matchers — семантика Claude:
`*`/пусто/omitted = все; `[A-Za-z0-9_,- |]` = точное или список через `|`/`,`;
иначе regex без якорей. Matcher match: имя инструмента (tool-события), источник
события (SessionStart), agent type (Subagent*, namespacing), `file_path`
(FileChanged), имя модели (`PreModelCall`/`PostModelCall`), тип узла
(`NodeStart`/`NodeEnd`). Для MCP-инструментов subject — scoped-имя:
`mcp__plugin_<plugin>_<server>__<tool>` у плагинных серверов,
`mcp__<server>__<tool>` у хостовых; матчёр по голому ключу сервера плагина
не совпадает никогда (паритет Claude). Матчёры SessionEnd (reason) и Notification
(тип уведомления) в v1 игнорируются — отклонение от Claude, поля в payload не
заводятся. FileChanged: сегменты матчёра (split по `|`) — литеральные имена
файлов, фильтр по basename поверх существующего workspace-watcher; отклонение
от Claude (там матчёр регистрирует watch) зафиксировано в `PLUGIN-V2-GAPS.md`.

### 2.4 Сборка и приоритеты

`HookBus` собирается на старт рана из:

1. workspace-плагины: hook-компоненты IR, отфильтрованные по grant-классам и
   enabled-множеству;
2. агентные биндинги: `AgentDefinition.hooks: HooksBinding[]`,
   `{ event, matcher?, handler, when?: 'agent' | 'mode' }` — настраивается из
   модалки агента.

Обработчики одного события исполняются параллельно, свёртка результатов
детерминирована: эффекты применяются не по завершении, а по фиксированному
порядку binding'ов (плагины по имени, затем agent bindings, затем host-inline
`origin: 'host'`): `block` любого
участника блокирует событие, `context` конкатенируются в этом же порядке,
`update_input`/`update_output` — первый в порядке binding'ов, не первый
завершившийся. Таймауты по умолчанию Claude: 600s command/http/mcp_tool, 30s
prompt, 30s UserPromptSubmit; хост понижает SessionStart до 30s константой
(`PLUGIN_SESSION_START_HOOK_TIMEOUT_MS`), чтобы старт рана не зависел на 10 минут
против нынешних 10s `PLUGIN_HOOK_TIMEOUT_MS`. `async: true` — без блокировки
ран-цикла; deferred-эффекты (`context`/`systemMessage`) складываются в очередь
HookBus и дрейнятся session loop перед следующим обращением к модели. Ошибка/
таймаут/невалидный JSON = non-fatal diagnostic + продолжение (AP §11.3).
`context` от SessionStart доставляется через notes-порт (`RunTarget.notes`),
от UserPromptSubmit — префикс-блоком в user-сообщение. При отмене или закрытии
ран HookBus группово убивает незавершённые хук-процессы, включая async из
реестра (норма §2.2), и дренирует deferred-очередь до emit `SessionEnd`. Понижение SessionStart до 30s — хост-политика (у Claude
событие остаётся на 600s).

`domain/middleware.ts` и необращаемый `middleware` из RuntimeContext удаляются:
их роль берёт HookBus: guard-точки `PreModelCall`/`PreToolUse` (deny = `block`,
ask остаётся HITL движка), наблюдение на `Post*`/`NodeEnd` (правила D1–D5).

## 3. Binder: компоненты в нативные примитивы

| kind | Привязка |
|---|---|
| skill | `prefixSkillRegistry` (`plugin:skill`), как сейчас |
| command | skill `plugin:slug` (плоский md = skill без `name`/`paths`) |
| agent | запись каталога агентов `plugin:agent` → `AgentDefinition`: frontmatter `description` → описание каталога; `model`/`effort` → `AgentModelRef` (`model`-строка резолвится против моделей хоста, не резолвится → dropped); тело md → `prompts.main.instructions`; `tools` → `AgentDefinition.tools`; `disallowedTools` → вычитание из ран-реестра; `skills` → `AgentDefinition.skills`; `maxTurns` → `budget.maxSteps`; `background`/`memory` → dropped с diagnostic `unsupported_frontmatter_field` (в модели агента нет носителя); `graph` строится стандартным `start → llm:generate → end`; `isolation` → diagnostic `unsupported_isolation`; hooks/mcpServers/permissionMode в plugin-агентах запрещены (паритет Claude) |
| mcp-server | `mergePluginMcpFragments` + per-server approval; transport `stdio`/`streamable-http`/`sse`; containment AP §7.2.1; `${user_config.*}` разрешён |
| lsp-server | `StudioLspAdapter`; поля `command, args, transport, env, initializationOptions, settings, workspaceFolder, startupTimeout, shutdownTimeout, restartOnCrash, maxRestarts, diagnostics, extensionToLanguage` |
| monitor | `schedulerCapability` + `ScheduleFireQueue`: job живёт пока активен тред/ран плагина; stdout-строки → `Notification`-события; `when: 'always' | 'on-skill-invoke:<name>'`; не персистентен между рестартами сервера |
| path-entry (bin/) | `RunTarget.binDirs` (единственный носитель, per-run): `create-runtime.ts` компонирует PATH рана (binDirs преппендятся к process PATH), shell-раннер получает готовый env; поле в `ports/run-targets.ts` |
| setting-default | оверлей в `spec` пака: `PackMeta.hasSettings` уже есть; плагинные дефолты под явными настройками агента |
| config-option (userConfig) | несensitive-значения: хранилище `pluginOptions[pluginId]` (Studio); схема `{type,title,description,sensitive,required,default,multiple,min,max}`; подстановка `${user_config.KEY}`: exec-контексты (argv-хуки, MCP/LSP) в биндере, контент скиллов/агентов (без sensitive) в `bind-skill`/`bind-agent`; sensitive → порт `SecretStore` (macOS Keychain-адаптер в Studio; размер значения ограничивает адаптер, ориентир Claude ~2 КБ), при недоступности порта — отказ сохранять значение с diagnostic, в SQLite sensitive не пишется; monitor/http headers — reject при парсе |
| dependencies | install-time резолвер: `string | {name, version?, marketplace?}`; ranges `~ ^ >= =`; авто-enable каскад; запрет disable/remove при живом dependant |
| theme/workflow/channel/output-style/eval | инертные слоты, `inertReason`, в матрице UI |

## 4. Trust-классы, пермит-ворота, per-agent слой

`GrantClass = 'content' | 'process' | 'network'`.

- content: skills, commands, agents, setting-default, userConfig-схема, hooks(prompt).
- process: hooks(command), mcp(stdio), lsp, monitors, bin(path-entry),
  hooks(mcp_tool) — класс наследуется от адресуемого сервера.
- network: hooks(http), mcp(streamable-http/sse) с внешним url.

`hooks(inline)` grant-класса не имеет: биндинги `origin: 'host'` не проходят
grant-фильтр binder'а (код хоста доверен по определению), парсеры манифестов
этот тип хендлера не производят.

Запись доверия: `grants: Partial<Record<GrantClass, boolean>>` на плагин ×
workspace. Хранение (Studio): JSON-карта на записи плагина
`{ workspaceId: classes }` по образцу `enabled_workspace_ids`. Approvals
host-wide: таблица `(plugin_name, server_id)`, подтверждение действует на все
workspace. Миграция старого `trusted: true` → все три класса, `false` → пусто.
Колонка `trusted` и поле `PluginInstallRecord.trusted` удаляются физической
миграцией таблицы (паттерн rebuild из bootstrap, `sqlite_master.sql`-проверка),
осиротевших колонок не остаётся. Ворота — в binder на сборке рана и регистрации
серверов; непрошедший компонент: статус `blocked_by_grant`, виден в карточке.
`blocked_by_grant` не пишется в кэш разбора: кэш IR хранит parse-статусы
(native/inert/dropped), blocked вычисляется при каждом workspace-load. Инвариант:
в закэшированном IR `status` компонента никогда не равен `blocked_by_grant`;
мутировать кэш на месте запрещено.
Per-server approval для process: новый stdio-сервер у уже grants-доверенного
плагина требует одноразового подтверждения (защита от апдейта с новым сервером);
 enforcement — в реестре composition при merge MCP-фрагментов (Studio),
не прошедший сервер помечается `needs_server_approval` и не стартует. В матрице
UI показывается в blocked-семействе с причиной `needs_server_approval`; пятый
статус не вводится.

Per-agent: `AgentDefinition.enabledPlugins?: Record<PluginName, boolean>`
(undefined = наследовать workspace-набор), поверх существующих allowlist'ов
`skills`/`mcpServers`. Эффективная сборка:
`(workspace enabled ∩ agent enabled) → grant-фильтр → allowlist-фильтр → HookBus/skills/registries`.

API Studio:

- `PUT /workspaces/:id/plugins/:name/grants` `{ classes: GrantClass[] }`
- `POST /plugins/:name/approvals` `{ serverId }` (per-server, host-wide)
- `PUT /workspaces/:id/plugins/:name/options` `{ key, value }` (userConfig)
- переходный `POST /plugins/:name/trust`: не вводится; существующий роут, поле
  `trust` в install-request и `TrustPluginUseCase` удаляются в итерации
  внедрения грантов (миграция `trusted → grants` идемпотентна на старте,
  отдельных записей для перехода нет).

## 5. Маркетплейс, install, UI

**Формат:** layout-детект после checkout materialize, кэш в
`PluginInstallRecord.format: 'agent-plugins' | 'claude-compat' | 'unknown'`
(unknown = автодетект без манифеста, в discovery помечен «неаттестован»).
`CatalogEntry` получает `format?` и `inertComponents?: PluginKind[]` из кэша
last-load IR.

**Install-флоу:** checkout (git/url/npm/archive в `~/.harnesys/plugins/<name>`) →
detect layout → schema-валидация → conformance-чекер → парс в IR → merge
marketplace-entry при `strict === false` (entry = полное определение) →
resolve dependencies → record (format, summary компонентов, grants пусто) →
enable-модалка: состав компонентов, требуемые классы, grant-кнопки. Node-депы:
`bun install --frozen-lockfile --ignore-scripts` при package.json+lockfile,
60s cap, не блокирует загрузку. `PLUGIN_DATA`
(`~/.harnesys/plugins-data/<name>`) персистентна при update.

**Source-типы:** `relative | github | url | git-subdir | archive {url, sha256?}`
(https-only, zip, лимиты 256 MiB) | `npm {package, version?, registry?}`.
`command`-source и `headersHelper` — отказ (исполнение произвольного кода при
разрешении каталога); зафиксированное расхождение с Claude.

**UI:** Installed tab — бейдж формата, capability-матрица (native/inert/blocked/
dropped с причинами), grant-переключатели, userConfig-форма. Discover tab — бейджи
формата + фильтр. Plugin detail drawer — компоненты по kind с `source.file:pointer`.

## 6. Границы: библиотека vs хост

В `packages/harnesys` (SoT): `domain/hook.ts`, `domain/plugin.ts` (IR/kinds/grants),
`schemas/`, `plugin-conformance.ts`, адаптеры форматов, binder-примитивы, HookBus и
его швы (`tool-call.ts`, `graph-spawn.ts`, compaction, `tool-permission.ts`,
вход/выход рана), `RunTarget.binDirs`, `HooksBinding` и
`enabledPlugins` в `AgentDefinition`.

В Studio (`apps/studio`): SQLite-миграция (format, grants, options, approvals) и
хранение `hooks`/`enabledPlugins` агента (таблица `agents`, repo, порт, shared),
HTTP-контроллеры (grants/approvals/options), UI (settings/plugins pane,
manage-agent модалка), scheduler-привязка monitors, порт и Keychain-адаптер
SecretStore, bun-install кэша, подписка FileChanged на существующем files-watcher.

Библиотека не знает слов «workspace», «SQLite», «Hono». Формат не просачивается
за пределы адаптеров.

## 7. Вне скоупа v1

Handler `agent` и поле `if` у handler'ов; `isolation: worktree`; `command`-source;
`headersHelper`; исполнение themes/workflows/channels/output-styles; глобальные
scopes (user/project) сверх workspace; live-watch каталога плагинов; plugin evals;
OAuth-конфиг remote MCP (client-managed, как в AP); динамический watch-лист
FileChanged (`watchPaths`), `sessionTitle`, `initialUserMessage`. Осознанные
упрощения и путь дожатия до полного паритета — `PLUGIN-V2-GAPS.md` в корне.

## 8. Проверка

Тесты запрещены репозиторными правилами. Верификация каждого этапа: `bun run
typecheck` и `bun run lint` в корне. Ручной прогон стенда — вне ритуала плана,
когда позовёт человек.
