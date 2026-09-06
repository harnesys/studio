# Capability packs — контракт расширения

Пачка — атом переносимости: инструменты, фрагмент системного промпта и notes-провайдер, включаемые одной записью в определении агента. Контракт фиксирует модель пачки, правила включения и сборки промпта, два уровня расширения и чеклист добавления новой пачки. Источник правды — код: `packages/harnesys/src/domain/capability.ts`, `src/application/capabilities/`.

## Модель пачки

`CapabilityPack<Ports>` (`src/domain/capability.ts`):

| поле | тип | назначение |
|---|---|---|
| `name` | `string` | идентификатор; ключ в `AgentDefinition.capabilities` |
| `version` | `string` | семвер; правка текста фрагмента = bump версии |
| `description` | `string` | каталог и UI |
| `requires` | `string[]?` | имена портов, которые обязан дать хост |
| `dependsOn` | `string[]?` | имена других пачек |
| `configFrom` | `(def) => CapabilityConfig \| PortRef \| null \| undefined?` | источник включения/конфига; по умолчанию `def.capabilities[name]` |
| `tools` | `(ctx) => ToolDefinition[]` | фабрика инструментов; вызывается на каждый ран |
| `prompt` | `(ctx) => string?` | фрагмент системного промпта |
| `notes` | `(ctx) => LlmNoteProvider?` | динамические заметки: активный план, каталог скиллов |

`ctx: CapabilityPackContext<Ports>` — `{ ports, resolveScope, config }`. `resolveScope()` возвращает `CapabilityScope`:

```ts
{ workspaceId: string; agentId: string; agentName?: string; threadId: string }
```

`agentName` — display name агента, когда он есть у хоста: memory-пачки скоупят записи по имени через `memoryScopeOf` (`src/capabilities/memory/memory-scope.ts`, `agentName ?? agentId`). Остальные пачки скоуп передают в порты как есть.

`defineCapability(pack)` — единственная точка определения; валидирует `name/version/description`, возвращает пачку как есть. Хост связывает пачку с портами через `registerCapability(pack, ports, resolveScope)` → `CapabilityRegistration`.

## Включение

`AgentDefinition.capabilities` (`src/domain/agent-definition.ts`):

```ts
capabilities?: Record<string, CapabilityConfig | null>;
```

Ключ — `pack.name`. Значение `null` или отсутствие ключа — выключено; наличие — включено, `spec` доезжает до инструментов через `ctx.config`. `CapabilityConfig` — `{ spec?: Record<string, unknown> }`.

Резолв — `resolveCapabilities(def, registrations)` (`src/application/capabilities/registry.ts`):

1. источник включения: `pack.configFrom(def)`, если задан; иначе `def.capabilities[name]`;
2. `requires`: порт отсутствует в `registration.ports` — ошибка `capability_port_missing`, пачка выключена;
3. `dependsOn`: зависимая пачка не резолвится — ошибка `capability_dep_missing` (рекурсивно, защита от циклов);
4. незарегистрированная пачка со значением не-null в `def.capabilities` — warning `unknown_capability`; явная `null`-запись не предупреждает (`registry.ts:85-93`).

Мост памяти: `AgentDefinition.memory` остаётся источником включения четырёх memory-пачек — их `configFrom` читает `def.memory.pin/semantic/episodic/knowledge` (`src/capabilities/memory/pin.ts:13`), запись в `capabilities` для них не нужна. Пачка `skills` включена по умолчанию: без явной записи `capabilities.skills` непустой `def.skills` превращается в `{ spec: { allow: [...] } }` (allowlist для `load_skill`), пустой `def.skills` — включена целиком; явная запись приоритетнее (`src/capabilities/skills.ts`).

Базовые пачки `files`, `shell`, `fetch` и пачка `skills` регистрируются автоматически в `createRuntime` (`src/application/create-runtime.ts:41-53`): хостовая регистрация с тем же `name` выигрывает — dedupe по имени, first wins.

## Сборка промпта

`composeSystemPrompt(agentText, enabled)` (`src/application/capabilities/prompt.ts`):

```
CAPABILITY_IDENTITY

<фрагмент пачки A>

<фрагмент пачки B>

## Agent
<agentText>
```

Порядок: identity-блок → фрагменты включённых пачек в порядке sort by `pack.name` (asc) → `## Agent` с текстом агента (секция добавляется только при непустом `agentText`). Пустые фрагменты выбрасываются. Сортировка по имени фиксирует порядок фрагментов — требование prefix-caching провайдеров.

Правила фрагментов:

- самодостаточность: фрагмент не ссылается на текст другой пачки;
- межпачечные связи — только `dependsOn`: выключенная зависимость убирает и инструменты, и текст;
- правка текста фрагмента = bump `version` пачки; версия видна в каталоге и показывает расхождение промпта между хостами.

`pack.notes(ctx)` возвращает `LlmNoteProvider`; провайдер вызывается перед каждым шагом LLM (`src/application/graph.ts:579-586`), скоуп резолвится внутри вызова провайдера — хост задаёт скоуп рана до этого (студия — через host-обёртку `runInHostToolScope` в run-engine; `requireHostToolScope` — чтение внутри провайдера).

## Два уровня расширения

Data — без кода, средствами хоста:

- SKILL.md с frontmatter `name`, `description`, `when_to_use` (опционально; принимается также `whenToUse`) → `SkillRegistry` → `createRuntime({ skills })`. Каталог попадает в notes пачки `skills`, полный текст — по запросу `load_skill` (`src/application/skills/parse-skill-file.ts`, `skills-catalog.ts`).
- `.mcp.json` (`CursorMcpJson`: map `mcpServers` со stdio/url-записями) → `createRuntime({ mcp })`; инструменты серверов попадают в общий реестр (`src/ports/mcp.ts`, `create-runtime.ts:55-66`).

Поля манифеста пачки совместимы с Claude plugin.json по трём полям: `name`, `version`, `description` читаются одинаково; `author` не моделируется.

Code — npm-пакет, экспортирующий `CapabilityPack`:

```ts
import { defineCapability } from 'harnesys';

export const myCapability = defineCapability<MyPorts>({
  name: 'my', version: '1.0.0', description: '…',
  requires: ['my'],
  tools: (ctx) => createMyTools({ port: ctx.ports.my, resolveScope: ctx.resolveScope }),
});
```

Хост: `registerCapability(myCapability, ports, resolveScope)` → `createRuntime({ capabilities: [...] })`. `ports` — реализации портов пачки; `resolveScope` — скоуп рана, хост задаёт его на своей стороне.

Реестр пачек, marketplace, динамическая загрузка code-пачек из FS — вне скоупа (`docs/superpowers/specs/2026-09-06-capability-packs-design.md`).

## Критерий минимальности порта

`execute()` каждого инструмента пачки выражается ≤ 2–3 методами порта. Orchestration — UoW, desk-события, cron-калькулятор, очередь fires, чистка вложений при удалении — остаётся в реализации порта у хоста. Образец: `apps/studio/server/adapters/capabilities/sqlite-*.port.ts` — тонкие обёртки над существующими use cases.

execute() не выражается 2–3 методами — граница пачки неверна; границу двигают до кода, не после.

## Чеклист добавления пачки

1. Порт: `src/ports/<name>.ts`, методы принимают `CapabilityScope`.
2. Фабрика тулов: `src/capabilities/<name>/create-<name>-tools.ts` — замыкание на порт + `ctx.resolveScope`.
3. Фрагмент: `src/capabilities/<name>/prompt.ts`; notes — если пачка несёт состояние, живущее вне контекста рана.
4. `defineCapability` в `src/capabilities/<name>/index.ts`, экспорт из корневого `index.ts`.
5. Регистрация у хостов: реализация порта + `registerCapability` (студия: `apps/studio/server/composition/wire-capabilities.ts`). Хост, запускающий граф, фильтрует реестр тулов по `capabilityToolNames` и накладывает per-agent экземпляры из `capabilityTools` (`apps/studio/server/adapters/studio-run-targets.adapter.ts`) — так `spec` доезжает до execute().
6. Каталог: без отдельного кода — `runtime.capabilities.list()` (`capabilityCatalog`). Студийный endpoint: `GET /api/workspaces/:id/capabilities` (`apps/studio/server/application/workspaces/list-workspace-capabilities.use-case.ts`).
7. Панель UI: чек-лист пачек из каталога хоста, запись в `draft.capabilities` (`features/manage-agent`, `draft-capabilities.tsx`). Секции memory остаются на `agent.memory`.

`prompt?` и `notes?` опциональны: пачка без фрагмента легальна, инструменты и notes добавятся без текста. Пачка с `tools: () => []` — сигнал пересмотреть границу.
