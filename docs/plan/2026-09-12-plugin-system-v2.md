# Plugin system v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** нативная поддержка Agent Plugins 1.0.0 и Claude-compat через единый IR, hook-подсистема уровня domain с полными точками вживления в движок, trust-классы, маркетплейс с бейджами формата.

**Architecture:** форматы разбираются адаптерами в `PluginIr` (типизированные компоненты со статусами native/inert/blocked/dropped); биндер переводит IR в нативные примитивы (skills/MCP/LSP/agents/scheduler/PATH); HookBus собирается на старт рана из плагинных и агентных биндингов, точки — швы `tool-call`/`graph`/`compaction`/`permission`. Спецификация: `docs/spec/plugin-system-v2.md` (читать вместе с планом; где план противоречит — спецификация).

**Tech Stack:** Bun + TypeScript (strict), Ajv (уже в зависимостях), gray-matter (парсинг frontmatter, уже в зависимостях), Hono (Studio API), SQLite bootstrap-паттерн (`apps/studio/server/src/adapters/store/sqlite/bootstrap.ts`), React+react-hook-form+zod (client, FSD).

**Spec:** `docs/spec/plugin-system-v2.md`
**Gaps:** `PLUGIN-V2-GAPS.md` (корень) — осознанные упрощения против Claude/AP и правила их допуска.

## Global Constraints

- Тестовые файлы запрещены (`*.test.ts`/`*.spec.ts`/vitest/playwright). Верификация каждого этапа: `bun run typecheck && bun run lint` в корне репозитория. Ручная браузерная проверка — вне ритуала, по вызову человека.
- Файлы ≤ ~300 строк, резать по ответственности. Типы поля не вытаскивать через `T['field']` — именованные алиасы рядом.
- Библиотека (`packages/harnesys`) ничего не знает про workspace/SQLite/Hono; Studio подстраивается под библиотеку.
- Удаление — каскадное (правила D1–D8): без заглушек, без «не удалено, закомментировано», ре-экспорты править.
- Опора по форматам — только канонические тексты: agent-plugins.org/specification (AP) и code.claude.com/docs/en/plugins-reference (Claude). План цитирует секции AP (§4.1 containment, §5.5 name, §7.2 MCP, §8 extensions, §11.3 non-fatal).
- Упрощение против Claude-контракта допускается, только если переделка позже не ломает публичные типы библиотеки (`PluginIr`, `HookHandler`, `HookBus`, `HookEventName`) и не требует необратимой миграции БД. Список упрощений — `PLUGIN-V2-GAPS.md`.
- Каждый этап заканчивается коммитом с префиксом `feat:`/`refactor:` и областью `plugins`/`hooks`.

## Диагностика: единый реестр кодов

Новый файл `packages/harnesys/src/domain/plugin-diagnostics.ts` (создаётся в Task A2). Канон кодов, все участники используют только их:

```ts
export type PluginDiagnosticCode =
  // манифест/валидация
  | 'unsupported_schema_version' | 'invalid_manifest' | 'unknown_manifest_field'
  // containment/конформанс
  | 'path_escapes_root' | 'invalid_plugin_name' | 'invalid_component_path'
  // компоненты
  | 'invalid_component' | 'inert_component' | 'event_unsupported'
  | 'handler_type_unsupported' | 'unsupported_isolation' | 'unsupported_transport'
  | 'unsupported_frontmatter_field' | 'unresolved_model'
  | 'server_config_invalid' | 'dependency_unsatisfied' | 'dependency_cycle'
  // рантайм/гранты/lsp/hooks
  | 'blocked_by_grant' | 'needs_server_approval' | 'hook_failed' | 'hook_timeout'
  | 'hook_invalid_output' | 'lsp_shadowed' | 'source_unsupported'
  | 'invalid_command_form';
// Для inert-компонентов свободная строка inertReason; стандартное значение
// для hook-типа 'agent': 'needs_verifier_runtime'.
```

---

## Phase A. Domain

### Task A1: Типы hook-подсистемы (`domain/hook.ts`)

**Files:**
- Create: `packages/harnesys/src/domain/hook.ts`
- Modify: `packages/harnesys/index.ts` (корневой баррель пакета: добавить экспорт модуля, экспорты плагинов живут на :50-63)

**Interfaces:**
- Produces (подписи фиксированы, дальше по ним пишут все):

```ts
export type HookEventName =
  | 'SessionStart' | 'SessionEnd' | 'UserPromptSubmit'
  | 'PreToolUse' | 'PostToolUse' | 'PostToolUseFailure' | 'PostToolBatch'
  | 'Stop' | 'SubagentStart' | 'SubagentStop'
  | 'PreCompact' | 'PostCompact' | 'Notification' | 'PermissionRequest'
  | 'PermissionDenied' | 'FileChanged' | 'Setup' | 'UserPromptExpansion' | 'MessageDisplay'
  | 'TeammateIdle' | 'TaskCreated' | 'TaskCompleted' | 'WorktreeCreate'
  | 'WorktreeRemove' | 'ConfigChange' | 'CwdChanged' | 'DirectoryAdded'
  | 'InstructionsLoaded' | 'StopFailure' | 'PreModelSwitch' | 'PostModelSwitch'
  | 'Elicitation' | 'ElicitationResult'
  | 'PreModelCall' | 'PostModelCall' | 'NodeStart' | 'NodeEnd';

export const NATIVE_HOOK_EVENTS: readonly HookEventName[];
export const UNSUPPORTED_HOOK_EVENTS: readonly HookEventName[];
// NATIVE: SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse,
// PostToolUseFailure, PostToolBatch, Stop, SubagentStart, SubagentStop,
// PreCompact, PostCompact, Notification, PermissionRequest, FileChanged,
// PreModelCall, PostModelCall, NodeStart, NodeEnd (19 = 15 Claude + 4 Harnesys).
// UNSUPPORTED: остальные 18 Claude, включая Setup и PermissionDenied.
// PreModelCall/PostModelCall/NodeStart/NodeEnd — Harnesys-namespace, вне
// Claude-контракта, биндятся как нативные.

export type HookPayload = {
  event: HookEventName;
  session_id: string;
  run_id: string;
  agent_id: string;
  thread_id: string;
  cwd: string;
  permission_mode: string;
  source?: 'startup' | 'resume' | 'clear' | 'compact' | 'fork'; // SessionStart
  trigger?: 'manual' | 'auto';                                   // *Compact
  tool_name?: string; tool_input?: unknown; tool_use_id?: string; // tool events
  tool_output?: unknown;                                          // PostToolUse
  failure_reason?: string;                                        // PostToolUseFailure
  tool_results?: unknown[];                                       // PostToolBatch
  agent_type?: string;                                            // Subagent*
  notification?: { type: string; text: string };                  // Notification
  file_path?: string;                                             // FileChanged
  model?: { provider: string; model: string };                    // Pre/PostModelCall
  usage?: { steps: number; tokens: number; cost?: number };       // PostModelCall
  node?: { id: string; type: string };                            // NodeStart/NodeEnd
  message?: string;                                               // UserPromptSubmit; в stdin сериализуется полем `prompt` (спека §2.1)
};

export type HookEffect =
  | { kind: 'block'; reason: string }
  | { kind: 'context'; text: string }
  | { kind: 'update_input'; input: unknown }
  | { kind: 'update_output'; output: unknown }
  | { kind: 'ask'; reason: string }
  | { kind: 'stop'; reason?: string };

export type HookHandler =
  | { type: 'command'; command: string; args?: string[]; timeoutS?: number; async?: boolean; env?: Record<string, string> }
  | { type: 'http'; url: string; headers?: Record<string, string>; timeoutS?: number }
  | { type: 'mcp_tool'; server: string; tool: string; input?: Record<string, string>; timeoutS?: number }
  | { type: 'prompt'; prompt: string; model?: string; timeoutS?: number }
  | { type: 'agent'; prompt: string; model?: string; timeoutS?: number } // inert до hook-verifier рантайма
  | { type: 'inline'; fn: (payload: HookPayload) => HookEffect[] | void | Promise<HookEffect[] | void> }; // host-код; парсеры не производят, origin 'host' без grant-фильтра

export type HookMatcher = { event: HookEventName; matcher?: string };

export type HookBinding = HookMatcher & {
  id: string;                       // плагинные: `${plugin}:${event}:${sha1(canonicalHandlerJson).slice(0,8)}`; агентные: `${agentId}:${event}:${n}`; host: `${source}:${event}:${n}` — стабилен между обновлениями плагина
  origin: 'plugin' | 'agent' | 'host';
  handler: HookHandler;
  vars: { pluginRoot: string; pluginData: string }; // агентные биндинги: обе paths = workspace cwd; host-биндинги vars не читают
};

export type HooksBinding = HookMatcher & {   // то, что лежит в AgentDefinition
  handler: HookHandler;
  when?: 'agent' | 'mode';
};
```

- [ ] Step 1: создать файл с типами и константами выше, JSDoc на каждую группу полей (1-2 строки, не больше)
- [ ] Step 2: экспорт из `packages/harnesys/index.ts` (`export type { HookEventName, ... }`, `export { NATIVE_HOOK_EVENTS, UNSUPPORTED_HOOK_EVENTS }`)
- [ ] Step 3: `bun run typecheck && bun run lint`
- [ ] Step 4: commit `feat(hooks): add hook domain contract`

### Task A2: IR-типы плагина (аддитивно, старое не ломаем)

**Files:**
- Create: `packages/harnesys/src/domain/plugin-ir.ts` (`PluginGrants`, `PluginIdentity`, `PluginIr`, `PluginComponent`, per-kind specs)
- Create: `packages/harnesys/src/domain/plugin-diagnostics.ts` (реестр кодов из раздела выше)
- Modify: `packages/harnesys/index.ts` (экспорт новых типов)

Старый `domain/plugin.ts` и его потребители (`load-plugin.ts`, `session-start-notes.ts`,
`workspace-harnesys.registry.ts`) в этом таске не трогаются: два типа
сосуществуют до B4, где старый удаляется каскадно (переключение потребителей
и удаление — один таск, shim не нужен). Это снимает необходимость
временных приведений формы (`as unknown as` запрещён grit-плагином
`lint/plugins/no-as-unknown-as.grit`).

**Interfaces:**
- Produces:

```ts
// domain/plugin-ir.ts
import type { HookBinding } from './hook.ts';
import type { PluginDiagnostic } from './plugin-diagnostics.ts';
export type PluginIdentity = {
  name: PluginName; displayName?: string; version?: string; description?: string;
  author?: { name?: string; email?: string; url?: string };
  homepage?: string; repository?: string; license?: string; keywords?: string[];
  defaultEnabled?: boolean;
};
export type PluginKind =
  | 'skill' | 'command' | 'agent' | 'hook' | 'mcp-server' | 'lsp-server'
  | 'monitor' | 'path-entry' | 'setting-default' | 'config-option'
  | 'theme' | 'workflow' | 'channel' | 'output-style' | 'eval';
export type InertKind = 'theme' | 'workflow' | 'channel' | 'output-style' | 'eval';
export type ComponentStatus = 'native' | 'inert' | 'blocked_by_grant' | 'dropped';
export type ComponentSource = { file: string; pointer: string };
export type PluginComponent = {
  kind: PluginKind;
  spec: SkillSpec | CommandSpec | AgentSpec | HookSpec | McpServerSpec | LspServerSpec
      | MonitorSpec | PathEntrySpec | SettingDefaultSpec | ConfigOptionSpec | InertSpec;
  source: ComponentSource;
  status: ComponentStatus;
  inertReason?: string;
};
// per-kind specs:
export type SkillSpec = { id: string; name: string; dir: string };
export type CommandSpec = { id: string; name: string; file: string };
export type AgentSpec = {
  id: string; name: string; description?: string; file: string;
  model?: string; effort?: string; maxTurns?: number;
  tools?: string[]; disallowedTools?: string[]; skills?: string[];
  memory?: string; background?: boolean;
};
export type HookSpec = { binding: HookBinding }; // event/matcher уже в binding (HookMatcher)
export type McpServerSpec = {
  serverId: string;
  config: { type: 'stdio'; command: string; args?: string[]; env?: Record<string,string>; cwd?: string }
        | { type: 'streamable-http' | 'sse'; url: string; headers?: Record<string,string> };
};
export type LspServerSpec = {
  serverId: string; command: string; args?: string[];
  transport?: 'stdio' | 'socket'; env?: Record<string,string>;
  initializationOptions?: unknown; settings?: unknown; workspaceFolder?: string;
  startupTimeoutMs?: number; shutdownTimeoutMs?: number;
  restartOnCrash?: boolean; maxRestarts?: number; diagnostics?: boolean;
  extensionToLanguage: Record<string, string>;
};
export type MonitorSpec = { name: string; command: string; description: string; when?: string };
export type PathEntrySpec = { dir: string };
export type SettingDefaultSpec = { key: string; value: unknown };
export type ConfigOptionSpec = {
  key: string; type: 'string' | 'number' | 'boolean' | 'directory' | 'file';
  title: string; description: string; sensitive?: boolean; required?: boolean;
  default?: string | number | boolean; multiple?: boolean; min?: number; max?: number;
};
export type InertSpec = { raw: unknown };
export type PluginGrants = { needsProcess: boolean; needsNetwork: boolean };
export type PluginIr = {
  identity: PluginIdentity;
  sourceFormat: PluginSourceFormat;
  declaredSchema?: string;
  components: PluginComponent[];
  grants: PluginGrants;
  diagnostics: PluginDiagnostic[];
};
// PluginDiagnostic живёт в plugin-diagnostics.ts вместе с кодами:
// { level: 'error' | 'warning'; code: PluginDiagnosticCode; message: string; path?: string }
```

- [ ] Step 1: создать `plugin-diagnostics.ts` (коды + `PluginDiagnostic`), `plugin-ir.ts` по коду выше; именованные type-импорты, inline `import('...')`-типов нет (grit `no-inline-import-type`)
- [ ] Step 2: экспорт новых типов из корневого барреля пакета
- [ ] Step 3: `bun run typecheck && bun run lint` (старый путь не тронут, зелёно без мостов)
- [ ] Step 4: commit `feat(plugins): add plugin IR domain types`

### Task A3: Удаление мёртвой Middleware

Контракт мидлварей переезжает в хуки: `PreModelCall`/`PostModelCall`/
`NodeStart`/`NodeEnd` + `inline`-хендлер (A1, швы C2); отдельной поверхности
расширения не остаётся.

**Files:**
- Delete: `packages/harnesys/src/domain/middleware.ts`
- Modify: `packages/harnesys/index.ts:139` (строка экспорта `GuardDecision, Middleware, MiddlewareContext`)
- Modify: `packages/harnesys/src/ports/create-runtime.ts:8,53` (импорт + поле `middleware?: Middleware[]`)
- Modify: `packages/harnesys/src/application/session.ts:5,28` (импорт + поле `middleware` в RuntimeContext)
- Modify: `packages/harnesys/src/domain/errors.ts:61,68` и `packages/harnesys/src/ports/session.ts:97`, `packages/harnesys/src/application/run-engine-events.ts:228`: удалить литерал `'middleware'` из union'ов `source` (значение никем не создаётся — проверено grep'ом; по D1 мёртвый вариант союза удаляется)
- Проверить: `apps/studio/server/src` на `middleware` (совпадений нет, проверено)

- [ ] Step 1: удаления по списку; `grep -rn "Middleware\|'middleware'" packages/harnesys apps/studio --include='*.ts*' | grep -v node_modules` пуст
- [ ] Step 2: `bun run typecheck && bun run lint` (заодно фиксирует: вызовов middleware в движке действительно нет)
- [ ] Step 3: commit `refactor(hooks): remove dead middleware port`

## Phase B. Валидация и адаптеры форматов

### Task B1: Канонические схемы + vendor-скрипт

**Files:**
- Create: `packages/harnesys/src/application/plugins/schemas/ap-plugin-1.0.0.schema.json`
- Create: `packages/harnesys/src/application/plugins/schemas/ap-mcp-1.0.0.schema.json`
- Create: `packages/harnesys/src/application/plugins/schemas/claude-plugin-manifest.schema.json`
- Create: `scripts/vendor-plugin-schemas.ts` (корневой `scripts/`, рядом с `docs-merge.ts`); в `package.json` script `"vendor:plugin-schemas": "bun run scripts/vendor-plugin-schemas.ts"`
- Modify: `packages/harnesys/package.json` — ничего (Ajv есть); в баррель не экспортируем пути, схемы читаются из fs модулем валидатора

**Interfaces:**
- Produces: `loadSchemas(): { apPlugin, apMcp, claudeManifest }` — в `application/plugins/schema-loader.ts` (создаётся здесь), кэш Map по пути файла; Ajv-экземпляр `ajv.addSchema` один раз.

- [ ] Step 1: скрипт скачивает три схемы по URL и пишет в `schemas/` с полем-аннотацией `x-vendored-from` + `x-vendored-sha256` (хэш канонического содержимого до вставки аннотаций), URL фиксируются константами:
  `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`,
  `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`,
  `https://json.schemastore.org/claude-code-plugin-manifest.json (301 на www.schemastore.org, скачивать с -L и фиксировать финальный URL в x-vendored-from)`. Для claude-схемы: дополнительные поля при валидации трактуются как warning независимо от `additionalProperties` (решение принимает валидатор в B3, не схема)
- [ ] Step 2: `bun run vendor:plugin-schemas` один раз, закоммитить сгенерированные файлы
- [ ] Step 3: `schema-loader.ts`: чтение `import.meta.dir`, Ajv `new Ajv({ strict: false, allErrors: true })`, компиляция трёх валидаторов; экспорт `validateApManifest(v): string[]`, `validateApMcp(v): string[]`, `validateClaudeManifest(v): string[]` — пустой массив = валидно
- [ ] Step 4: `bun run typecheck && bun run lint`; commit `feat(plugins): vendor canonical format schemas`

### Task B2: Conformance-чекер AP

**Files:**
- Create: `packages/harnesys/src/application/plugins/plugin-conformance.ts`

**Interfaces:**
- Produces:

```ts
export type ContainmentLevel = 'reject-plugin' | 'invalidate-component-type' | 'skip-entry' | 'deny-path';
export function assertPluginName(name: string): string[];      // AP §5.5: 1-64, [a-z0-9.-], границы alphanumeric, без -- / .. ; возвращает ошибки (пусто = ок); старый `plugin-name.ts` сливается сюда и удаляется
export function assertInsideRoot(pluginRoot: string, target: string): boolean; // realpath containment, симлинки внутрь корня ок (AP §4.1.3)
export function assertRelativePath(value: string): boolean;    // обязан начинаться с './' (AP §4.1.4)
export function apNameDiagnostics(name: string): PluginDiagnostic[]; // wrapper над assertPluginName, код 'invalid_plugin_name'
```

- [ ] Step 1: реализация по AP §4.1/§5.5; `plugin-path-safety.ts` удалить, импортеров перевести (поискать `grep -rn plugin-path-safety`)
- [ ] Step 2: `bun run typecheck && bun run lint`; commit `feat(plugins): AP conformance checker`

### Task B3: Манифест-адаптеры (аддитивно, старый путь не трогаем)

Старый лоадер (`load-plugin.ts`) до B4 работает через старые parse-функции:
B3 только добавляет новые файлы. Перепись `parse-plugin-manifest.ts`, удаление
`parseClaudePluginManifestJson` и перевод потребителей — в B4.

**Files:**
- Create: `packages/harnesys/src/application/plugins/formats/agent-plugins.ts` (экспорт `detect(listing): 'agent-plugins' | null`, `parseManifest(raw): ManifestResult`: `validateApManifest` + ручной отбор AP-полей; unknown top-level → diagnostic `unknown_manifest_field` + ignore по AP §5.2, НЕ фатал)
- Create: `packages/harnesys/src/application/plugins/formats/claude-compat.ts` (экспорт `detect`, `parseManifest` поверх `parseClaudeManifestFull(raw): { identity, pathOverrides, userConfig, dependencies, experimental, defaultEnabled, diagnostics }` через `validateClaudeManifest`; неизвестные поля — warning `unknown_manifest_field`, как `claude plugin validate`; неверный тип известного поля — фатал `invalid_manifest`; ошибки `additionalProperties` от вендоренной схемы понижаются до warning независимо от содержимого схемы)

**Interfaces:**
- Produces:
```ts
export type ManifestResult = {
  identity: PluginIdentity;
  declaredSchema?: string;
  pathOverrides: Partial<Record<'skills'|'commands'|'agents'|'hooks'|'mcpServers'|'lspServers'|'outputStyles'|'workflows', string | string[] | Record<string, unknown>>>;
  userConfig: ConfigOptionSpec[];
  dependencies: PluginDependency[];
  extensions: Record<string, Record<string, unknown>>;
  diagnostics: PluginDiagnostic[];
};
export type PluginDependency = string | { name: string; version?: string; marketplace?: string };
```
AP-адаптер возвращает `pathOverrides` пустой (манифест закрытый, §5.2), `extensions` из поля `extensions`.

- [ ] Step 1: написать оба адаптера + тестовые фикстуры не пишем (запрет), проверить руками через `bun repl`/одноразовый скрипт в `temp/` (не коммитить)
- [ ] Step 2: `bun run typecheck && bun run lint`; commit `feat(plugins): native manifest parsing per format`

### Task B4: Discovery компонентов, переключение на IR, удаление старого типа

Замыкает сосуществование типов: переключение потребителей
на IR и каскадное удаление старого `Plugin` — один таск, shim не нужен. До этого
таска старый лоадер работает, плагины не ломаются ни на одном коммите.

**Files:**
- Create: `packages/harnesys/src/application/plugins/formats/discover.ts` (общий: обход `skills/` с одним уровнем вложенности AP §7.1; root `SKILL.md` = одиночный skill для Claude; плоские `commands/*.md`)
- Create: `packages/harnesys/src/application/plugins/formats/mcp.ts` (обе конвенции: `mcp.json` AP со строгой `validateApMcp` + variants §7.2.1 (single-token command, cwd-формы, env PLUGIN_ROOT/PLUGIN_DATA запрещены, transport-support skip), `.mcp.json` Claude + `CLAUDE_*`-плейсхолдеры → нормализуются в `McpServerSpec`; `$schema` mismatch с манифестом → MCP-компонент невалиден, остальное живёт, §7.2.2)
- Create: `packages/harnesys/src/application/plugins/formats/hooks.ts` (`hooks.json`/inline: парсить ВСЕ события из `HookEventName`; `NATIVE_HOOK_EVENTS` → `HookBinding` с `origin: 'plugin'`, `vars` = pluginRoot/pluginData; остальные → компонент со status `'dropped'`, code `event_unsupported`; handler'ы: `command` (argv `args` и shell-форму; неизвестные поля-хендлера, включая `if` и `shell`, → ignore + warning diagnostic), `http`, `mcp_tool`, `prompt` → `HookHandler`; `agent` → `status:'inert'`, `inertReason: 'needs_verifier_runtime'`; matcher-структура `{matcher, hooks:[...]}` раскрывается в N биндингов)
- Create: `packages/harnesys/src/application/plugins/formats/agents-commands.ts` (frontmatter по образцу существующего `parseInventoryMarkdown`: `matter(file)`, поля по AgentSpec выше; маппинг на `AgentDefinition` — по таблице спеки §3 (`model`-строка остаётся строкой в `AgentSpec`, резолвер модели — в D1 (E2 прокидывает порт)); `isolation` → diagnostic `unsupported_isolation`; `hooks`/`mcpServers`/`permissionMode` в plugin-agent → `invalid_component`; неизвестные frontmatter-поля → ignore + `unsupported_frontmatter_field`; отсутствующий/unparseable frontmatter: именование по файлу, `plugin:<filebase>` (Claude-паритет: плагинные агенты снисходительны))
- Create: `packages/harnesys/src/application/plugins/formats/extras.ts` (`monitors/monitors.json` + `experimental.monitors` inline → MonitorSpec (запрет `${user_config.` в command → invalid_component с сообщением); `bin/` → path-entry при наличии исполняемых файлов; `settings.json` → setting-default (только ключи `agent`, `subagentStatusLine`, остальное ignore+warning); `themes/`, `output-styles/`, `workflows/`, `channels`, `experimental.evals` → InertSpec с `inertReason`; LSP: `.lsp.json` (Claude) / `lsp.json` + inline `lspServers` (AP), общий парсер в `parse-plugin-lsp.ts` расширяется полнотой LspServerSpec)
- Modify: `packages/harnesys/src/domain/plugin.ts` — удалить `Plugin`,
  `PluginSkillRef`, `PluginMcpServer`, `PluginHookEvent`, `PluginHookCommand`,
  `PluginAgentRef`, `PluginCommandRef`, `PluginLspServer`, `PluginLoadDiagnostic`,
  `PluginManifest`/`PluginAuthor`/`PluginExtensions` (мета живёт в `PluginIdentity`);
  остаются `PluginName`, `PluginSourceFormat`
- Modify: потребителей старых типов (`session-start-notes.ts`,
  `prefixed-skill-registry.ts`, `merge-plugin-runtime.ts`, `parse-plugin-*.ts`,
  студийные `workspace-harnesys.registry.ts`, `plugin-summary.ts`, use-case'ы
  плагинов) — импорты переводятся на IR-spec типы
  (`SkillSpec`/`McpServerSpec`/`LspServerSpec`/`HookSpec`); логика этих файлов
  меняется здесь и в C1/D1/D2
- Delete: `parse-plugin-manifest.ts` и `parseClaudePluginManifestJson`/`detectPluginLayout`
  (замена — `formats/*` из B3); `parseInventoryMarkdown` переезжает
  в `formats/agents-commands.ts`
- Modify: `packages/harnesys/src/application/plugins/load-plugin.ts` — переписать на `loadPluginIrFromDirectory({root, pluginData}): Promise<{ ir: PluginIr; mcpFragment: CursorMcpJson; diagnostics }>`: layout detect → манифест (B3) → discovery (этот таск); экспорт из `harnesys/adapters/node` правится; `discover-plugin-skills.ts` слить в `formats/discover.ts` и удалить; `expand-plugin-vars.ts` остаётся, дополняется `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PLUGIN_DATA}`/`${CLAUDE_PROJECT_DIR}` как синонимами
- Delete: `parse-plugin-mcp.ts` (содержимое переехало в `formats/mcp.ts`), `claude-compat.ts` после переноса hooks/manifest удаляется если пусто (D4: проверить баррели)

**Interfaces:**
- Consumes: `ManifestResult`, specs из A2, conformance из B2.
- Produces: `loadPluginIrFromDirectory`. Потребители — фаза E (Studio): `toPluginSummary` живёт в `apps/studio/server/src/application/plugins/plugin-summary.ts` и переписывается на IR в E1.

- [ ] Step 1: discovery-файлы (порядок внутри таска: discover → mcp → hooks → agents → extras)
- [ ] Step 2: переключение `load-plugin.ts` и потребителей на IR, удаление старого типа и старых parse-функций; grep-инвариант пуст: `grep -rn "PluginLoadDiagnostic\|PluginHookCommand\|PluginSkillRef\|PluginMcpServer\|parseClaudePluginManifestJson" packages apps --include='*.ts'`
- [ ] Step 3: после каждого файла — `bun run typecheck`; в конце `bun run typecheck && bun run lint`
- [ ] Step 4: smoke-прогон без браузера: одноразовый скрипт в `temp/` (не коммитить): загрузить фикстуру Superpowers-like (создать мини-дерево в `temp/fixtures/`: `.claude-plugin/plugin.json`, `skills/x/SKILL.md`, `hooks/hooks.json` SessionStart, `.mcp.json`) и AP-дерево (`plugin.json`, `skills/y/SKILL.md`, `mcp.json` с `$schema`, `com.harnesys.studio/hooks/hooks.json`); убедиться что IR-компоненты и статусы печатаются корректно
- [ ] Step 5: commit `feat(plugins): format adapters, discovery and IR switch`

## Phase C. HookBus и движок

### Task C1: Реестр и исполнители HookBus

**Files:**
- Create: `packages/harnesys/src/application/hooks/bus.ts`
- Create: `packages/harnesys/src/application/hooks/executors.ts` (command argv/http/mcp_tool/prompt/inline)
- Create: `packages/harnesys/src/application/hooks/matchers.ts`
- Create: `packages/harnesys/src/application/hooks/claude-output.ts`
- Modify: `packages/harnesys/index.ts` (экспорт `createHookBus`)

**Interfaces:**
- Produces:

```ts
// bus.ts
export type HookBus = {
  emit(event: HookEventName, payload: HookPayload): Promise<HookOutcome>;
  emitNotification(text: string, type: string): void; // async fire-and-forget для monitor'ов
  drainDeferred(): HookEffect[];   // async-эффекты с прошлого окна; вызывает session loop
  bindings(): HookBinding[];
};
export type HookOutcome = { effects: HookEffect[]; blocked?: HookEffect & { kind: 'block' }; diagnostics: PluginDiagnostic[] };
export function createHookBus(input: { bindings: HookBinding[]; ctx: HookRuntimeCtx }): HookBus;
export type HookRuntimeCtx = {
  cwd: string; projectDir: string; envBase: Record<string,string>;
  mcpToolCall?: (server: string, tool: string, input: Record<string,unknown>) => Promise<unknown>;
  promptModel?: (prompt: string, model?: string) => Promise<string>; // однопроходный вызов, JSON в ответе
};
// matchers.ts
export function matchesBinding(b: HookBinding, payload: HookPayload): boolean;
// executors.ts
export function runHookHandler(h: HookHandler, payload: HookPayload, ctx: HookRuntimeCtx, vars: { pluginRoot: string; pluginData: string; projectDir: string }): Promise<{ effects: HookEffect[]; diagnostics: PluginDiagnostic[] }>;
```

Семантика (реализовать дословно). Исполнение параллельное по всем matches, свёртка
детерминированная по порядку binding'ов (плагины по имени, затем agent bindings,
затем host `origin: 'host'`; inline-хендлер = вызов функции в процессе, без
спавна/сериализации/grant):
`block` любого участника блокирует событие (участники после победившего block всё
равно дожидаться не нужно — abort по AbortController emit); `context` — конкатенация
в порядке binding'ов; `update_input`/`update_output` — первый binding'ов, не первый
завершившийся; `ask` принимается только из `PreToolUse` (иначе игнор);
`stop` — только `Stop`/`SubagentStop` (на остальных событиях игнор); блокировка
UserPromptSubmit — эффектом `block` (паритет Claude). `async: true` не участвует в emit: fire-and-forget, эффекты кладутся в
`bus.deferred`, дрейнит session loop перед следующим обращением к модели
(C2, `session.ts`/run-loop). Таймауты: `timeoutS ?? defaultFor(event, h)`:
30 UserPromptSubmit, 600 остальные command/http/mcp_tool, 30 prompt; хост
понижает SessionStart до 30s отдельной константой. timeout → `hook_timeout`,
не блок (PreToolUse timeout не блокирует — Claude-паритет). `mcp_tool` пропускается
на SessionStart, когда `ctx.mcpToolCall === undefined` (MCP-клиенты не готовы).
command: `args` задан → `Bun.spawn([command, ...argsExpanded])` без шелла; нет →
подстановка плейсхолдеров, затем токенизация одной строки с поддержкой кавычек
(double/single: каноническая форма Claude `"${CLAUDE_PLUGIN_ROOT}"/scripts/x.sh`
проходит); shell-конструкции (`|`, `&&`, `$VAR`, globs) не поддерживаются,
diagnostic `invalid_command_form`; `sh` НЕ вызывается. stdin = Claude-контур
по таблице маппинга спеки §2.1 (`prompt`, `tool_response`, `error`,
`notification_type`...): JSON c
`hook_event_name`, `session_id`, `cwd`, `permission_mode`, внутренними
`run_id`/`agent_id`/`thread_id`; без `transcript_path`/`prompt_id`/
`scratchpad_dir`. Выход: stdout-JSON читается на любом exit code —
`claude-output.ts` маппит JSON
на effects (таблица спеки §2.1); plain stdout только UserPromptSubmit/SessionStart
→ `context`; exit 2 → `block` (reason из JSON decision, иначе stderr); прочие
коды: валидный JSON решает исход, без JSON —
diagnostic `hook_failed`, continue. http: fetch POST (Claude-контур телом),
неверный статус/тело → `hook_failed` non-fatal. mcp_tool: `ctx.mcpToolCall`,
ответ = тот же JSON-контракт.
env процесса хука: envBase + `PLUGIN_ROOT/PLUGIN_DATA/CLAUDE_PLUGIN_ROOT/
CLAUDE_PLUGIN_DATA/CLAUDE_PROJECT_DIR/CLAUDE_EFFORT` + `HARNESSYS_PLUGIN_OPTION_*`
(все опции, включая sensitive; monitor-процессы опций не получают)
+ `env` handler'а.
`matchers.ts`: три режима (`*`/''/undefined = all; `[A-Za-z0-9_,\- |]` = точное/
CSV-pipe-список; иначе `new RegExp(matcher).test(subject)`); subject по таблице:
tool-события → tool_name (MCP-инструменты: `mcp__plugin_<plugin>_<server>__<tool>`
у плагинных серверов, `mcp__<server>__<tool>` у хостовых; матчёр по голому ключу
сервера плагина не совпадает — Claude-паритет), SessionStart → source,
Subagent* → agent_type, *Compact → trigger, FileChanged → file_path,
Pre/PostModelCall → model.model, NodeStart/NodeEnd → node.type.

Процесс-менеджмент command-хендлеров (норматив для `executors.ts`; единственная
точка порождения и убийства процессов, полный текст нормы — спека §2.2):

1. `Bun.spawn` с `detached: true` (POSIX: `pid == pgid`, потомки наследуют
   группу).
2. Таймаут `timeoutS` и abort (emit-AbortController, `close()`) → групповое
   `kill(-pid, SIGKILL)`, при `ESRCH` фолбэк `kill(pid)`; самостоятельный
   выход — без убийства.
3. `await proc.exited` в `finally` на всех путях; спавн без ожидания `exited`
   запрещён (защита от зомби).
4. AbortSignal-подписка снимается по завершении emit.
5. Stdin закрывается после записи payload.
6. `async: true`-процессы регистрируются в реестре шины при старте; `close()`
   берёт их из реестра (C2), групповое убийство до emit `SessionEnd`, затем
   drain deferred.
7. stdout/stderr к моменту убийства включаются в diagnostic
   `hook_timeout`/`hook_failed`.

- [ ] Step 1: matchers, claude-output, executors, bus (внутри — по файлам, после каждого typecheck)
- [ ] Step 2: `bun run typecheck && bun run lint`; commit `feat(hooks): hook bus with matchers and executors`

### Task C2: Швы в ран-движке

**Files:**
- Modify: `packages/harnesys/src/application/tool-approve.ts` (`runSingleToolCall` :53 — единственный общий проход для обычного и approve-путей: emit `PreToolUse` до исполнения (`update_input` подменяет args, `block` → `ToolCallResult{error: reason}` без исполнения), `PostToolUse`/`PostToolUseFailure` по исходу (`update_output` подменяет result)
- Modify: `packages/harnesys/src/application/tool-call.ts` (только `PostToolBatch` в конце `executeToolCall` при batch-ветке; `runOne` не трогается — чекпоинт/HITL-механика остаётся как есть)
- Modify: `packages/harnesys/src/application/llm.ts` (`runLlmGenerate` :103 — единственный шов вызова модели: emit `PreModelCall` до обращения к провайдеру (payload `model`), `PostModelCall` после (`model` + `usage`); `block` на `PreModelCall` → узел получает error-результат без вызова модели)
- Modify: `packages/harnesys/src/application/graph.ts` / `graph-run.ts` (`startGraph`: `UserPromptSubmit` на первом сегменте (message = input text) и `SessionStart` с source по типу входа; финал Graph: `Stop`; `NodeStart`/`NodeEnd` в цикле диспетчеризации узлов :486-819, payload `node: {id, type}`)
- Modify: `packages/harnesys/src/application/graph-spawn.ts` (`SubagentStart` до, `SubagentStop` после; matcher subject = `agent_type` из def-id; `context`-эффект стартового события добавляется в messages ребёнка)
- Modify: compaction (`packages/harnesys/src/application/compaction/*`): `PreCompact` (trigger manual/auto) с правом `block` отменить compact; `PostCompact` после записи
- Modify: `packages/harnesys/src/application/tool-permission.ts` (`PermissionRequest` перед ask-веткой: `allow` effect отсутствует в модели Claude — маппится так: `block` → deny с причиной, `ask` → без изменений (уже ask); результат пермита не мутируется `update_input`)
- Modify: `packages/harnesys/src/ports/create-runtime.ts` (`CreateRuntimeOptions.hooks?: HookBinding[]`) + `packages/harnesys/src/ports/run-targets.ts` (`RunTarget` на :11-27 += `hooks?: HookBinding[]`, `binDirs?: string[]`) + `create-runtime.ts`: сборка `HookBus` на ран (bindings = runtime opts ∪ target.hooks; host-inline биндинги `origin: 'host'` приходят через runtime opts); `RuntimeHandle.close()` — групповое убийство незавершённых хук-процессов из реестра шины, включая async (норматив C1, спека §2.2), drain deferred-очереди, emit `SessionEnd` перед `mcpRegistry.closeAll()`
- Modify: `packages/harnesys/src/application/session.ts`: `context`-эффекты `UserPromptSubmit` инжектятся в user-сообщение префикс-блоком `[hooks]\n...` (как Claude additionalContext); `context` от `SessionStart` пушится в `RunTarget.notes`-массив (notes-порт уже есть, studio-run-targets.adapter.ts:78-87 — тот же канал); перед обращением к модели — `bus.drainDeferred()` и доставка

**Interfaces:** Consumes: `HookBus` из C1, тип `HookBinding`. Все emit-точки пишутся через helper `emitHook(ctx, event, payload)` — no-op при пустом bus (проверка `bus.bindings().length === 0` до сборки payload: горячий путь не платит).

- [ ] Step 1: проброс опций + сборка (create-runtime.ts:54 район)
- [ ] Step 2: tool-call швы; [ ] Step 3: graph/spawn/compact/permission/close швы
- [ ] Step 4: `bun run typecheck && bun run lint`; commit `feat(hooks): wire hook bus into run engine seams`

## Phase D. Binder: IR → примитивы

### Task D1: Skills, commands→skills, agents→каталог, binDirs

**Files:**
- Modify: `packages/harnesys/src/application/plugins/merge-plugin-runtime.ts` (`buildPluginSkillRegistries` переезжает в bind-skills и удаляется отсюда; функция здесь остаётся для MCP, см. D2)
- Modify: `packages/harnesys/src/application/plugins/prefixed-skill-registry.ts` (сигнатура `prefixSkillRegistry(registry, pluginName)` не меняется; источник данных — `SkillSpec[]` вместо старого `PluginSkillRef[]` — тип-алиасы совпали при переключении в B4)
- Create: `packages/harnesys/src/application/plugins/bind-skills.ts` (`bindSkillComponents(ir, readSkillFile): SkillRegistry` — skills + commands (flat md → skill с frontmatter-passthrough); вызывается из Studio registry вместо `buildPluginSkillRegistries`)
- Create: `packages/harnesys/src/application/plugins/bind-agents.ts` (`bindAgentComponents(ir, resolveModel: (ref: string) => AgentModelRef | null): CatalogAgentEntry[]`, `CatalogAgentEntry = { id: string /* plugin:agent */; definition: AgentDefinition }`; маппинг строго по таблице спеки §3: тело md → `prompts.main.instructions`, `graph` = `start → llm:generate → end`, `tools`/`skills` переезжают как есть, `disallowedTools` — вычитание из ран-реестра (`filterToolsForAgent` учитывает запись `CatalogAgentEntry`), `maxTurns` → `budget.maxSteps`, `model` → `resolveModel` (null → component dropped, `unresolved_model`), `memory`/`background` → dropped `unsupported_frontmatter_field`)
- Modify: `packages/harnesys/src/packs/shell/*` + `packages/harnesys/src/ports/create-runtime.ts` (PATH = `RunTarget.binDirs` ++ process PATH, компоновка env при сборке рана в `create-runtime.ts`; поле `RunTarget.binDirs` уже добавлено в C2 — единственный носитель, per-run; shell-раннер читает готовый env)

**Interfaces:** Consumes IR из B4. Produces: `bindSkillComponents`, `bindAgentComponents`, `RunTarget.binDirs`.

- [ ] Steps: по файлам, typecheck после каждого; финальный `bun run typecheck && bun run lint`; commit `feat(plugins): bind skills, agents, bin paths from IR`

### Task D2: MCP/LSP/monitors/setting-defaults/userConfig-плейсхолдеры

**Files:**
- Modify: `packages/harnesys/src/application/plugins/merge-plugin-runtime.ts` (переписать на `McpServerSpec[]`, нормализация в `CursorMcpJson` с env-оверлеями и containment; server-id префиксация `plugin:<name>:<id>` для mcp_tool/hook/адресации)
- Modify: `apps/studio/server/src/adapters/lsp/studio-lsp.adapter.ts` + `create-host.ts:156` (читать `LspServerSpec` со всеми полями; `startupTimeout`/`shutdownTimeout`/`restartOnCrash`/`maxRestarts` → в spawn-retry loop; один сервер на расширение: первый выигрывает, остальные `warning 'lsp_shadowed'`)
- Create: `packages/harnesys/src/application/plugins/bind-monitors.ts` (MonitorSpec → описатель job-спецификации `{ name, command, when, pluginId }`; исполнение на стороне хоста (Studio scheduler) — библиотека только типизирует и валидирует)
- Create: `packages/harnesys/src/application/plugins/user-config.ts` (`substituteUserConfig(value, options: Record<string,string|number|boolean>, sensitiveKeys): string | ConfigError` — exec-контексты (argv-хуки, MCP/LSP); отдельная `substituteUserConfigContent(text, options)` для скиллов/агентов с выбрасыванием sensitive-ключей; вызовы: exec-биндинг в D2, контент — в `bind-skills`/`bind-agents` (D1) через опциональный `options`-аргумент; reject `${user_config.` в http.headers/monitor.command уже в парсере B4)
- Modify: `packages/harnesys/src/application/packs/registry.ts` (setting-default: `applySettingDefaults(spec, defaults)` — дефолты применяются до `specSchema`-валидации, поверх — явные; в `resolveRegs` единственная точка)

- [ ] Steps: merge-plugin-runtime → lsp → user-config → registry defaults → monitors; typecheck по ходу; финальные проверки; commit `feat(plugins): bind mcp, lsp, monitors, user config, setting defaults`

## Phase E. Studio: состав, гранты, ран-цель

### Task E0: Хранение `hooks`/`enabledPlugins` агента (первый таск фазы E)

Без этого таска `agentDef.hooks` из E2 всегда пуст: поля домена не имеют серверного
хранилища.

**Files:**
- Modify: `packages/harnesys/src/domain/agent-definition.ts` (`AgentDefinition` += `hooks?: HooksBinding[]`, `enabledPlugins?: Record<string, boolean>`; перенесено из E2 — без этого поля `resolveAgent` в этом таске не компилируется)
- Modify: `apps/studio/server/src/adapters/store/sqlite/bootstrap.ts` (`agents`: ALTER try/catch — `hooks_json TEXT NOT NULL DEFAULT '[]'`, `enabled_plugins_json TEXT NOT NULL DEFAULT '{}'`)
- Modify: `apps/studio/server/src/adapters/store/sqlite/schema/agents.ts` (колонки drizzle)
- Modify: `apps/studio/server/src/adapters/store/sqlite/repos/sqlite-agent.repo.ts` (сериализация/десериализация по образцу `capabilities_json`)
- Modify: `apps/studio/server/src/domain/agent.port.ts` (`Agent` += `hooks: HooksBinding[]`, `enabledPlugins: Record<string, boolean>`)
- Modify: `apps/studio/server/src/composition/wire-packs.ts`/агентские use-case'ы create/update (проброс полей; zod-схемы create/update в `adapters/http/agents/`)
- Modify: `apps/studio/shared/src/agent.ts` (`AgentRecord`/payload-типы += те же поля)
- Modify: `apps/studio/server/src/adapters/workspace-harnesys.registry.ts:resolveAgent` (`hooks: agent.hooks`, `enabledPlugins: agent.enabledPlugins`)

- [ ] Steps: agent-definition поля → bootstrap → drizzle-schema → repo → порт → use-case'ы → shared → resolveAgent; валидация `HooksBinding` на входе HTTP (zod по union из shared); `bun run typecheck && bun run lint`; commit `feat(plugins): persist agent hooks and enabled plugins`

### Task E1: SQLite: формат, grants, options, approvals + миграция записей

**Files:**
- Modify: `apps/studio/server/src/adapters/store/sqlite/bootstrap.ts` (`plugins`: `ALTER TABLE ... ADD COLUMN` в try/catch по домашнему паттерну :253-263 — `format TEXT`, `ir_summary TEXT` (json), `grants TEXT default '{}'` (json-карта `{ workspaceId: Partial<Record<GrantClass, boolean>> }` — по образцу `enabled_workspace_ids`), `options TEXT default '{}'`; колонка `trusted` удаляется rebuild-паттерном threads.kind (:225-251: проверка `sqlite_master.sql LIKE '%trusted%'` → новая таблица без колонки, copy, rename, drop); новая таблица `plugin_approvals (plugin_name TEXT, server_id TEXT, approved_at TEXT, PRIMARY KEY(plugin_name, server_id))` — approvals host-wide, действуют на все workspace; `schedules`: ALTER try/catch — `metadata TEXT` (носит `kind: 'monitor'` для monitor-джобов E2; колонки в таблице сегодня нет))
- Modify: `apps/studio/server/src/domain/plugin.port.ts` (`PluginInstallRecord` += `format: 'agent-plugins'|'claude-compat'|'unknown'; grants: Record<string, Partial<Record<GrantClass,boolean>>>` (ключ — workspaceId); `options: Record<string, string|number|boolean>`; `trusted` удалить; репозиторий: `setGrants(workspaceId, name, classes)`, `setOption`, `approveServer(name, serverId): void`, `approvals(name): string[]`)
- Modify: `apps/studio/server/src/adapters/store/sqlite/repos/sqlite-plugins.adapter.ts` (колонки + методы)
- Create: `apps/studio/server/src/application/plugins/migrate-trusted.ts` (идемпотентный шаг внутри bootstrap перед rebuild'ом: `trusted===true` → `grants:{content:true,process:true,network:true}`; после успешной миграции колонка `trusted` удаляется rebuild'ом E1)
- Modify: `apps/studio/server/src/application/plugins/remove-plugin.use-case.ts` (при удалении чистить `plugin_approvals` — FK в схеме нет, явный `DELETE FROM plugin_approvals WHERE plugin_name = ?`)

- [ ] Steps: bootstrap → port/adapter → use-cases правки компилируемости (trust-plugin.use-case удаляется, вместо него `set-grants.use-case.ts` (одна операция — один класс, суффикс `.use-case.ts`) и `approve-server.use-case.ts`); `bun run typecheck && bun run lint`; commit `feat(plugins): grants, format and approvals in studio storage`

### Task E2: Runtime-состав: workspace registry + run targets

**Files:**
- Modify: `apps/studio/server/src/adapters/workspace-harnesys.registry.ts` (`loadEnabledPlugins` возвращает `{ record, ir }[]`; кэш IR неизменяем: `blocked_by_grant`/`needs_server_approval` вычисляются на каждом load и в кэш не пишутся; `create()`: skills/mcp из IR-binder; enforcement per-server approval здесь же при merge MCP-фрагментов: stdio-сервер без записи в `plugin_approvals` не включается в `mcp`, помечается `needs_server_approval`; grant-классы фильтруют компоненты по карте спеки §4, включая prompt=content и mcp_tool=класс адресуемого сервера)
- Modify: `apps/studio/server/src/adapters/studio-run-targets.adapter.ts` (сборка `hookBindings = pluginHookBindings(workspace, agent) ∪ agentDef.hooks` в `RunTarget.hooks`; `binDirs` из path-entry компонентов → `RunTarget.binDirs`; `enabledPlugins` gating: эффективный набор = workspace ∩ agent; FileChanged: подписка на существующем `adapters/workspace/files-watcher.adapter.ts` → `bus.emit('FileChanged', {file_path,...})` при активном ране треда; сегменты матчёра (split по `|`) фильтруются по basename, шторм гасится дебаунсом watcher'а)
- Modify: monitors lifecycle: `MonitorJobRegistrar`-порт (`domain/monitor-jobs.port.ts`) + адаптер над `ScheduleFireQueue`/таблицей schedules с metadata `kind: 'monitor'` (колонку добавляет E1); stdout читает сам адаптер (строка → `bus.emitNotification(line, 'monitor:<name>')` через реестр); дерегистрация: `queue.drop(threadId)`/`onThreadIdle(threadId)` при закрытии рана — для этого расширить юнион событий `DeskEventsPort` (`shared/types.ts:331-337`) вариантом run-finish и эмитить его из точки завершения рана (место определить по существующим эмиттерам `DeskEventsPort`), не фоновым таймером
- Modify: `apps/studio/server/src/composition/create-host.ts` (pluginSkills/pluginMcp — IR-версии; `plugin.lspServers` → `LspServerSpec`)
- Modify: плагинные агенты в каталоге: `SqliteAgentsCatalogPort` (wire-packs.ts:112) и `WorkspaceHarnesysRegistry.resolveAgentDefinition` дополнительно ищут id вида `plugin:agent` через `bindAgentComponents`-результат реестра (агент из плагина резолвится так же, как агент из БД; `resolveModel`-колбэк строит Studio над models/providers репозиториями; source-иерархия: кэш IR при `loadEnabledPlugins`)
- Modify: `apps/studio/server/src/adapters/host-tool-scope.ts` если binDirs требует скоупа (смотреть по факту)
- Modify: `packages/harnesys/src/application/packs/...` — НЕ трогать (паки не плагины)

- [ ] Steps: registry → run-targets → monitor port+adapter → DeskEventsPort run-finish → typecheck → lint; commit `feat(plugins): compose grants and hook bindings into runs`

### Task E3: HTTP API

**Files:**
- Create: `apps/studio/server/src/domain/secret-store.port.ts` (`SecretStore = { get(pluginId,key): Promise<string|null>; set(...); delete(...) }` — порт библиотеки не нужен, он хостовый по определению)
- Create: `apps/studio/server/src/adapters/secret-store-macos.adapter.ts` (`security add-generic-password`/`delete-generic-password`, service `com.harnesys.studio.plugins`; недоступен → конструктор бросает, composition решает; лимит значения — константа адаптера, ориентир Claude ~2 КБ, превышение → отказ с diagnostic)
- Modify: `apps/studio/server/src/composition/create-host.ts` (wire SecretStore; при его отсутствии sensitive-опции сохраняются как отказ с diagnostic, в SQLite не пишутся)
- Modify: `apps/studio/server/src/adapters/http/plugins/plugins.controller.ts` (ответы list/summary из IR: `format`, `components[] {kind,status,inertReason,source}`, `grants`, `options` (sensitive-значения маскируются); удалить `/plugins/:name/trust` и поле `trust` из install-route; добавить `PUT /workspaces/:id/plugins/:name/grants`, `POST /plugins/:name/approvals` (host-wide), `PUT /workspaces/:id/plugins/:name/options`)
- Modify: `apps/studio/server/src/adapters/http/plugins/plugins.body.ts` (удалить `trusted`-схему trustPluginBody/install trust-поле)
- Modify: `apps/studio/server/src/application/plugins/install-plugin.use-case.ts` (`InstallPluginRequest.trust` удалить; install пишет пустые grants)
- Modify: `apps/studio/server/src/adapters/http/plugins/plugin-registries.controller.ts` (entry `format`, `inertComponents` из кэша last-load)
- Modify: `apps/studio/server/src/composition/wire-controllers.ts` (новые use-case'ы: `set-plugin-option.use-case.ts` с маршрутизацией sensitive→SecretStore)
- Modify: `apps/studio/shared/src/plugin.ts` (контракт-типы: `PluginComponentSummary`, `GrantClass`, `format`; удалить `trusted`, `trust` из install-request)
- Create: `apps/studio/server/src/adapters/http/plugins/plugins.grants.body.ts` (zod-схема `{ classes: string[] }` → валидные GrantClass) и `plugins.options.body.ts`

- [ ] Steps: shared → bodies → controller → wire → typecheck → lint; commit `feat(plugins): grants/approvals api`

## Phase F. Install sources и marketplace

### Task F1: npm + archive sources, strict:false merge

**Files:**
- Modify: `packages/harnesys/src/domain/plugin-catalog.ts` (`CatalogInstallSource` += `| { type: 'npm'; package: string; version?: string; registry?: string } | { type: 'archive'; url: string; sha256?: string }`; `CatalogEntry` += `format?: PluginSourceFormat | 'unknown'; inertComponents?: PluginKind[]`)
- Modify: `apps/studio/server/src/adapters/plugin-git.adapter.ts` (или новый `plugin-source.adapter.ts`: `materializeSource(source, dest)`: npm → `bun add --no-save --ignore-scripts` в temp (флаг обязателен: lifecycle-скрипты пакета не должны исполняться, тот же мотив что запрет `command`-source; бинарники плагинного postinstall не нужны) + copy; archive → fetch+sha256-check+unzip (`ditto`/`unzip -q`), лимиты: https-only, zip ≤ 256 MiB, `.claude-plugin` в корне или одном top-level folder; refusal `command`-source — в парсере маркетплейса diagnostic `source_unsupported`)
- Modify: `packages/harnesys/src/application/plugins/parse-claude-marketplace.ts` (парсер библиотеки: `renames` — новое поле, парсится и отдаётся в `ParsedMarketplace`; `metadata.pluginRoot` уже читается (:51; top-level `pluginRoot` на :45); entry-поля shadow над plugin.json; версия: manifest > entry > git sha > archive hash(12) > 'unknown')

До реализации сверить со страницами plugin-marketplaces / plugin-dependencies
(в plugins-reference их нет): форма `renames`, полный синтаксис ranges
зависимостей, ограничения archive (https-only, zip, 256 MiB). При расхождении
правится план, не код.
- Modify: `apps/studio/server/src/application/plugins/materialize-catalog-plugin.ts` (новый тип источника; `strict===false` → entry-определение заменяет манифест-поля полностью — сегодня эмулируется синтезом манифеста :14-52, заменить на явный merge-режим; применение `renames` при синхронизации record; чистка `revision` в record)
- Modify: `apps/studio/server/src/application/plugins/sync-plugin-registry.use-case.ts` (парсинг расширенных source-полей)
- Modify: `apps/studio/server/src/application/plugins/update-plugin.use-case.ts` (PLUGIN_DATA не трогать; cache-dir по `version`-ключу `plugins/<name>/<revision>` — путь меняется, dataPath остаётся; bun install `--ignore-scripts` при lockfile, 60s cap, non-blocking)

- [ ] Steps: catalog type → adapter → marketplace parser → install/update use-cases; typecheck → lint; commit `feat(plugins): npm/archive sources and marketplace strict merge`

### Task F2: Dependencies резолвер

**Files:**
- Create: `packages/harnesys/src/application/plugins/semver-lite.ts` (~60 строк: сравнение semver + ranges `~ ^ >= =`, prerelease-excluded; внешняя `semver` в зависимостях отсутствует — проверено по package.json всех пакетов, новую deps не заводим)
- Create: `apps/studio/server/src/application/plugins/resolve-dependencies.ts` (`resolvePluginDependencies(record, catalogReader, repo): Promise<PluginDependency[]>` — BFS по каталогу, цикл → `dependency_cycle`, отсутствие в каталоге → `dependency_unsatisfied`, диапазон неудовлетворён → `dependency_unsatisfied`)
- Modify: `apps/studio/server/src/application/plugins/install-plugin.use-case.ts` (после record — авторазрешение deps: enable-каскад `setWorkspaceEnabled` для deps; remove/update: проверка dependants → `ConflictError` пока есть dependant)

- [ ] Steps: semver-lite (если нужен) → resolver → install/use-cases → typecheck → lint; commit `feat(plugins): install-time dependency resolution`

## Phase G. Клиент (FSD)

### Task G1: Settings plugins pane: бейджи, матрица, grants, userConfig

**Files:**
- Modify: `apps/studio/client/src/pages/settings/ui/plugins-installed-tab.tsx` (бейдж формата; матрица компонентов native/inert/blocked/dropped с причинами, `needs_server_approval` показывается причиной внутри blocked-семейства (drawer `plugin-detail-drawer.tsx` создать в `features/manage-plugins/ui/`); grant-чекбоксы three-way по классам → новый mutation `setGrants`)
- Modify: `apps/studio/client/src/pages/settings/ui/plugins-discover-tab.tsx` (бейджи + фильтр по формату)
- Modify: `apps/studio/client/src/features/manage-plugins/model/plugin-dialogs.ts` + `ui/plugin-dialogs.tsx` (enable-модалка: состав → требуемые классы → grant-кнопки; sensitive-опции userConfig → password input, значения после сохранения не отображать)
- Modify: `apps/studio/client/src/features/manage-agent/model/agent-config.ts` + `model/agent-fields.ts` (+`hooks`, +`enabledPlugins` в draft/merge; в `agent-mode-fields.ts` не добавлять — хуки уровня агента, вне modes), новый `ui/agent-hooks-pane.tsx` + регистрация в `ui/agent-config-category-panes.tsx`; чекбоксы `enabledPlugins` рядом с `ui/draft-capability-packs.tsx`
- Modify: API-клиент слайса (`shared/api` по конвенции пакета) + `index.ts` фичи (наружу только хуки действий)
- Создать `features/manage-plugins/README.md` (5-12 строк по образцу соседней фичи; сейчас его нет)

- [ ] Steps: types из shared → api → dialogs → tabs; `bun run typecheck && bun run lint`; commit `feat(plugins): format badges, grants matrix, user config ui`

### Task G2: Модалка агента: hooks-редактор и plugin gating

**Files:**
- Modify: `apps/studio/client/src/entities/agent/model/agent-record.ts`, `agent.ts` (+поля `hooks`, `enabledPlugins` из E0)
- Модификации фичи `manage-agent` сделаны в G1 (строкой выше) — здесь только verify draft round-trip (create/update payload содержит поля)
- Правки api/shared по необходимости (типы в `@harnesys/studio-shared` — контракт API)

- [ ] Steps: entity → fields/model → ui round-trip; `bun run typecheck && bun run lint`; commit `feat(plugins): agent hooks editor round-trip`

## Phase H. Деадкод-сборка и финальная сверка

### Task H1: Удаление остатков старого плагин-кода

**Files (проверить каждое grep-ом «ноль импортеров» перед удалением):**
- Delete: `packages/harnesys/src/application/plugins/claude-compat.ts` (после переносов; `parseInventoryMarkdown` переехал в `formats/agents-commands.ts` в B4), `discover-plugin-skills.ts`, `parse-plugin-mcp.ts`, `plugin-path-safety.ts` (слиты в B2/B4), `hooks-runner.ts` (заменён C1 executors; `runPluginHookCommand` больше нигде), экспорт `buildPluginSkillRegistries` из барреля `packages/harnesys/index.ts:52` и из `merge-plugin-runtime.ts` (заменён `bindSkillComponents`)
- Delete/rewrite: `session-start-notes.ts` → тонкий адаптер `plugin-hooks-to-bus.ts` (HookSpec → HookBinding[]; кэша по runId не нужно — HookBus per-run)
- Правки баррелей `packages/harnesys/index.ts`, `adapters/node/index.ts`, экспорт `harnesys/plugins-catalog` (D4: пустой баррель файла не оставляется)
- `PLUGIN_HOOK_TIMEOUT_MS` удалить из `apps/studio/server/src/config/constants.ts:68` и обоих потребителей (`studio-run-targets.adapter.ts:85`, `plugin-git.adapter.ts`); таймауты — contract-дефолты C1 + `PLUGIN_SESSION_START_HOOK_TIMEOUT_MS = 30_000` в том же constants.ts
- grep-инварианты (все пустые): `bash', '-lc'`, `PluginHookCommand`, `trusted` (кроме текста миграции E1), `sessionStartNotes`, `parseClaudePluginManifestJson`, `Middleware`, `'middleware'`

- [ ] Steps: grep-аудит → удаления → правки импортов → `bun run typecheck && bun run lint`; commit `refactor(plugins): remove legacy loader remnants`

### Task H2: Сверка со спецификацией (ревью-проход без кода)

- [ ] Шаг 1: пройтись по `docs/spec/plugin-system-v2.md` секциям 1–7; напротив каждого пункта плана — факт-чек в коде (grep/read), отклонения фиксировать или патчить; «вне скоупа» §7 не реализуем и не пишем
- [ ] Шаг 2: прогнать smoke-набор B4 шага 3 на живых каталогах: загрузить реальный Superpowers через `loadPluginIrFromDirectory` (скрипт в `temp/`, не коммитить), сверить статусы
- [ ] Шаг 3: если человек позовёт — ручная проверка стенда через agent-browser; иначе не поднимать
- [ ] Шаг 4: финальные `bun run typecheck && bun run lint`; коммит правок (если были)

---

## Матрица покрытия спеки

| Спека § | Таск |
|---|---|
| 1.1 IR | A2, B4 |
| 1.2 валидация/схемы | B1, B2, B3 |
| 1.3 адаптеры | B3, B4 |
| 2.1-2.2 contract/хендлеры | A1, C1 |
| 2.3 карта событий | A1 (NATIVE/UNSUPPORTED), C2 (швы), E2 (FileChanged) |
| 2.4 сборка/приоритеты | C1, C2, E2 |
| 3 binder (skills/commands/agents/bin) | D1, E2 (каталог агент-резолвер) |
| 3 binder (mcp/lsp/monitors/setting/userConfig) | D2, E2 (monitors lifecycle) |
| 3 dependencies | F2 |
| 3 sensitive→SecretStore | E3 (порт+адаптер macOS) |
| 4 trust/гранты/per-agent/API | E1, E2 (enforcement approvals), E3, E0 |
| 4 хранилище полей агента | E0 |
| 5 маркетплейс/install/UI | F1, F2, G1, G2 |
| 6 границы библиотека/хост | фазы A-D vs E-G (проверка в H1/H2) |
| 7 вне скоупа | нигде (контроль H2) |
| middleware-удаление | A3 (порт), C1-C2 замена, H1 контроль |
