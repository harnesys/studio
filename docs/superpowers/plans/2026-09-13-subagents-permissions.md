# Сабагенты: права, CC-паритет, каталог — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать спеку сабагентов: карта прав агента как база (потолок режимов, база ребёнка при спавне), операция `agents`, `agents_create_subagent`, CC-паритет плагин-агентов (алиасы тулов, model-алиасы, color, `tools` allow-list), UI (Permissions-вкладка, мгновенное создание делегата из пресета, `Default` в композере).

**Architecture:** Права enforced движком `packages/harnesys` (пересечение при спавне, sandbox, вырезание пака `agents` у детей). Studio — персистенс `permissions`/`color`, резолв прав рана (база ∩ режим), UI. CC-совместимость — таблица алиасов + per-agent резолв в `filterToolsForAgent`.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle (SQLite), React + FSD (`react-hook-form` + zod), Biome.

**Spec:** `docs/superpowers/specs/2026-09-13-subagents-permissions-design.md`

## Global Constraints

- Тесты запрещены (репо `AGENTS.md`): не создавать `*.test.ts` / `*.spec.ts`. Верификация задачи = `bun run lint` + `bun run typecheck` в корне монорепо + ручные сценарии (Task 12, agent-browser).
- Дев-сервер хозяина уже слушает порты 3000 (API) и 5173 (Vite): не поднимать и не убивать процессы. Проверять только через них и по согласованию.
- Библиотека `packages/harnesys` — источник правды: типы прав/алиасов/спавна меняются там, Studio адаптируется.
- Слайс FSD снаружи только через `index.ts` (`noRestrictedImports`, `apps/studio/client/biome.json`).
- Именованные типы вместо `T['field']` и `Parameters<typeof fn>[0]`.
- Правки прозы/коммитов: без эмодзи, `feat:`/`fix:`/`docs:` префиксы.
- Порядок жёсткости прав: `deny > ask > allow`; пересечение берёт более строгий gate.
- Отсутствие `permissions` у агента = `DEFAULT_PERMISSIONS` (`constants.ts`), единое правило для всех.

---

### Task 1: Библиотека — типы прав, `intersectPermissions`

**Files:**
- Modify: `packages/harnesys/src/constants.ts:252-258`
- Modify: `packages/harnesys/src/domain/agent-definition.ts:56-81`
- Modify: `packages/harnesys/src/ports/agents-catalog.ts`
- Modify: `packages/harnesys/src/ports/create-runtime.ts:27-30`
- Modify: `packages/harnesys/src/application/permissions.ts`
- Modify: `packages/harnesys/src/index.ts` (баррель, если экспортирует типы поимённо)

**Interfaces:**
- Produces: `intersectPermissions(a: PermissionMap, b: PermissionMap): PermissionMap` (экспорт из `harnesys`); `AgentDefinition.permissions?: PermissionMap`; `AgentCatalogCreateInput.parentId?: string`; `AgentCatalogSummary.parentId?: string | null`; `AgentRosterEntry.parentId?: string | null`.

- [ ] **Step 1: `DEFAULT_PERMISSIONS` + операция `agents`**

```ts
// packages/harnesys/src/constants.ts
export const DEFAULT_PERMISSIONS: PermissionMap = {
  'fs.read': 'allow',
  'fs.write': 'ask',
  process: 'ask',
  network: 'ask',
  mcp: 'ask',
  agents: 'ask',
};
```

- [ ] **Step 2: `AgentDefinition.permissions`**

В `domain/agent-definition.ts` добавить в `AgentDefinition` поле (после `packs`):

```ts
/** Base permission map: host uses it as mode ceiling, engine as spawn base. Absent = DEFAULT_PERMISSIONS. */
permissions?: PermissionMap;
```

Импорт: `import type { PermissionMap } from '../ports/permissions.ts';` (если цикл — вынести `PermissionMap` в `domain/permission-map.ts` и реэкспортнуть из `ports/permissions.ts`; проверить `bun run typecheck`).

- [ ] **Step 3: порты каталога и ростера**

```ts
// ports/agents-catalog.ts
export type AgentCatalogSummary = {
  id: string;
  name: string;
  role: string;
  instructions: string;
  parentId?: string | null;
};

export type AgentCatalogCreateInput = {
  name: string;
  role: string;
  instructions: string;
  tools?: string[];
  skills?: string[];
  mcpServers?: string[];
  budget?: AgentBudget;
  packs?: Record<string, PackConfig | null>;
  graph?: AgentGraph;
  model?: AgentModelRef;
  /** When set, creates a delegate under that agent. */
  parentId?: string;
  permissions?: PermissionMap;
};
```

```ts
// ports/create-runtime.ts
export type AgentRosterEntry = {
  id: string;
  name: string;
  parentId?: string | null;
};
```

- [ ] **Step 4: `intersectPermissions`**

```ts
// packages/harnesys/src/application/permissions.ts (добавить в конец)
const GATE_SEVERITY: Record<PermissionGate, number> = { allow: 0, ask: 1, deny: 2 };

/** More stringent gate wins; unknown ops fall back to DEFAULT_PERMISSIONS then 'ask'. */
export function intersectPermissions(a: PermissionMap, b: PermissionMap): PermissionMap {
  const ops = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: PermissionMap = {};
  for (const op of ops) {
    const ga = a[op] ?? DEFAULT_PERMISSIONS[op] ?? 'ask';
    const gb = b[op] ?? DEFAULT_PERMISSIONS[op] ?? 'ask';
    out[op] = GATE_SEVERITY[ga] >= GATE_SEVERITY[gb] ? ga : gb;
  }
  return out;
}
```

Экспортировать `intersectPermissions` из барреля `index.ts` (найти строку экспорта `resolvePermissions` и добавить рядом).

- [ ] **Step 5: Верификация и коммит**

```bash
bun run typecheck && bun run lint
git add -A && git commit -m "feat: agent permissions map, catalog parentId, intersectPermissions"
```

---

### Task 2: Движок спавна — пересечение прав, вырезание пака `agents`, ownership

**Files:**
- Modify: `packages/harnesys/src/application/graph-spawn.ts:105-127` (resolveTargets), `:137-179` (runOneChild)
- Modify: `packages/harnesys/src/application/graph.ts:1092-1131` (точка вызова resolveTargets, если сигнатура меняется)

**Interfaces:**
- Consumes: `intersectPermissions`, `DEFAULT_PERMISSIONS`, `AgentRosterEntry.parentId`, `AgentDefinition.permissions`.
- Produces: контракт «эффективные права ребёнка = intersect(база ребёнка, права рана родителя)»; тулы группы `agents` недоступны детям; делегаты чужих родителей не резолвятся.

- [ ] **Step 1: Пересечение прав в `childOpts`**

В `runOneChild` (graph-spawn.ts:159) заменить `permissions: parent.permissions` на:

```ts
import { intersectPermissions } from './permissions.ts';
import { DEFAULT_PERMISSIONS } from '../constants.ts';
// ...
permissions: intersectPermissions(
  target.def.permissions ?? DEFAULT_PERMISSIONS,
  parent.permissions,
),
```

- [ ] **Step 2: Вырезание тулов группы `agents` у ребёнка**

После строки `const runRegistry = new Map(filterToolsForAgent(parent.toolRegistry, target.def));` (graph-spawn.ts:151):

```ts
// Engine-level nesting ban: child never gets agents-pack tools.
for (const [name, def] of runRegistry) {
  if (def.group === 'agents') {
    runRegistry.delete(name);
  }
}
```

- [ ] **Step 3: Ownership-фильтр в `resolveTargets`**

Прочитать `graph-spawn.ts:1-103` и точку вызова `resolveTargets` в `graph.ts` (около `:1092-1131`), чтобы узнать доступный контекст. Изменить сигнатуру на `resolveTargets(calls, agents, runAgentId: string)` и в цикле по roster-фолбэку добавить фильтр до `resolveAgentTarget`:

```ts
const visible = roster.filter(
  (entry) => entry.parentId == null || entry.parentId === runAgentId,
);
const hit = resolveAgentTarget(call.agentId, visible);
```

Прямой `agents.resolve(call.agentId)` оставить как есть (точный id делегата чужого родителя отсечёт fuzzy-ветка; прямой резолв в Studio закрывается ростером хоста, Task 6). Точку вызова в `graph.ts` передать `agentId` исполняемого агента (поле `opts.agent.id`).

- [ ] **Step 4: Верификация и коммит**

```bash
bun run typecheck && bun run lint
git add -A && git commit -m "feat: spawn permission intersection, engine agents-pack ban, roster ownership"
```

---

### Task 3: Тулы пака `agents` — `agents_create_subagent`, `agents` gate, `agents_list` level

**Files:**
- Modify: `packages/harnesys/src/packs/agents/create-agents-tools.ts`
- Modify: `apps/studio/server/src/adapters/capabilities/sqlite-agents-catalog.port.ts`

**Interfaces:**
- Consumes: `AgentCatalogCreateInput.parentId/permissions`, `AgentCatalogSummary.parentId`.
- Produces: тул `agents_create_subagent` (input: `name`, `role`, `instructions`, `tools?`, `skills?`, `packs?`, `budget?`, `permissions?`, `graph?`); `agents_create`/`agents_create_subagent` объявляют `operations: ['agents']`; `agents_list` возвращает `level: 'top' | 'delegate'` и `parent`.

- [ ] **Step 1: Гейт и новый тул в `create-agents-tools.ts`**

В `agents_create` добавить `operations: ['agents']` в опции `tool(...)`. Добавить новый тул после `agents_create`:

```ts
tool('agents_create_subagent', {
  group: 'agents',
  operations: ['agents'],
  description:
    'Create a subagent delegate under YOU (the calling agent). Returns { id, name }. ' +
    'Delegates are one-shot spawn targets: they cannot ask the user questions, their permissions ' +
    'never exceed yours, and the "agents" pack is forbidden for them. Spawn them with agents_spawn. ' +
    'Use agents_create instead for a standalone workspace agent visible to the user.',
  input: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Display name' },
      role: { type: 'string', description: 'Role label (not unique)' },
      instructions: { type: 'string', description: 'System instructions for the subagent' },
      tools: { type: 'array', items: { type: 'string' }, description: 'Tool names available to the subagent' },
      skills: { type: 'array', items: { type: 'string' }, description: 'Skill names to attach' },
      packs: { type: 'object', description: 'Optional pack map (name → config or null); "agents" is rejected' },
      budget: {
        type: 'object',
        description: 'Run budget; use policy "error" (ask is unavailable in spawn)',
        properties: {
          maxSteps: { type: 'integer', minimum: 1 },
          maxTokens: { type: 'integer', minimum: 1 },
          deadlineMs: { type: 'integer', minimum: 1 },
          policy: { type: 'string', enum: ['ask', 'error'] },
        },
      },
      permissions: {
        type: 'object',
        description:
          'Permission map op → allow|ask|deny (fs.read, fs.write, process, network, mcp). Effective rights are intersected with yours; ask acts as deny in spawn.',
      },
      graph: { type: 'object', description: 'Optional custom graph; omit for host default ReAct' },
    },
    required: ['name', 'role', 'instructions'],
  },
  execute: async (raw) =>
    runGuard(async () => {
      const scope = deps.resolveScope();
      const input = raw as AgentCatalogCreateInput & {
        capabilities?: Record<string, PackConfig | null>;
      };
      if (!input.name || !input.role || !input.instructions) {
        return { error: 'name, role, and instructions are required' };
      }
      if (input.packs?.agents !== undefined && input.packs.agents !== null && input.packs.agents !== false) {
        return { error: 'packs.agents is forbidden for subagents (nesting ban)' };
      }
      const packs = input.packs ?? input.capabilities;
      const next: AgentCatalogCreateInput = { ...input, parentId: scope.agentId };
      delete (next as { capabilities?: unknown }).capabilities;
      if (packs !== undefined) {
        next.packs = packs;
      }
      return await deps.agents.create(scope, next);
    }),
}),
```

Также дополнить description `agents_create` первой фразой: `'Create a standalone top-level agent in this workspace (visible to the user in the sidebar, own threads). For a delegate under you use agents_create_subagent.'`

- [ ] **Step 2: `agents_list` — level и parent**

В execute `agents_list` (create-agents-tools.ts:62-84) добавить в строку результата:

```ts
level: row.parentId ? 'delegate' : 'top',
...(row.parentId ? { parent: parentNames.get(row.parentId) ?? row.parentId } : {}),
```

где `parentNames` — `new Map(rows.map((r) => [r.id, r.name]))`, построенный до маппинга.

- [ ] **Step 3: `SqliteAgentsCatalogPort`**

В `list()` (sqlite-agents-catalog.port.ts:51-56) добавить `parentId: row.parentId` в маппинг summary; в `create()` (`:83-104`) передать `parentId: input.parentId ?? null` и `permissions: input.permissions ?? null` в `deps.createAgent.execute(...)`, а `deps.createAgent` тип расширить в Task 5 (здесь только прокидка, typecheck упадёт до Task 5 — поэтому Task 3 и Task 5 можно исполнять в одном коммите; если строго по задачам, закоммитить вместе с Task 5).

- [ ] **Step 4: Верификация и коммит** (совместно с Task 5, если typecheck требует)

```bash
bun run typecheck && bun run lint
```

---

### Task 4: Shared — `MODE_OPS + agents`, `DEFAULT_MODE_ID = 'default'`, `permissionMapForRun`

**Files:**
- Modify: `apps/studio/shared/src/modes.ts`
- Modify: `apps/studio/server/src/config/mode-preset-seed.ts`
- Modify: `apps/studio/server/src/adapters/tool-confirm-policy.ts`

**Interfaces:**
- Produces: `MODE_OPS` включает `'agents'`; `DEFAULT_MODE_ID = 'default'`; `DEFAULT_MODE: AgentMode` (id `default`, без `permissions`); `permissionMapForRun(base: PermissionMap | null | undefined, mode: AgentMode | undefined): PermissionMap` (в `tool-confirm-policy.ts`, реэкспорт через shared при необходимости клиенту — пока только сервер).
- Семантика: режим задаёт только перечисленные операции, потолок — база; пропуск = база.

- [ ] **Step 1: `modes.ts`**

```ts
export const MODE_OPS = ['fs.write', 'process', 'network', 'mcp', 'agents'] as const;
// ...
export const DEFAULT_MODE_ID = 'default';
/** Pseudo-mode: the agent's permission base without mode overrides. */
export const DEFAULT_MODE: AgentMode = { id: DEFAULT_MODE_ID, name: 'Default' };
```

`resolveModeId` (`:42-55`): условие валидности кандидата уже `(candidate === DEFAULT_MODE_ID || ids.has(candidate))` — не менять, оно начнёт пропускать `'default'` автоматически. `effectiveMode` (`:57-59`) изменить:

```ts
export function effectiveMode(modes: AgentMode[] | undefined, runModeId: string): AgentMode {
  if (runModeId === DEFAULT_MODE_ID) {
    return DEFAULT_MODE;
  }
  return modes?.find((m) => m.id === runModeId) ?? ASK_MODE;
}
```

`ASK_MODE` не трогать (остаётся builtin-пресетом `ask`).

- [ ] **Step 2: сиды режимов**

В `mode-preset-seed.ts` дополнить `permissions` каждого сида операцией `agents`: ask → `agents: 'ask'`; auto → `agents: 'ask'`; plan → `agents: 'deny'`; dont_ask → `agents: 'deny'`; bypass → `agents: 'allow'`. Также в `ASK_MODE` (shared/modes.ts:23-27) добавить `agents: 'ask'`.

- [ ] **Step 3: `permissionMapForRun` в `tool-confirm-policy.ts`**

Оставить `permissionMapForMode` (ask-пол, используется как фолбэк базы) и добавить:

```ts
import type { AgentMode } from '@harnesys/studio-shared';
import { MODE_OPS } from '@harnesys/studio-shared';

/** Run permission map: agent base ceiling, mode overrides only listed ops and never above the base. */
export function permissionMapForRun(
  base: PermissionMap | null | undefined,
  mode: AgentMode | undefined,
): PermissionMap {
  const b: PermissionMap = base ?? permissionMapForMode(mode?.permissions);
  if (!mode || mode.id === 'default' || !mode.permissions) {
    return b;
  }
  const out: PermissionMap = { ...b };
  for (const op of MODE_OPS) {
    const gate = mode.permissions[op];
    if (!gate) {
      continue;
    }
    const baseGate = b[op] ?? 'ask';
    const severity = { allow: 0, ask: 1, deny: 2 } as const;
    out[op] = severity[gate] >= severity[baseGate] ? gate : baseGate;
  }
  return out;
}
```

- [ ] **Step 4: Верификация и коммит**

```bash
bun run typecheck && bun run lint
git add -A && git commit -m "feat: agents op in modes, default pseudo-mode, run permission resolve"
```

---

### Task 5: Studio сервер — персистенс `permissions`/`color`, запрет пака у делегатов

**Files:**
- Modify: `apps/studio/server/src/domain/agent.port.ts:26-80`
- Modify: `apps/studio/server/src/adapters/store/sqlite/schema/agents.ts`
- Modify: `apps/studio/server/src/adapters/store/sqlite/bootstrap.ts` (после `:359-361`)
- Modify: `apps/studio/server/src/adapters/store/sqlite/repos/sqlite-agent.repo.ts` (insert/update/row→domain)
- Modify: `apps/studio/server/src/application/agents/create-agent.use-case.ts`, `update-agent.use-case.ts`
- Modify: `apps/studio/server/src/application/agents/agent.controller.ts` или DTO-схемы, где валидируется тело запроса агента (найти через grep `AgentPatch` в `adapters/http`)

**Interfaces:**
- Produces: `Agent.permissions: PermissionMap | null`, `Agent.color: string | null`, аналогично в `AgentPatch` и `CreateAgentRequest`; колонки `permissions_json`, `color` в `agents`; `ValidationError('agents pack is forbidden for delegates')` при `packs.agents` у записи с `parentId`.

- [ ] **Step 1: Домен и схема**

```ts
// agent.port.ts, внутри Agent и AgentPatch:
/** Base permission map (mode ceiling / spawn base); null = DEFAULT_PERMISSIONS. */
permissions: PermissionMap | null;
/** Card color (CC palette); null = host default. */
color: string | null;
```

Импорт: `import type { PermissionMap } from 'harnesys';`.

```ts
// schema/agents.ts — колонки:
permissionsJson: text('permissions_json'),
color: text('color'),
```

```ts
// bootstrap.ts — миграция рядом с parent_id:
try {
  db.run(sql.raw('ALTER TABLE agents ADD COLUMN permissions_json text;'));
} catch {}
try {
  db.run(sql.raw('ALTER TABLE agents ADD COLUMN color text;'));
} catch {}
```

- [ ] **Step 2: Репозиторий**

В `sqlite-agent.repo.ts`: insert/update сериализуют `permissionsJson: JSON.stringify(permissions) ?? null`, `color`; row→domain (`:170` рядом с `capabilities`) — `permissions: parsePermissionMap(row.permissionsJson)`, `color: row.color ?? null`. Хелпер:

```ts
function parsePermissionMap(raw: string | null): PermissionMap | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const out: PermissionMap = {};
    for (const [op, gate] of Object.entries(parsed as Record<string, unknown>)) {
      if (gate === 'allow' || gate === 'ask' || gate === 'deny') {
        out[op] = gate;
      }
    }
    return out;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Use-case'ы**

`CreateAgentRequest` и update-input получают `permissions?: PermissionMap | null`, `color?: string | null`; прокидка в insert/update. Запрет пака: в `CreateAgentUseCase.execute` после `resolveParentId`:

```ts
if (parentId !== null && isAgentsPackEnabled(capabilities)) {
  throw new ValidationError('agents pack is forbidden for delegates');
}

function isAgentsPackEnabled(
  capabilities: Record<string, PackConfig | null>,
): boolean {
  const v: unknown = capabilities.agents;
  return v !== undefined && v !== null && v !== false;
}
```

В `UpdateAgentUseCase` — тот же запрет, если у записи `parentId !== null` (взять текущую запись из репозитория) и патч содержит `capabilities` с включённым `agents` (существующая проверка «delegates cannot own delegates» `:154-169` уже есть — не трогать).

- [ ] **Step 4: HTTP DTO**

Найти валидацию тела (grep `capabilities` в `apps/studio/server/src/adapters/http/` или zod-схемы агента): добавить `permissions` (объект `Record<string, 'allow'|'ask'|'deny'>`, опционально), `color` (строка, опционально).

- [ ] **Step 5: Верификация и коммит** (вместе с Task 3)

```bash
bun run typecheck && bun run lint
git add -A && git commit -m "feat: agent permissions and color persistence, delegate agents-pack ban"
```

---

### Task 6: Рантайм-резолвы — RunTargets, registry, plugin model-алиасы

**Files:**
- Modify: `apps/studio/server/src/adapters/studio-run-targets.adapter.ts:103-161`
- Modify: `apps/studio/server/src/adapters/workspace-harnesys.registry.ts:228-249` и функция `dbAgentDefinition`
- Modify: `apps/studio/server/src/application/plugins/plugin-agents.ts:64-88`
- Modify: `apps/studio/server/src/adapters/capabilities/sqlite-agents-catalog.port.ts:139-153` (`toAgentDefinition`)

**Interfaces:**
- Produces: ран получает `permissions = permissionMapForRun(agentRow.permissions, mode)`; `AgentDefinition` агентов БД несёт `permissions`; ростер runtime несёт `parentId`; плагин-агент с нерезолвившейся моделью не дропается.

- [ ] **Step 1: RunTargets**

В `resolve()` (`:152`) заменить `permissions: permissionMapForMode(mode.permissions)` на:

```ts
permissions: permissionMapForRun(agentRow.permissions, mode),
```

- [ ] **Step 2: Registry**

В `createRuntime` agents.list (`:230-234`) добавить `parentId: a.parentId`. В `dbAgentDefinition` (найти grep'ом в файле) добавить `...(agent.permissions ? { permissions: agent.permissions } : {})`.

- [ ] **Step 3: model-алиасы плагин-агентов**

В `plugin-agents.ts` `resolveModelRef`: после точного матча (существующая логика) добавить substring-фолбэк для bare-имени:

```ts
// exact miss on a bare alias (sonnet/opus/haiku): substring match across providers
if (separator === -1) {
  const hit = providers
    .list()
    .flatMap((p) => models.listByProvider(p.id).map((m) => ({ provider: p, model: m })))
    .find(({ model }) => model.name.toLowerCase().includes(modelName.toLowerCase()));
  if (hit) {
    return { provider: hit.provider.name, model: hit.model.name };
  }
}
```

(Если у репозитория нет `listByProvider` — использовать доступный перечисляющий метод, grep `LlmModelRepository` в `domain/llm-provider.port.ts`.) Политику «дропать компонент» сменить: в `bindAgentComponents` (`packages/harnesys/src/application/plugins/bind-agents.ts:131-151`) `resolveSpecModel` при `null` вместо отбрасывания возвращает `undefined` + warning `'agent model does not resolve; inheriting parent model on spawn'`. Warning остаётся через `bind.onDiagnostic`; Studio уже передаёт `undefined` как sink (`plugin-agents.ts:36`) — диагностика попадает в IR-логи загрузки плагина (проверить, что sink туда подключён; если нет — оставить как есть, warning в лог биндинга).

- [ ] **Step 4: `toAgentDefinition` каталога**

Добавить `...(agent.permissions ? { permissions: agent.permissions } : {})`.

- [ ] **Step 5: Верификация и коммит**

```bash
bun run typecheck && bun run lint
git add -A && git commit -m "feat: run permission base resolve, roster parentId, plugin model aliases"
```

---

### Task 7: Пресеты — `permissions` в схеме и JSON, уникализация имён

**Files:**
- Modify: `apps/studio/server/src/adapters/agent-presets-fs.adapter.ts:29-57`
- Modify: `apps/studio/server/src/application/agents/create-agent-from-preset.use-case.ts`
- Modify: `apps/studio/assets/skills/agent-creator/presets/*.json` (10 файлов)

**Interfaces:**
- Produces: `AgentPreset.permissions?: PermissionMap`; from-preset сеет `permissions`; коллизия имени в воркспейсе разрешается суффиксом ` 2`, ` 3`… вместо `ConflictError`.

- [ ] **Step 1: zod-схема пресета**

Добавить в схему (`:29-39`):

```ts
permissions: z.record(z.enum(['allow', 'ask', 'deny'])).optional(),
```

В маппинг `AgentPreset` (`:46-57`) прокинуть.

- [ ] **Step 2: карты пресетов**

По таблице спеки: `assistant`, `orchestrator` → все `ask`; `coder` → `fs.write/process: allow`, остальное `ask`; `researcher` → `network: allow`, остальное `ask`; `planner`, `reviewer`, `tester`, `writer` → все `ask`; `explorer` → `fs.write/process/network/mcp: deny`; `general` → `fs.write/process: allow`, `network/mcp: deny`. Формат в JSON:

```json
"permissions": { "fs.write": "deny", "process": "deny", "network": "deny", "mcp": "deny" }
```

- [ ] **Step 3: from-preset use-case**

Прокинуть `permissions` из пресета в `CreateAgentRequest`. Уникализация имени (заменить поведение, где `CreateAgentUseCase` кидает `ConflictError`): до вызова `create` подобрать имя:

```ts
function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
```

`taken` = `new Set(agents.listByWorkspace(workspaceId).map((a) => a.name))`; применяется при `parentId`-посеве (ручной флоу топ-уровня оставляет `ConflictError` как есть — там имя вводит человек).

- [ ] **Step 4: Верификация и коммит**

```bash
bun run typecheck && bun run lint
git add -A && git commit -m "feat: preset permission maps and delegate name uniquification"
```

---

### Task 8: CC-паритет — алиасы тулов, `tools` allow-list, `color` frontmatter

**Files:**
- Create: `packages/harnesys/src/application/tool-aliases.ts`
- Modify: `packages/harnesys/src/application/tool-registry.ts:31-53`
- Modify: `packages/harnesys/src/application/graph.ts` (тул-цикл `llm:generate`, ок. `:627+`)
- Modify: `packages/harnesys/src/application/plugins/formats/agents-commands.ts:16-27`, `:158-187`
- Modify: `packages/harnesys/src/domain/plugin-ir.ts:76+` (`AgentSpec`)
- Modify: `packages/harnesys/src/application/plugins/bind-agents.ts:10-17` (`CatalogAgentEntry`)
- Modify: `apps/studio/server/src/application/plugins/plugin-agents.ts` (list → color)

**Interfaces:**
- Produces: `CC_TOOL_ALIASES: Record<string, string>`, `resolveToolAlias(name: string): string`; `filterToolsForAgent(registry, agent: { tools?: string[]; mcpServers?: string[]; disallowedTools?: string[] })` — allow-list с алиасами; `AgentSpec.color?: string`; `CatalogAgentEntry.color?: string`; diagnostic `unsupported_tool`.

- [ ] **Step 1: таблица алиасов**

```ts
// packages/harnesys/src/application/tool-aliases.ts
/** Claude Code tool names → our native tools. Per-agent resolution, global registry stays native. */
export const CC_TOOL_ALIASES: Record<string, string> = {
  Read: 'read_file',
  Write: 'write_file',
  Edit: 'edit_file',
  Glob: 'glob',
  Grep: 'grep',
  LS: 'list_dir',
  Bash: 'shell',
  WebFetch: 'fetch',
};

/** CC tool names with no carrier yet; surfaced as diagnostics when referenced. */
export const PLANNED_CC_TOOLS: Record<string, string> = {
  TodoWrite: 'plan pack analog planned',
  WebSearch: 'analog planned',
  NotebookRead: 'analog planned',
  NotebookEdit: 'analog planned',
  KillShell: 'analog planned',
  BashOutput: 'analog planned',
  Task: 'agents_spawn semantics differ; unsupported',
};

export function resolveToolAlias(name: string): string {
  return CC_TOOL_ALIASES[name] ?? name;
}
```

- [ ] **Step 2: allow-list в `filterToolsForAgent`**

```ts
export function filterToolsForAgent(
  registry: Map<string, ToolDefinition>,
  agent: { tools?: string[]; mcpServers?: string[]; disallowedTools?: string[] },
): Map<string, ToolDefinition> {
  const disallowed = agent.disallowedTools;
  const hasAllowList = agent.tools !== undefined && agent.tools.length > 0;
  if (
    agent.mcpServers === undefined &&
    (disallowed === undefined || disallowed.length === 0) &&
    !hasAllowList
  ) {
    return registry;
  }
  const allowedServers = new Set(agent.mcpServers ?? []);
  const blocked = new Set((disallowed ?? []).map(resolveToolAlias));
  // Requested names keep their alias spelling in the child registry so
  // CC-authored prompts ("use the Glob tool") call tools verbatim.
  const requested = new Map<string, string>();
  if (hasAllowList) {
    for (const name of agent.tools ?? []) {
      requested.set(resolveToolAlias(name), name);
    }
  }
  const out = new Map<string, ToolDefinition>();
  for (const [name, def] of registry) {
    if (requested.size > 0 && !requested.has(name)) {
      continue;
    }
    const isMcp = def.operations?.includes('mcp') ?? false;
    if (isMcp && def.group !== undefined && !allowedServers.has(def.group)) {
      continue;
    }
    if (blocked.has(name)) {
      continue;
    }
    const alias = requested.get(name);
    out.set(alias ?? name, alias !== undefined && alias !== name ? { ...def, name: alias } : def);
  }
  return out;
}
```

- [ ] **Step 3: тул-цикл `llm:generate`**

Прочитать `graph.ts:755-900` (участок после биндинга модели): найти, как в LLM-вызов попадает набор тулов (переменная `toolRegistry` / использование `ln.tools`). Если набор формируется из `opts.toolRegistry` без учёта `ln.tools` — обернуть: `const loopTools = ln.tools ? filterToolsForAgent(toolRegistry, { tools: ln.tools }) : toolRegistry;` и использовать `loopTools` в цикле. Если `ln.tools` уже применяется — убедиться, что фильтрация проходит через новый `filterToolsForAgent` (алиасы). Отразить фактическое место правки в коммит-месседже.

- [ ] **Step 4: frontmatter `color` и `unsupported_tool`**

`agents-commands.ts`: добавить `'color'` в `AGENT_FRONTMATTER_KEYS`; в `readAgentFile` после парса `tools` добавить диагностику:

```ts
for (const name of spec.tools ?? []) {
  const note = PLANNED_CC_TOOLS[name];
  if (note !== undefined) {
    diagnosticsLocal.push({
      level: 'warning',
      code: 'unsupported_tool',
      message: `agent frontmatter tool "${name}" has no carrier yet (${note}); ignored`,
      path: source.file,
    });
  }
}
```

Плюс чтение `const color = optionalNonEmptyString(raw.color); if (color !== undefined) { spec.color = color; }` и в `AgentSpec` (`plugin-ir.ts`) — `color?: string`. В `bind-agents.ts` `CatalogAgentEntry` — `color?: string`, прокинуть в `buildEntry` return.

`plugin-agents.ts` Studio: `list()` отдаёт `color` (тип `AgentCatalogSummary` расширить полем `color?: string` в `ports/agents-catalog.ts` тем же коммитом).

- [ ] **Step 5: Верификация и коммит**

```bash
bun run typecheck && bun run lint
git add -A && git commit -m "feat: cc tool aliases, tools allow-list, agent color frontmatter"
```

---

### Task 9: UI — Permissions-вкладка, навигация делегата, мгновенное создание из пресета

**Files:**
- Modify: `apps/studio/client/src/features/manage-agent/ui/agent-config-nav.tsx:20-51`
- Modify: `apps/studio/client/src/features/manage-agent/ui/agent-config-dialog.tsx` (фильтрация категорий, сохранение `permissions`/`color`)
- Create: `apps/studio/client/src/features/manage-agent/ui/agent-permissions-pane.tsx`
- Modify: `apps/studio/client/src/features/manage-agent/model/agent-fields.ts:31-53` (zod-схема), `model/agent-config.ts` (мерж полей)
- Modify: `apps/studio/client/src/features/manage-agent/ui/agent-subagents-pane.tsx:47-68`
- Modify: `apps/studio/client/src/features/manage-agent/ui/draft-capability-packs.tsx` (скрыть пак `agents` у делегата)
- Modify: `apps/studio/client/src/entities/agent` (тип/маппинг `permissions`, `color`)

**Interfaces:**
- Consumes: `Agent.permissions`, `Agent.color` (client-модель после Task 5 API).
- Produces: категория `permissions` в `AgentConfigCategory`; `AgentPermissionsPane` (пропсы: `value: PermissionMap | null`, `onChange`, `isDelegate: boolean`); делегат: категории `modes`/`hooks`/`subagents` скрыты; «Add from preset» создаёт делегата без открытия диалога драфта.

- [ ] **Step 1: клиентская модель агента**

В `entities/agent` (тип `Agent` + `toClientAgent`) добавить `permissions: PermissionMap | null`, `color: string | null` (источник — API-запись агента; проверить сериализацию в контроллере сервера из Task 5).

- [ ] **Step 2: zod-схема и категория**

`agent-fields.ts`: поле `permissions: z.record(z.enum(['allow', 'ask', 'deny'])).nullable().optional()` и `color: z.string().nullable().optional()`; прокинуть в draft/merge `agent-config.ts`. `agent-config-nav.tsx`: добавить `export type AgentConfigCategory = … | 'permissions'` и пункт `{ id: 'permissions', label: 'Permissions', icon: ShieldCheckIcon }` после `model` (импорт `ShieldCheckIcon` из `lucide-react`).

- [ ] **Step 3: `AgentPermissionsPane`**

```tsx
const PERM_OPS = ['fs.write', 'process', 'network', 'mcp'] as const;

export function AgentPermissionsPane({
  value, onChange, isDelegate,
}: {
  value: PermissionMap | null;
  onChange: (next: PermissionMap) => void;
  isDelegate: boolean;
}) {
  const current = (op: string): 'allow' | 'ask' | 'deny' => value?.[op] ?? 'ask';
  return (
    <Pane testId="agent-permissions-pane" label="Permissions" description="Base permission map: mode ceiling and spawn base.">
      {isDelegate ? (
        <p className="px-1 pb-2 text-muted-foreground text-xs">ask acts as deny in spawn (sandbox).</p>
      ) : null}
      <RowList>
        {PERM_OPS.map((op) => (
          <Row key={op} title={op} mono
            extra={
              <ToggleGroup value={current(op)} onValueChange={(gate) => onChange({ ...(value ?? {}), [op]: gate })}>
                <ToggleGroupItem value="allow">Allow</ToggleGroupItem>
                <ToggleGroupItem value="ask">Ask</ToggleGroupItem>
                <ToggleGroupItem value="deny">Deny</ToggleGroupItem>
              </ToggleGroup>
            }
          />
        ))}
      </RowList>
    </Pane>
  );
}
```

(Сверить API `Pane`/`Row`/`RowList`/`ToggleGroup` с `agent-subagents-pane.tsx` и соседними панелями; для топ-агентов добавить пятую строку `agents`.)

- [ ] **Step 4: диалог — навигация делегата и сборка категорий**

В `agent-config-dialog.tsx` (`:98-101`, где `showSubagents`): завести `isDelegate = agent.parentId !== null`; список категорий фильтровать:

```ts
const categories = AGENT_CONFIG_CATEGORIES.filter(
  (item) =>
    !(isDelegate && (item.id === 'modes' || item.id === 'hooks' || item.id === 'subagents')),
);
```

`color` — контрол во вкладке Identity (палитра из 9 CC-цветов: массив констант `['red','orange','yellow','green','blue','purple','magenta','cyan','pink']`, простые радио-чипы `size-4 rounded-full` с `bg-<color>-500`; Tailwind динамические классы не работают — использовать готовый словарь `COLOR_CLASSES: Record<string, string>`). Сохранение `permissions`/`color` — в существующий PATCH-флоу (`updateAgent`).

- [ ] **Step 5: мгновенное создание из пресета**

`agent-subagents-pane.tsx`: заменить `addFromPreset` (убрать `openAgentDialog`-флоу):

```tsx
const addFromPreset = async (presetId: string) => {
  try {
    const result = await createAgentFromPreset(workspaceId, presetId, { parentId });
    if (result) {
      toast.add({ title: 'Subagent added' });
    }
  } catch (error) {
    toast.add({ title: error instanceof Error ? error.message : 'Could not add subagent' });
  }
};
```

Импорт `createAgentFromPreset` из `../model/create-agent-from-preset` (модель уже поддерживает `options.parentId`, сервер — `POST .../agents/from-preset`). Проп `openAgentDialog` из `AgentSubagentsPaneProps` убрать (каскадно: единственный вызов в этом файле; проверить других потребителей пропа).

- [ ] **Step 6: скрыть пак `agents` у делегата**

`draft-capability-packs.tsx`: отфильтровать элемент с id `agents`, когда редактируемый агент — делегат (прокинуть `isDelegate` из диалога).

- [ ] **Step 7: Верификация и коммит**

```bash
bun run typecheck && bun run lint
git add -A && git commit -m "feat: permissions pane, delegate nav cuts, instant preset subagent"
```

---

### Task 10: UI — `Default` в композере, потолок в редакторе режимов

**Files:**
- Modify: `apps/studio/client/src/widgets/chat-composer/ui/chat-composer.tsx:107-122` и модель режима композера (grep `composerModeItems`)
- Modify: `apps/studio/client/src/features/manage-agent/ui/agent-mode-editor.tsx`, `agent-modes-pane.tsx`

**Interfaces:**
- Consumes: `DEFAULT_MODE_ID === 'default'` из shared (Task 4).
- Produces: список режимов композера = `Default` + режимы агента; редактор режимов не предлагает gate выше базы агента.

- [ ] **Step 1: композер**

Найти `composerModeItems` (grep в `widgets/chat-composer`): первым элементом добавить `{ id: 'default', name: 'Default' }` (использовать `DEFAULT_MODE_ID` и константу имени из shared). `knownMode`/`useEffect`-резолв (`:108-122`) уже фолбэкат на `DEFAULT_MODE_ID` — с `'default'` пункт всегда валиден. Сервер: `runModeFields` кладёт строку режима в thread metadata — `'default'` проходит `isModeId` без изменений.

- [ ] **Step 2: редактор режимов**

В `agent-mode-editor.tsx` селектор gate для каждой операции ограничить базой: прокинуть `base: PermissionMap | null` агента; доступные варианты = `['allow','ask','deny'].filter(g => severity(g) <= severity(base[op] ?? 'ask'))` (deny недоступен, если база allow? нет: deny всегда доступен — потолок ограничивает только вверх; фильтр: `allow` недоступен, если база `ask`/`deny`; `ask` недоступен, если база `deny`). Подпись под селектором: «Max: <base gate> (agent base)».

- [ ] **Step 3: Верификация и коммит**

```bash
bun run typecheck && bun run lint
git add -A && git commit -m "feat: default mode in composer, mode editor base ceiling"
```

---

### Task 11: UI — цвета карточек

**Files:**
- Modify: `apps/studio/client/src/widgets/agent-card/ui/agent-card.tsx`
- Modify: `apps/studio/client/src/features/manage-agent/ui/agent-subagents-pane.tsx` (`SubagentRow`)
- Modify: `apps/studio/client/src/widgets/chat-transcript/ui/spawn-card.tsx` (+ модель, где резолвится агент спавна)

**Interfaces:**
- Consumes: `Agent.color`, `AgentCatalogSummary.color`.
- Produces: цветная метка (точка `size-2 rounded-full` со словарём `COLOR_CLASSES`, общий для Task 9 — вынести в `shared/ui` или `entities/agent`) рядом с именем агента в карточке, строке делегата и `SpawnCard`.

- [ ] **Step 1: общий словарь цветов** — `Record<'red'|'orange'|'yellow'|'green'|'blue'|'purple'|'magenta'|'cyan'|'pink', string>` классов Tailwind (`bg-red-500` и т.д.; magenta/cyan/pink — `bg-fuchsia-500`, `bg-cyan-500`, `bg-pink-500`).

- [ ] **Step 2: точки цвета** в трёх местах; у `SpawnCard` цвет резолвится по агенту спавна из стора (`useAgentStore`) или каталога плагинов; отсутствие цвета = нейтральная серая точка (`bg-muted-foreground/40`).

- [ ] **Step 3: Верификация и коммит**

```bash
bun run typecheck && bun run lint
git add -A && git commit -m "feat: agent color dots on cards and spawn views"
```

---

### Task 13: Пресеты из скилла в корень assets (по просьбе хозяина, ход 2026-09-13)

Выполняется сразу после Task 8, до Task 9.

**Files:**
- Move: `apps/studio/assets/skills/agent-creator/presets/*.json` → `apps/studio/assets/presets/agents/*.json` (git mv, 10 файлов)
- Modify: `apps/studio/server/src/adapters/agent-presets-fs.adapter.ts` (`presetRoots`, комментарий над `listAgentPresets`)
- Modify: `apps/studio/server/src/config/constants.ts` (`PRESETS_DIR = 'agent-creator/presets'` → константы новых корней)
- Modify: `apps/studio/server/src/adapters/store/studio-layout.ts` (хелперы корней пресетов)
- Create: `apps/studio/assets/presets/modes/{ask,auto,plan,dont_ask,bypass}.json`
- Create/Modify: `apps/studio/server/src/adapters/mode-presets-fs.adapter.ts` + `apps/studio/server/src/config/mode-preset-seed.ts` (сид читает файлы)
- Modify: `apps/studio/assets/skills/agent-creator/SKILL.md` (упоминания пути пресетов)
- Modify: `docs/superpowers/specs/2026-09-13-subagents-permissions-design.md` (строки про mode-preset-seed)

**Interfaces:**
- Produces: агент-пресеты грузятся из `apps/studio/assets/presets/agents/` (бандл) и `~/.harnesys/presets/agents/` (home затеняет бандл); mode-пресеты — те же два корня с `presets/modes/`. Публичные функции `listAgentPresets`/`readAgentPreset`/`builtinModePresetSeed` сохраняют сигнатуры.

**Rulings (контроллера):**
- R8: новые домашние корни `~/.harnesys/presets/{agents,modes}`, старый `~/.harnesys/skills/agent-creator/presets` не читается (hard cut, правило D6).
- R9: формат mode-файла = поля `ModePreset` без `builtin/createdAt/updatedAt`: `id, name, description?, instructions? | instructionsFile?, skills?, packs?, permissions?, installedByDefault`. `instructionsFile` резолвится от корня `apps/studio/assets/` (план: `"instructionsFile": "plan-mode.md"`). `builtin: true` ставит загрузчик для файлов бандла; home-пресеты не builtin.

- [ ] **Step 1: агент-пресеты**

git mv JSON в `assets/presets/agents/`; в studio-layout.ts добавить:

```ts
/** Bundled agent/mode preset roots under apps/studio/assets. */
export function bundledPresetsPath(sub: 'agents' | 'modes'): string {
  return join(import.meta.dir, '..', '..', '..', '..', 'assets', 'presets', sub);
}

/** User preset root, shadows bundled: ~/.harnesys/presets/<sub>. */
export function systemPresetsPath(sub: 'agents' | 'modes', home: string = defaultHomePath()): string {
  return join(home, 'presets', sub);
}
```

`agent-presets-fs.adapter.ts`: `presetRoots()` → `[bundledPresetsPath('agents'), systemPresetsPath('agents')]`, убрать `PRESETS_DIR`-склейку; комментарий над `listAgentPresets` переписать под новые пути. `PRESETS_DIR` удалить из constants.ts, если других потребителей нет (rg).

- [ ] **Step 2: mode-пресеты в файлы**

Создать 5 JSON по таблице спеки (ask/auto/plan/dont_ask/bypass; поля как R9; `agents` в permissions у каждого: ask/ask/deny/deny/allow). Новый адаптер `mode-presets-fs.adapter.ts`:

```ts
const modePresetBodySchema = z.object({
  id: z.string().regex(MODE_ID_RE),
  name: z.string().trim().min(1),
  description: z.string().optional(),
  instructions: z.string().optional(),
  instructionsFile: z.string().optional(),
  skills: z.array(z.string()).optional(),
  packs: z.array(z.string()).optional(),
  permissions: z.record(z.string(), z.enum(['allow', 'ask', 'deny'])).optional(),
  installedByDefault: z.boolean().default(false),
});
```

`readModePresets(): Omit<ModePreset, 'createdAt' | 'updatedAt'>[]` — home затеняет бандл по id (тот же паттерн Map, что у agent-адаптера), `instructionsFile` читает `planModePromptPath()`-образно от корня assets и делает `.trim()`, `builtin = (корень === бандловый)`. `mode-preset-seed.ts`: `builtinModePresetSeed()` остаётся синхронной обёрткой над чтением файлов (bootstrap дергает её синхронно); readFileSync + план-текст без кэша, как сейчас.

- [ ] **Step 3: SKILL.md и спека**

`agent-creator/SKILL.md`: упоминания `agent-creator/presets` → `assets/presets/agents` (rg по файлу). Спека: строку про сиды (`Сиды режимов (mode-preset-seed.ts) без изменений`) поправить на «пресеты режимов в `apps/studio/assets/presets/modes/*.json`, сид читает файлы»; вторую ссылку на seed оставить (обёртка существует).

- [ ] **Step 4: Верификация и коммит**

`bun run typecheck && bun run lint`; rg-проверки остатков: `rg "agent-creator/presets|PRESETS_DIR" apps/studio/server/src` — пусто (кроме истории git). Коммит только своих путей: `refactor: move agent and mode presets to assets/presets`.

---

### Task 12: Финальная верификация

**Files:** — (только проверки; правки по найденным расхождениям)

- [ ] **Step 1: `bun run typecheck && bun run lint` в корне** — оба зелёные.
- [ ] **Step 2: остаточные grep-проверки** (`rg`):
  - `rg "permissionMapForMode\(" apps/studio/server/src` — только внутри `permissionMapForRun` (фолбэк) и старые точки устранены.
  - `rg "agents_create_subagent|agents_create\b" packages/harnesys/src` — описания различают уровни.
  - `rg "DEFAULT_MODE_ID" apps/studio` — нет захардкоженного `'ask'` как дефолта композера.
- [ ] **Step 3: ручные сценарии по чек-листу спеки (13 пунктов)** — через agent-browser по портам хозяина (3000/5173), по согласованию с хозяином стенда: создание из пресета, вкладка Permissions, `Default` в композере, режим `auto` при разных базах, потолок в редакторе режимов, спавн с пересечением прав, `agents_create_subagent` из рана, ask-парковка `agents_create`, `spawn_target_missing`, `ValidationError` пака, плагин `feature-dev` (агенты в списке, `color` без warning, `sonnet` резолвится, тул-цикл `Read/Glob/Grep`), `unsupported_tool` диагностики.
- [ ] **Step 4: финальный коммит** (если были правки): `git add -A && git commit -m "fix: subagent permissions follow-up"`.
