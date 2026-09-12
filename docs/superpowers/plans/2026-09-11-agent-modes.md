# Agent Modes Implementation Plan (v2 — presets, no mode names)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Режимы как данные: глобальные пресеты CRUD, копии на агенте, `ask` как встроенный фолбэк, цепочка резолва по id, пермишены/паки/скиллы/инструкции из данных, расписания на `modeId`, from-preset открывает модалку.

**Architecture:** Studio host + `@harnesys/studio-shared` владеют моделью режима целиком. Ни бекенд, ни клиент, ни библиотека не знают литералов имён режимов; единственные константы — `DEFAULT_MODE_ID = 'ask'` и `PLAN_PACK_ID = 'plan'` (id пака, ключ Capabilities). Библиотека получает один дженерик-параметр `deferredPacks` (Deferred-2). Данные резолвятся один раз в `shared`, потребитель — сервер.

**Tech Stack:** TypeScript, Bun, Hono, Drizzle/SQLite (idempotent-миграции в `bootstrap.ts`), React FSD (`react-hook-form` + zod, `shared/ui`).

**Spec:** `docs/superpowers/specs/2026-09-11-agent-modes-design.md`

## Global Constraints

- Файловые операции только внутри `~/Projects/Harnesys` и `~/.harnesys`.
- Тесты запрещены: никаких `*.test.ts` / `*.spec.ts`, vitest/RTL/playwright. Проверка: `bun run --cwd apps/studio typecheck`, `bun run lint` (в корне), curl на живых портах, agent-browser.
- Коммитов нет, если не попросили явно. Дев-серверы обычно уже подняты (`3000` API, `5173` Vite) — не стартовать вторые, не убивать.
- FSD: импорт только вниз, слайс наружу через `index.ts`; named types, никакого `T['field']`; ~300 строк на файл — резать по ответственности.
- Именование: агент — `modes` / `defaultModeId`, колонки `modes_json` / `default_mode_id`; тред — `runMode` (string id); расписание — `modeId` / `mode_id`.
- Каждая задача оставляет typecheck зелёным. Задачи выполнять по порядку.

---

## Touch map

| Слой | Файлы |
|---|---|
| shared | `shared/src/modes.ts` (new), `shared/types.ts`, `shared/src/agent.ts`, `shared/src/thread.ts` |
| library (Deferred-2) | `packages/harnesys/src/ports/run-targets.ts`, `src/application/run-engine-types.ts`, `src/application/packs/pack-run.ts`, `src/ports/create-runtime.ts` |
| server data | `sqlite/schema/mode-presets.ts` (new), `sqlite/schema/agents.ts`, `sqlite/schema/schedules.ts`, `sqlite/bootstrap.ts`, `sqlite/repos/sqlite-mode-preset.repo.ts` (new), `sqlite/repos/sqlite-agent.repo.ts`, `sqlite/repos/sqlite-schedule.repo.ts` |
| server domain/app | `domain/agent.port.ts`, `domain/thread.port.ts`, `domain/schedule.port.ts`, `application/mode-presets/*` (new), `application/agents/create-agent.use-case.ts`, `update-agent.use-case.ts`, `application/threads/thread.helpers.ts`, `create-thread.use-case.ts`, `send-thread-run.use-case.ts`, `application/schedules/*`, `adapters/tool-confirm-policy.ts`, `adapters/studio-run-targets.adapter.ts`, `composition/wire-packs.ts`, `composition/wire-controllers.ts` |
| server http | `adapters/http/mode-preset/*` (new), `adapters/http/agent/agent.body.ts`, `agent.controller.ts`, `adapters/http/thread/thread.body.ts`, `adapters/http/schedule/schedule.controller.ts` |
| client | `shared/api/mode-presets.ts` (new), `entities/agent/model/*`, `entities/thread/model/thread.ts`, `entities/schedule/model/*`, `features/manage-agent/*`, `features/manage-schedule/*`, `widgets/chat-composer/*`, `pages/settings/ui/mode-presets-pane.tsx` (new) |

---

### Task 0: From-preset открывает модалку с префиллом

**Files:**
- Modify: `apps/studio/client/src/features/manage-agent/model/create-agent-from-preset.ts`
- Modify: `apps/studio/client/src/features/manage-agent/ui/agent-config-dialog.tsx` (navCategories filter)
- Modify: `apps/studio/client/src/widgets/workspace-sidebar/ui/agents-section.tsx:77-93`
- Modify: `apps/studio/client/src/features/manage-agent/ui/agent-subagents-pane.tsx:43-56`
- Modify: `apps/studio/client/src/features/manage-agent/index.ts` (export префилл-хелпера)

**Interfaces:**
- Consumes: `AgentPresetRecord` (`shared/api/agents.ts:48`), `openAgentConfigDialog(agent, workspaceId)`.
- Produces: `agentDraftFromPreset(preset: AgentPresetRecord): Agent` — синтетический draft; диалог принимает его как `agent` и работает в режиме создания.

- [ ] **Step 1: Префилл-хелпер**

В `features/manage-agent/model/create-agent-from-preset.ts` добавить:

```ts
import type { Agent } from '@/entities/agent';
import type { AgentPresetRecord } from '@/shared/api/agents';

/** Synthetic agent-shaped draft: feeds AgentConfigDialog prefill; never persisted. */
export function agentDraftFromPreset(preset: AgentPresetRecord): Agent {
  return {
    id: '',
    name: preset.name,
    workspaceId: '',
    parentId: null,
    modelId: null,
    role: preset.role,
    instructions: preset.instructions,
    effort: null,
    skills: preset.skills ?? [],
    mcpServers: preset.mcpServers ?? [],
    tools: preset.tools ?? [],
    graph: preset.graph,
    budget: preset.budget ?? null,
    capabilities: preset.capabilities ?? {},
    createdAt: '',
    updatedAt: '',
  };
}
```

Поля `AgentPresetRecord` сверить с `shared/api/agents.ts:48-57` (name/role/instructions/tools/skills/mcpServers/budget/capabilities/graph).

- [ ] **Step 2: Диалог терпит draft без id**

В `agent-config-dialog.tsx` после строки 86 заменить фильтр навигации:

```tsx
const showSubagents = Boolean(activeAgent && !activeAgent.parentId && activeAgent.id !== '');
```

`focusAgentId` уже `rootAgent?.id ?? null` — для draft это `''` → `activeAgent` резолвится через ветку `focusAgentId === rootAgent?.id` (строка 82), title-эффект (строка 107) покажет `Configure <name>`. Больше ничего: `agentFieldsFrom(rootAgent)` (строка 72) и `initialCapabilities(rootAgent)` (строка 69) читают уже нужные поля.

- [ ] **Step 3: Сайдбар и сабагенты**

`agents-section.tsx:77` — заменить тело `createFromPreset`:

```tsx
const createFromPreset = (presetId: string) => {
  const preset = presets.find((item) => item.id === presetId);
  if (!workspaceId || !preset) {
    return;
  }
  void openAgentConfigDialog(agentDraftFromPreset(preset), workspaceId).then(async (result) => {
    if (!result || !workspaceId) {
      return;
    }
    try {
      const created = await createAgent(workspaceId, result.fields);
      if (created) {
        await updateAgentCapabilities(workspaceId, created.agent.id, result.capabilities);
      }
    } catch (error) {
      toast.add({
        title: error instanceof Error ? error.message : 'Could not create agent',
      });
    }
  });
};
```

Удалить import `createAgentFromPreset` из этого файла; `openCreated` остаётся для `createAgentFlow`. В `agent-subagents-pane.tsx:43` — то же самое с `{ parentId }`-веткой существующего сохранения (презет-лист уже в `presetsQuery.data`, синхронный lookup вместо вызова API). Экспортировать `agentDraftFromPreset` из `features/manage-agent/index.ts`.

- [ ] **Step 4: Проверка**

Run: `bun run --cwd apps/studio typecheck && bun run lint`
Expected: PASS.

agent-browser: sidebar → From Preset → открывается модалка с полями пресета; Save создаёт агента без открытия треда; Cancel ничего не создаёт. To же из Subagents → Add from preset.

---

### Task 1: Shared-модель режимов

**Files:**
- Create: `apps/studio/shared/src/modes.ts`
- Modify: `apps/studio/shared/types.ts` (реэкспорт)

**Interfaces:**
- Produces: `MODE_OPS`, `ModeOp`, `ModeOpGate`, `ModeOpPermissions`, `MODE_ID_RE`, `DEFAULT_MODE_ID`, `PLAN_PACK_ID`, `ASK_MODE`, `AgentMode`, `ModePreset`, `isModeId`, `resolveModeId`, `effectiveMode`, `modeFromPreset`.

- [ ] **Step 1: `shared/src/modes.ts`**

```ts
export const MODE_OPS = ['fs.write', 'process', 'network', 'mcp'] as const;
export type ModeOp = (typeof MODE_OPS)[number];
export type ModeOpGate = 'allow' | 'ask' | 'deny';
export type ModeOpPermissions = Partial<Record<ModeOp, ModeOpGate>>;

export const MODE_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;
export const DEFAULT_MODE_ID = 'ask';
/** Pack id, not a mode name: plan preset preloads this pack (Capabilities key). */
export const PLAN_PACK_ID = 'plan';

export type AgentMode = {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  skills?: string[];
  packs?: string[];
  permissions?: ModeOpPermissions;
};

/** Ultimate fallback; mirrored by the builtin 'ask' preset seed. */
export const ASK_MODE: AgentMode = {
  id: DEFAULT_MODE_ID,
  name: 'Ask before changes',
  permissions: { 'fs.write': 'ask', process: 'ask', network: 'ask', mcp: 'ask' },
};

export type ModePreset = AgentMode & {
  builtin: boolean;
  installedByDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export function isModeId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 48 && MODE_ID_RE.test(value);
}

/** Chain: bodyMode > threadMode > defaultModeId > ask. A value is valid when it
 *  matches the id pattern and exists in the agent's modes; anything else falls through. */
export function resolveModeId(input: {
  bodyMode?: string | null;
  threadMode?: string | null;
  defaultModeId?: string | null;
  modes?: AgentMode[] | null;
}): string {
  const ids = new Set((input.modes ?? []).map((m) => m.id));
  for (const candidate of [input.bodyMode, input.threadMode, input.defaultModeId]) {
    if (isModeId(candidate) && (candidate === DEFAULT_MODE_ID || ids.has(candidate))) {
      return candidate;
    }
  }
  return DEFAULT_MODE_ID;
}

export function effectiveMode(modes: AgentMode[] | undefined, runModeId: string): AgentMode {
  return modes?.find((m) => m.id === runModeId) ?? ASK_MODE;
}

export function modeFromPreset(preset: ModePreset): AgentMode {
  return {
    id: preset.id,
    name: preset.name,
    ...(preset.description ? { description: preset.description } : {}),
    ...(preset.instructions ? { instructions: preset.instructions } : {}),
    ...(preset.skills?.length ? { skills: [...preset.skills] } : {}),
    ...(preset.packs?.length ? { packs: [...preset.packs] } : {}),
    ...(preset.permissions ? { permissions: { ...preset.permissions } } : {}),
  };
}
```

- [ ] **Step 2: Реэкспорт**

В `apps/studio/shared/types.ts` рядом с прочими реэкспортами:

```ts
export {
  ASK_MODE,
  DEFAULT_MODE_ID,
  MODE_ID_RE,
  MODE_OPS,
  PLAN_PACK_ID,
  effectiveMode,
  isModeId,
  modeFromPreset,
  resolveModeId,
} from './src/modes.ts';
export type { AgentMode, ModeOp, ModeOpGate, ModeOpPermissions, ModePreset } from './src/modes.ts';
```

Run: `bun run --cwd apps/studio typecheck`
Expected: PASS (additive).

---

### Task 2: Library Deferred-2 — `deferredPacks`

**Files:**
- Modify: `packages/harnesys/src/ports/run-targets.ts`, `src/application/run-engine-types.ts`, `src/application/packs/pack-run.ts`, `src/ports/create-runtime.ts`
- Modify: `apps/studio/server/src/adapters/thread-runtime.registry.ts` (passthrough `RunTarget` → opts)

**Interfaces:**
- Produces: `RunTarget.deferredPacks?: readonly string[]`; `attachPackTools(runRegistry, enabled, deferredPacks?, logger?)`; `AttachPackRunInput.deferredPacks` / `ReusePackRunInput.deferredPacks`.

- [ ] **Step 1: Типы**

`ports/run-targets.ts` — после `packs?: PackRegistration[]` (строка 18):

```ts
/** Pack names whose tools attach as exposure:'deferred' this run (host-owned context axis). */
deferredPacks?: readonly string[];
```

То же поле — в `RunTargetOpts` и `RunEngineOpts` (`application/run-engine-types.ts:33,48`) и в opts-типе `src/ports/create-runtime.ts:48`, где перечислены packs.

- [ ] **Step 2: Маркировка при аттаче**

`application/packs/pack-run.ts`:

```ts
export function attachPackTools(
  runRegistry: Map<string, ToolDefinition>,
  enabled: PackRunOutput[],
  deferredPacks?: readonly string[],
  logger?: Logger,
): void {
  const deferred = deferredPacks === undefined ? undefined : new Set(deferredPacks);
  for (const out of enabled) {
    const markDeferred = deferred?.has(out.reg.pack.name) === true;
    for (const t of out.tools) {
      if (runRegistry.has(t.name)) {
        printPackDiagnostics(/* … без изменений … */);
        continue;
      }
      runRegistry.set(t.name, markDeferred ? { ...t, exposure: 'deferred' } : t);
    }
  }
}
```

`AttachPackRunInput` и `ReusePackRunInput` (строки 189, 242) получают `deferredPacks?: readonly string[]`; оба вызова `attachPackTools` внутри `attachPackRun`/`reusePackRun` пробрасывают `input.deferredPacks`.

- [ ] **Step 3: Passthrough до движка**

Найти все места, где поля `RunTarget` перекладываются в opts движения рана (`grep -n "packs" src/application src/ports` в пакете; целевые — `run-engine-types.ts`, `ports/create-runtime.ts` и адаптер студа `thread-runtime.registry.ts`, где `RunTarget` превращается в opts `handle.send`). В каждом добавить строку `deferredPacks: target.deferredPacks,` симметрично `packs`.

- [ ] **Step 4: Проверка**

Run: `bun run --cwd packages/harnesys typecheck && bun run --cwd apps/studio typecheck && bun run lint`
Expected: PASS. Поведение без `deferredPacks` не меняется (undefined → маркировки нет).

---

### Task 3: Таблица `mode_presets` + репозиторий + сид

**Files:**
- Create: `apps/studio/server/src/adapters/store/sqlite/schema/mode-presets.ts`
- Create: `apps/studio/server/src/adapters/store/sqlite/repos/sqlite-mode-preset.repo.ts`
- Create: `apps/studio/server/src/config/mode-preset-seed.ts`
- Modify: `apps/studio/server/src/adapters/store/sqlite/bootstrap.ts` (миграция + сид)

**Interfaces:**
- Consumes: Task 1 (`ModePreset`, `ASK_MODE`, `PLAN_PACK_ID`).
- Produces: `ModePresetRepository` (`list(): ModePreset[]`, `findById(id)`, `insert(rec)`, `update(id, patch)`, `delete(id)`), сид пяти builtin-пресетов.

- [ ] **Step 1: Схема**

```ts
import { integer, text, sqliteTable } from 'drizzle-orm/sqlite-core';

export const modePresetsTable = sqliteTable('mode_presets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  instructions: text('instructions').notNull().default(''),
  skillsJson: text('skills_json').notNull().default('[]'),
  packsJson: text('packs_json').notNull().default('[]'),
  permissionsJson: text('permissions_json').notNull().default('{}'),
  builtin: integer('builtin', { mode: 'boolean' }).notNull().default(false),
  installedByDefault: integer('installed_by_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
```

- [ ] **Step 2: Сид-значения**

`config/mode-preset-seed.ts` — по Decision 1 спеки:

```ts
import { ASK_MODE, PLAN_PACK_ID, type ModePreset } from '@harnesys/studio-shared';
import { readFileSync } from 'node:fs';
import { planModePromptPath } from '../adapters/store/studio-layout.ts';

function preset(p: Omit<ModePreset, 'createdAt' | 'updatedAt' | 'builtin'>): Omit<ModePreset, 'createdAt' | 'updatedAt'> {
  return { ...p, builtin: true };
}

export function builtinModePresetSeed(): Omit<ModePreset, 'createdAt' | 'updatedAt'>[] {
  const planInstructions = readFileSync(planModePromptPath(), 'utf8').trim();
  return [
    preset({ ...ASK_MODE, description: 'Confirm every write or command.', installedByDefault: true }),
    preset({
      id: 'auto',
      name: 'Edit automatically',
      description: 'File edits run without confirmation.',
      permissions: { 'fs.write': 'allow', process: 'ask', network: 'ask', mcp: 'ask' },
      installedByDefault: true,
    }),
    preset({
      id: 'plan',
      name: 'Plan mode',
      description: 'Research and propose a plan; no writes or shell.',
      instructions: planInstructions,
      packs: [PLAN_PACK_ID],
      permissions: { 'fs.write': 'deny', process: 'deny', network: 'allow', mcp: 'allow' },
      installedByDefault: true,
    }),
    preset({
      id: 'dont_ask',
      name: "Don't ask",
      description: 'Writes auto-run; network and MCP denied.',
      permissions: { 'fs.write': 'allow', process: 'deny', network: 'deny', mcp: 'deny' },
      installedByDefault: false,
    }),
    preset({
      id: 'bypass',
      name: 'Bypass',
      description: 'Run everything without confirmations.',
      permissions: { 'fs.write': 'allow', process: 'allow', network: 'allow', mcp: 'allow' },
      installedByDefault: false,
    }),
  ];
}
```

- [ ] **Step 3: Репозиторий + миграция + сид**

Репозиторий по образцу `sqlite-schedule.repo.ts`: `toPreset` парсит три `_json` поля с shape-guard (не массив/не объект → дефолт), `insert` сериализует. Миграция и сид в `bootstrap.ts` после блока `effort` (образец `bootstrap.ts:282`):

```ts
try {
  db.run(sql.raw(`CREATE TABLE IF NOT EXISTS mode_presets (
    id text PRIMARY KEY, name text NOT NULL, description text NOT NULL DEFAULT '',
    instructions text NOT NULL DEFAULT '', skills_json text NOT NULL DEFAULT '[]',
    packs_json text NOT NULL DEFAULT '[]', permissions_json text NOT NULL DEFAULT '{}',
    builtin integer NOT NULL DEFAULT 0, installed_by_default integer NOT NULL DEFAULT 0,
    created_at text NOT NULL, updated_at text NOT NULL);`));
} catch {}
for (const seed of builtinModePresetSeed()) {
  db.insert(modePresetsTable).values({ ...seed, skillsJson: JSON.stringify(seed.skills ?? []),
    packsJson: JSON.stringify(seed.packs ?? []), permissionsJson: JSON.stringify(seed.permissions ?? {}),
    createdAt: now, updatedAt: now }).onConflictDoNothing().run();
}
```

`onConflictDoNothing` — пользовательские правки builtin-пресетов переживают рестарт (Decision 1).

Run: `bun run --cwd apps/studio typecheck && bun run lint`
Expected: PASS. Рестарт стенда создаёт таблицу и 5 строк.

---

### Task 4: Mode-presets CRUD (use cases + HTTP)

**Files:**
- Create: `apps/studio/server/src/application/mode-presets/list-mode-presets.use-case.ts`, `create-mode-preset.use-case.ts`, `update-mode-preset.use-case.ts`, `delete-mode-preset.use-case.ts`
- Create: `apps/studio/server/src/adapters/http/mode-preset/mode-preset.body.ts`, `mode-preset.controller.ts`
- Modify: `apps/studio/server/src/composition/wire-controllers.ts`, маршрут-таблица рядом с `/api/schedules` (`server/src/index.ts`)

**Interfaces:**
- Produces: `ModePresetController` (`GET /api/mode-presets`, `POST /api/mode-presets`, `PATCH /api/mode-presets/:id`, `DELETE /api/mode-presets/:id`).

- [ ] **Step 1: Body**

```ts
import { MODE_ID_RE, MODE_OPS } from '@harnesys/studio-shared';
import { z } from 'zod';

const gates = z.enum(['allow', 'ask', 'deny']);
export const modePresetBody = z.object({
  id: z.string().regex(MODE_ID_RE).max(48),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).optional(),
  instructions: z.string().max(4000).optional(),
  skills: z.array(z.string().trim().min(1)).max(32).optional(),
  packs: z.array(z.string().trim().min(1)).max(16).optional(),
  permissions: z.record(z.enum(MODE_OPS), gates).optional(),
  installedByDefault: z.boolean().optional(),
});
export const modePresetPatchBody = modePresetBody.partial().omit({ id: true });
```

- [ ] **Step 2: Use cases**

Один класс на операцию по образцу `application/schedules/*`. Правила: `create` — reject если id занят; `update`/`delete` — reject если `builtin` (delete → 409-класс ошибки проекта; смотреть `domain/studio.error.ts` на ближайший конфликтный тип); `installedByDefault` менять можно и у builtin.

- [ ] **Step 3: Controller + wiring**

По образцу `adapters/http/schedule/schedule.controller.ts`; в `wire-controllers.ts` добавить use-cases и контроллер, маршрут-маунт — рядом с существующим `/api/schedules` в `server/src/index.ts`.

Run: `bun run --cwd apps/studio typecheck && bun run lint`
Expected: PASS. curl: `curl -s localhost:3000/api/mode-presets` → 5 пресетов; POST дубликата → ошибка; DELETE `ask` → ошибка.

---

### Task 5: Агенты — колонки, миграция, бэкфилл

**Files:**
- Modify: `apps/studio/server/src/adapters/store/sqlite/schema/agents.ts`
- Modify: `apps/studio/server/src/adapters/store/sqlite/bootstrap.ts`
- Modify: `apps/studio/shared/src/agent.ts`

**Interfaces:**
- Produces: `agents.default_mode_id text`, `agents.modes_json text not null default '[]'`; `AgentRecord.defaultModeId?: string | null`, `AgentRecord.modes?: AgentMode[]`.

- [ ] **Step 1: Колонки**

`schema/agents.ts` рядом с `skills`:

```ts
defaultModeId: text('default_mode_id'),
modesJson: text('modes_json').notNull().default('[]'),
```

- [ ] **Step 2: Миграции + бэкфилл агентов**

В `bootstrap.ts` после миграций Task 3 (репозиторий пресетов уже доступен):

```ts
try { db.run(sql.raw('ALTER TABLE agents ADD COLUMN default_mode_id text;')); } catch {}
try { db.run(sql.raw("ALTER TABLE agents ADD COLUMN modes_json text NOT NULL DEFAULT '[]';")); } catch {}
// Backfill: install installedByDefault presets + ask into agents without modes.
const defaults = presetRepo.list().filter((p) => p.installedByDefault || p.id === DEFAULT_MODE_ID);
for (const row of db.select().from(agentsTable).all()) {
  if (row.modesJson !== '[]') continue;
  const modes = defaults.map(modeFromPreset);
  if (!modes.some((m) => m.id === DEFAULT_MODE_ID)) modes.push({ ...ASK_MODE });
  db.update(agentsTable).set({ modesJson: JSON.stringify(modes) })
    .where(eq(agentsTable.id, row.id)).run();
}
```

Если сид-профиль `ask` уже среди `installedByDefault`, дубль не появится (`some`-guard).

- [ ] **Step 3: Shared-типы**

`shared/src/agent.ts` в `AgentRecord`:

```ts
/** Null = DEFAULT_MODE_ID ('ask'). */
defaultModeId?: string | null;
modes?: AgentMode[];
```

Run: `bun run --cwd apps/studio typecheck`
Expected: PASS.

---

### Task 6: Агенты — домен, репозиторий, bodies, use cases, контроллер

**Files:**
- Modify: `apps/studio/server/src/domain/agent.port.ts`, `sqlite/repos/sqlite-agent.repo.ts`, `adapters/http/agent/agent.body.ts`, `adapters/http/agent/agent.controller.ts`, `application/agents/create-agent.use-case.ts`, `update-agent.use-case.ts`

**Interfaces:**
- Consumes: Tasks 1, 5.
- Produces: `Agent.defaultModeId: string | null`, `Agent.modes: AgentMode[]`; POST/PATCH принимают и хранят оба поля.

- [ ] **Step 1: Порт**

`Agent`: `defaultModeId: string | null; modes: AgentMode[];`. `AgentPatch`: оба опциональные.

- [ ] **Step 2: Репозиторий**

`sqlite-agent.repo.ts`: `modes` добавить в деструктуру JSON-колонок в `insert`/`update` (образец `capabilities`, строки 52-77 и 89-112):

```ts
modesJson: serializeJson(modes),
// update:
...(modes !== undefined ? { modesJson: serializeJson(modes) } : {}),
```

`toAgent` (строка ~149):

```ts
defaultModeId: row.defaultModeId ?? null,
modes: parseAgentModes(row.modesJson),
```

`parseAgentModes` — shape-guard: не массив → `[]`; элементы без валидного `id`/`name` отбрасываются; `id: 'ask'` отбрасывается (встроенный, живёт в сиде, не в агенте).

- [ ] **Step 3: Bodies + use cases**

`agent.body.ts`:

```ts
const modeOpGate = z.enum(['allow', 'ask', 'deny']);
const agentModeBody = z.object({
  id: z.string().regex(MODE_ID_RE, 'lowercase letters, digits, dash').max(48),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).optional(),
  instructions: z.string().max(4000).optional(),
  skills: z.array(z.string().trim().min(1)).max(32).optional(),
  packs: z.array(z.string().trim().min(1)).max(16).optional(),
  permissions: z.record(z.enum(MODE_OPS), modeOpGate).optional(),
});
// в createAgentBody и updateAgentBody:
defaultModeId: z.string().regex(MODE_ID_RE).max(48).nullish(),
modes: z.array(agentModeBody).max(24).optional(),
```

`create-agent.use-case.ts`: принимает `modes?`, `defaultModeId?`; если `modes` не пришли — сеет копии `installedByDefault`-пресетов + `ask` (деп `ModePresetRepository` добавить в конструктор и в `wire-controllers.ts`); валидации (ValidationError): id уникальны, `'ask'` среди modes запрещён, `defaultModeId ∈ ids ∪ {'ask'}`. `update-agent.use-case.ts`: patch-проход оба поля с теми же валидацией (учитывать union старых и новых modes при проверке defaultModeId). Контроллер пробрасывает оба поля в POST и PATCH.

Run: `bun run --cwd apps/studio typecheck && bun run lint`
Expected: PASS. curl: PATCH агента с `modes` + `defaultModeId` → 200, GET возвращает их; `defaultModeId: 'ghost'` → 400.

---

### Task 7: Клиент агентов — сущность, форма, вкладка Modes

**Files:**
- Modify: `apps/studio/client/src/shared/api/agents.ts`, `entities/agent/model/agent.ts`, `entities/agent/model/agent-record.ts`
- Create: `apps/studio/client/src/features/manage-agent/model/agent-mode-fields.ts`
- Modify: `apps/studio/client/src/features/manage-agent/model/agent-fields.ts`, `create-agent.ts`, `update-agent.ts`, `ui/agent-config-nav.tsx`, `ui/agent-config-category-panes.tsx`
- Create: `apps/studio/client/src/features/manage-agent/ui/agent-modes-pane.tsx`

**Interfaces:**
- Consumes: Task 6.
- Produces: `Agent.modes: AgentMode[]`, `Agent.defaultModeId: string | null`; категория `'modes'`; `AgentModesPane({ form })`; `agentModesFrom(agent)` / `agentModesToDraft(values)`.

- [ ] **Step 1: Сущность и API**

`Agent`: `defaultModeId: string | null; modes: AgentMode[];` (`AgentMode` из `@harnesys/studio-shared`). `AgentDraft`/`AgentPatch`/inputs — опциональные. `agent-record.ts`: `modes: parseModes(record.modes)` (тот же guard, что в репо), `defaultModeId: record.defaultModeId ?? null`.

- [ ] **Step 2: Модель режимов формы**

`agent-mode-fields.ts` (держим `agent-fields.ts` в пределах 300 строк):

```ts
export const agentModeSchema = z.object({
  id: z.string().regex(MODE_ID_RE, 'lowercase letters, digits, dash').max(48),
  name: z.string().trim().min(1, 'Name required').max(80),
  description: z.string().max(200),
  instructions: z.string().max(4000),
  skills: z.array(z.string()),
  packs: z.array(z.string()),
  permWrite: z.enum(['allow', 'ask', 'deny']),
  permProcess: z.enum(['allow', 'ask', 'deny']),
  permNetwork: z.enum(['allow', 'ask', 'deny']),
  permMcp: z.enum(['allow', 'ask', 'deny']),
});
export type AgentModeFields = z.infer<typeof agentModeSchema>;
export function modeToFields(m: AgentMode): AgentModeFields { /* плоские поля, гейты с fallback 'ask' */ }
export function fieldsToMode(f: AgentModeFields): AgentMode { /* id/name/description/instructions/skills/packs + permissions из 4 гейтов */ }
```

В `agent-fields.ts`: схема получает `defaultModeId: z.string().nullable()` и `modes: z.array(agentModeSchema)`; `emptyAgentFields` — `defaultModeId: null, modes: [{ ...modeToFields(ASK_MODE-подобный blank) }]` — нет: `ask` не в `modes`; пустой список = `[]`. `agentFieldsFrom` — `defaultModeId: agent.defaultModeId ?? null, modes: (agent.modes ?? []).map(modeToFields)`; `toAgentDraft` — `modes: values.modes.map(fieldsToMode), defaultModeId: values.defaultModeId`. Refine уникальности id — на уровне схемы `modes`.

- [ ] **Step 3: Вкладка**

`agent-config-nav.tsx`: `'modes'` в union + `{ id: 'modes', label: 'Modes', icon: SlidersHorizontalIcon }` после `model`. `agent-config-category-panes.tsx`: рендер `<AgentModesPane form={form} />` под `category === 'modes'`.

`agent-modes-pane.tsx` (`useFieldArray` по `modes`): список (name, id, summary гейтов, радиокнопка Default ↔ `defaultModeId`); Add blank; Add from preset — dropdown из `modePresetsQuery` (Task 14 добавит API; до этого пункта — из `GET /api/mode-presets` через временный fetch или поставить Task 14 раньше; допустимо: реализовать pane после Task 14, Steps ниже это учитывают); редактор выбранного: name, id (у preset-копии предзаполнен id пресета), description, instructions textarea, skills — мультивыбор из скиллов агента (allowlist из `capabilitiesRef`/`activeAgent.skills`, пустой allowlist = все — источник: существующий список Skills-таба), packs — мультивыбор из `catalogQuery` `capabilities` (`draft-capability-packs.tsx:27` образец) пересечённый с `activeAgent.capabilities`, 4 ToggleGroup allow/ask/deny.

- [ ] **Step 4: create/update**

`create-agent.ts`: `modes: draft.modes, defaultModeId: draft.defaultModeId ?? null`; `update-agent.ts`: те же поля безусловно (форма всегда присылает массив).

Run: `bun run --cwd apps/studio typecheck && bun run lint`
Expected: PASS.

agent-browser: модалка агента → Modes: blank-режим создаётся/редактируется/удаляется, дефолт переключается, после reopen persist; preset-кнопка появится после Task 14 (вернуться и проверить).

---

### Task 8: Треды — runMode как id, сид при создании, XML-инструкции

**Files:**
- Modify: `apps/studio/server/src/domain/thread.port.ts`, `application/threads/thread.helpers.ts`, `create-thread.use-case.ts`, `send-thread-run.use-case.ts`, `adapters/http/thread/thread.body.ts`
- Modify: `apps/studio/client/src/entities/thread/model/thread.ts`

**Interfaces:**
- Consumes: Tasks 1, 6.
- Produces: `ThreadRunMode = string`; `runModeFields(): { runMode?: string }`; `create-thread` пишет `metadata.runMode` и возвращает его; `send-thread-run` резолвит цепочкой и вклеивает `<mode>`-блок.

- [ ] **Step 1: Типы и хелперы**

`thread.port.ts:30`: заменить union на `export type ThreadRunMode = string;` (комментарий: id режима агента). `thread.helpers.ts`: `isThreadRunMode` → `isModeId` из shared; `runModeFields` возвращает `{ runMode }` для любого валидного по паттерну значения (вхождение в режимы агента проверяет резолвер). `shared/src/thread.ts:32` и клиентский `entities/thread/model/thread.ts:19`: `runMode?: string`.

- [ ] **Step 2: create-thread**

`create-thread.use-case.ts:69`:

```ts
metadata: { runMode: agent.defaultModeId ?? DEFAULT_MODE_ID },
```

и в возвращаемой записи (после строки 88) — `runMode: thread.metadata && typeof thread.metadata === 'object' ? (thread.metadata as { runMode?: string }).runMode : undefined`.

- [ ] **Step 3: send-thread-run**

```ts
import { DEFAULT_MODE_ID, effectiveMode, resolveModeId, type AgentMode } from '@harnesys/studio-shared';
```

`SendThreadRunRequest.mode?: string`. Вместо `resolveRunMode` (строки 102, 153-158):

```ts
const runModeId = resolveModeId({
  bodyMode: request.mode ?? null,
  threadMode: runModeFields(thread).runMode ?? null,
  defaultModeId: agentRow.defaultModeId ?? null,
  modes: agentRow.modes,
});
this.threads.setRunMode(thread.id, runModeId);
input.text = decorateText(effectiveMode(agentRow.modes, runModeId), request.text);
```

`decorateText` переписать: режим с `instructions` или skills получает XML-блок перед текстом (как план сегодня, строка 134):

```ts
function modeInstructionsBlock(mode: AgentMode): string | undefined {
  const skills = (mode.skills ?? []).map((s) => s.trim()).filter(Boolean);
  if (!mode.instructions?.trim() && skills.length === 0) return undefined;
  const parts = [
    mode.instructions?.trim() ? `<instructions>${escapeXml(mode.instructions.trim())}</instructions>` : null,
    skills.length > 0
      ? `<mode-skills>Before working in this mode, call load_skill for each: ${skills.join(', ')}.</mode-skills>`
      : null,
  ].filter(Boolean);
  return `<mode id="${mode.id}" name="${escapeXml(mode.name)}">\n${parts.join('\n')}\n</mode>`;
}
```

`escapeXml` перенести из `plan-mode-prompt.ts:9-15`. Вызов `planModePrompt()` и ветка `runMode === 'plan'` удаляются; `decorateText(mode, text)` = `block ? \`${block}\n\n${text}\` : text`. Удалить локальный `resolveRunMode` и import `isRunMode` (строка 4). `planFollowPrompt` не трогается.

- [ ] **Step 4: Body**

`thread.body.ts:29`: `mode: z.string().trim().min(1).max(48).optional()`. Контроллер (`thread.controller.ts:144`) уже пробрасывает строку.

Run: `bun run --cwd apps/studio typecheck && bun run lint`
Expected: PASS.

curl: создать тред агента с `defaultModeId='auto'` → в ответе `runMode:'auto'`; POST run без mode → сохранённый runMode остаётся; POST `{"mode":"ghost"}` → runMode откатывается на дефолт агента (цепочка).

---

### Task 9: Run-targets и plan-гейт — пермишены и паки из данных

**Files:**
- Modify: `apps/studio/server/src/adapters/tool-confirm-policy.ts` (добавить `permissionMapForMode`)
- Modify: `apps/studio/server/src/adapters/studio-run-targets.adapter.ts`
- Modify: `apps/studio/server/src/composition/wire-packs.ts:125-130`

**Interfaces:**
- Consumes: Tasks 1, 2, 8.
- Produces: `permissionMapForMode(perms?: ModeOpPermissions): PermissionMap`; `RunTarget.deferredPacks`; plan-гейт по `mode.packs`.

- [ ] **Step 1: Карта из данных**

`tool-confirm-policy.ts`:

```ts
export function permissionMapForMode(perms?: ModeOpPermissions): PermissionMap {
  const map: PermissionMap = {
    'fs.read': 'allow', 'fs.write': 'ask', process: 'ask', network: 'ask', mcp: 'ask',
  };
  for (const op of MODE_OPS) {
    const gate = perms?.[op];
    if (gate) map[op] = gate;
  }
  return map;
}
```

Старые `permissionMapFor`/`isRunMode`/`isPermissionMode` пока остаются (их ещё импортируют schedules) — удаление в Task 14.

- [ ] **Step 2: resolve**

`studio-run-targets.adapter.ts` после загрузки `agentRow`/`agent` (определение агента уже есть, строка 49):

```ts
const runModeId = resolveModeId({
  threadMode: runModeFields(thread).runMode ?? null,
  defaultModeId: agentRow.defaultModeId ?? null,
  modes: agentRow.modes,
});
const mode = effectiveMode(agentRow.modes, runModeId);
```

В возвращаемом `RunTarget` (строки 78-87):

```ts
permissions: permissionMapForMode(mode.permissions),
deferredPacks: deferredPackNames(agent.packs, registrations, mode.packs),
```

```ts
function deferredPackNames(
  agentPacks: AgentPacks | undefined,
  registrations: PackRegistration[],
  modePacks: string[] | undefined,
): string[] {
  const enabled = registrations
    .map((r) => r.pack.name)
    .filter((name) => Boolean(agentPacks?.[name]));
  const wanted = modePacks?.length ? new Set(modePacks) : null;
  return wanted ? enabled.filter((name) => !wanted.has(name)) : [];
}
```

Локальный `resolveThreadRunMode` (строки 95-98) удалить.

- [ ] **Step 3: Plan-гейт**

`wire-packs.ts:125-130`:

```ts
isPlanRunMode: () => {
  const thread = deps.threads.findById(resolveScope().threadId);
  const agentRow = thread ? deps.agents.findById(thread.agentId) : undefined;
  if (!thread || !agentRow) return false;
  const runModeId = resolveModeId({
    threadMode: runModeFields(thread).runMode ?? null,
    defaultModeId: agentRow.defaultModeId ?? null,
    modes: agentRow.modes,
  });
  return (effectiveMode(agentRow.modes, runModeId).packs ?? []).includes(PLAN_PACK_ID);
},
```

`deps.agents` в wire-packs уже есть (строка 110).

Run: `bun run --cwd apps/studio typecheck && bun run lint`
Expected: PASS.

agent-browser: тред в режиме plan → `plan_propose` доступен, `shell`/`write_file` схем нет в контексте (проверка: агент их не видит), запись заблокирована; тред в ask → `write_file` спрашивает.

---

### Task 10: Schedules — сервер на modeId

**Files:**
- Modify: `apps/studio/server/src/domain/schedule.port.ts`, `adapters/store/sqlite/schema/schedules.ts`, `adapters/store/sqlite/bootstrap.ts`, `adapters/store/sqlite/repos/sqlite-schedule.repo.ts`, `application/schedules/create-schedule.use-case.ts`, `update-schedule.use-case.ts`, `fire-due-schedules.use-case.ts`, `schedule-record.ts`, `adapters/http/schedule/schedule.controller.ts`
- Modify: `apps/studio/shared/types.ts:188-199` (`ScheduleRecord.mode` → `modeId: string`)

**Interfaces:**
- Consumes: Tasks 1, 6.
- Produces: `Schedule.modeId: string`; create/update валидируют `modeId` против режимов агента.

- [ ] **Step 1: Колонка + backfill**

`schema/schedules.ts`: `modeId: text('mode_id').notNull().default('ask')` (старую колонку `mode` с CHECK не трогать — останется мёртвой). `bootstrap.ts`:

```ts
try { db.run(sql.raw("ALTER TABLE schedules ADD COLUMN mode_id text NOT NULL DEFAULT 'ask';")); } catch {}
db.run(sql.raw('UPDATE schedules SET mode_id = mode;'));
```

- [ ] **Step 2: Типы, репо, use cases, fire**

`schedule.port.ts`: `mode: PermissionMode` → `modeId: string` в записи и request-типах; `shared/types.ts` `ScheduleRecord` аналогично. Репо: `toSchedule` читает `row.modeId`, insert/update пишут `modeId` (CHECK на старой колонке не мешает). `create-schedule.use-case.ts:95`: дефолт — `agent.defaultModeId ?? DEFAULT_MODE_ID` (агент по `targetAgentId`, деп `agents` в use-case уже есть), валидация `modeId ∈ agent.modes ids ∪ {defaultModeId}` иначе ValidationError. `update-schedule.use-case.ts:125-129`: та же проверка вместо `isPermissionMode`. `fire-due-schedules.use-case.ts:83`: `mode: schedule.mode` → `mode: schedule.modeId`. `schedule-record.ts:13`: `modeId`. Контроллер пробрасывает `modeId`.

Run: `bun run --cwd apps/studio typecheck && bun run lint`
Expected: PASS (клиентские typing-ошибки по `ScheduleRecord.mode` закрыть в этом же шаге временным `modeId`-ренамом в общих типах — клиентские потребители чинятся в Task 11/12; если typecheck красный по клиенту — переименовать поле в клиентских типах сейчас, поведение в Task 11).

---

### Task 11: Schedules — клиент

**Files:**
- Modify: `apps/studio/client/src/entities/schedule/model/schedule.ts`, `schedule.store.ts`, `features/manage-schedule/model/schedule-draft.ts`, `create-schedule.ts`, `update-schedule.ts`, `ui/schedule-config-dialog.tsx`

**Interfaces:**
- Consumes: Task 10, Task 7 (режимы агента в сторе).
- Produces: `Schedule.modeId`; диалог выбирает режим из режимов агента, дефолт — дефолт агента.

- [ ] **Step 1: Сущность и draft**

`schedule.ts:54`: `modeId: string`; mapping (строка 72): `modeId: record.modeId ?? DEFAULT_MODE_ID`. Store (строки 11, 67): `modeId`. `schedule-draft.ts`: `mode: PermissionMode` → `modeId: string`; `MODE_LABELS` удаляются; дефолт draft (строка 49) — ставится при открытии диалога из агента, fallback `DEFAULT_MODE_ID`. `create/update-schedule.ts` пробрасывают `modeId`.

- [ ] **Step 2: Диалог**

`schedule-config-dialog.tsx:139-165`: label «Mode»; `items` — из `useAgentStore` по `draft.targetAgentId` (поле выбора агента в диалоге уже есть): `agent.modes.map((m) => ({ value: m.id, label: m.name }))`; при смене агента или открытии — `setDraft({ ...draft, modeId: agent.defaultModeId ?? DEFAULT_MODE_ID })`.

Run: `bun run --cwd apps/studio typecheck && bun run lint`
Expected: PASS.

agent-browser: расписание → выбор агента подставляет его дефолт-режим; select показывает режимы агента; fire (ручной peek/крон) шлёт `modeId` — тред сохраняет его как runMode.

---

### Task 12: Композер — режимы агента

**Files:**
- Modify: `apps/studio/client/src/widgets/chat-composer/model/composer-mode.ts`, `ui/mode-select.tsx`, `ui/chat-composer.tsx`

**Interfaces:**
- Consumes: Tasks 7, 10, 11.
- Produces: `ModeSelect({ modes, value, disabled, onChange })` со `modes: { value: string; label: string; detail?: string }[]`; `ComposerMode = string`.

- [ ] **Step 1: Модель**

`composer-mode.ts` переписать: удалить `COMPOSER_MODES`, `isComposerMode`, `runnableMode`; `export type ComposerMode = string;` + хелпер

```ts
export function composerModeItems(modes: AgentMode[]): { value: string; label: string; detail: string }[] {
  return modes.map((m) => ({ value: m.id, label: m.name, detail: m.description ?? '' }));
}
export function knownMode(modes: AgentMode[], id: string | null | undefined): boolean {
  return typeof id === 'string' && (id === DEFAULT_MODE_ID || modes.some((m) => m.id === id));
}
```

- [ ] **Step 2: Селект и фолбэк**

`mode-select.tsx`: props `modes` вместо `COMPOSER_MODES`, иконка общая (`CircleDollarSignIcon` → нейтральная `ShieldIcon`), radio-value без guard-а (`onChange(next)` всегда). `chat-composer.tsx`: `useState<ComposerMode>(DEFAULT_MODE_ID)`; effect (строки 108-116):

```tsx
const agentModes = agent?.modes ?? [];
useEffect(() => {
  if (scheduleMode && knownMode(agentModes, scheduleMode)) { setMode(scheduleMode); return; }
  if (knownMode(agentModes, thread?.runMode)) { setMode(thread.runMode); return; }
  if (knownMode(agentModes, agent?.defaultModeId)) { setMode(agent.defaultModeId); return; }
  setMode(DEFAULT_MODE_ID);
}, [thread?.runMode, scheduleMode, agent?.defaultModeId, agent?.modes]);
```

`scheduleMode` из стора теперь `modeId` (Task 11). `submit` (строка 305): `mode` как есть, `runnableMode` удалить.

Run: `bun run --cwd apps/studio typecheck && bun run lint`
Expected: PASS.

agent-browser: селект показывает режимы агента; смена агента/треда подставляет правильный фолбэк; выбор кастомного режима и отправка — тред хранит id (GET /threads).

---

### Task 13: Settings — панель Mode Presets + API клиента

**Files:**
- Create: `apps/studio/client/src/shared/api/mode-presets.ts`
- Create: `apps/studio/client/src/pages/settings/ui/mode-presets-pane.tsx` + редактор-диалог
- Modify: `apps/studio/client/src/pages/settings/ui/settings-page.tsx` (нав), `features/manage-agent/ui/agent-modes-pane.tsx` (включить Add from preset из Task 7)

**Interfaces:**
- Consumes: Task 4.
- Produces: `modePresetsQuery`, `createModePreset`, `updateModePreset`, `deleteModePreset`; панель пресетов; кнопка Add from preset в Modes-табе.

- [ ] **Step 1: API**

```ts
export type ModePresetRecord = ModePreset; // из @harnesys/studio-shared
export const modePresetsQuery = queryOptions({ queryKey: ['mode-presets'], queryFn: listModePresets });
export function listModePresets() { return apiJson<ModePresetRecord[]>('/api/mode-presets'); }
export function createModePreset(body: ModePresetBody): Promise<ModePresetRecord> { /* POST */ }
export function updateModePreset(id: string, body: Partial<ModePresetBody>): Promise<ModePresetRecord> { /* PATCH */ }
export function deleteModePreset(id: string): Promise<void> { /* DELETE */ }
```

- [ ] **Step 2: Панель**

По образцу `tools-pane.tsx`/`skills-pane.tsx`: таблица (name, id, description, гейты-бейджи, packs, builtin-бейдж, installedByDefault Switch → PATCH), Create / Duplicate (копия с `id` = `${id}-copy`, пустым builtin) / Edit (диалог с теми же полями, что редактор режима в Task 7, но паки из полного каталога, скиллы из workspace skills) / Delete (builtin — кнопка disabled). Нав в `settings-page.tsx` — «Mode Presets» рядом с Tools.

- [ ] **Step 3: Add from preset в агенте**

В `agent-modes-pane.tsx`: dropdown `modePresetsQuery` − уже установленные id → `append(modeToFields(modeFromPreset(preset)))` с `id: preset.id`; установка второго с тем же id блокируется (уникальность-refine схемы).

Run: `bun run --cwd apps/studio typecheck && bun run lint`
Expected: PASS.

agent-browser: Settings → Mode Presets: создать, дублировать, отредактировать, удалить; builtin нельзя удалить; тумблер installedByDefault → новый агент получает пресет (Modes-таб). В агенте: Add from preset копирует пресет.

---

### Task 14: Зачистка имён + финальная матрица

**Files:**
- Modify: `apps/studio/shared/types.ts` (удалить `RUN_MODES`/`RunMode`, реэкспорт `PERMISSION_MODES`/`PermissionMode`, если не осталось потребителей)
- Modify: `apps/studio/server/src/adapters/tool-confirm-policy.ts` (удалить `permissionMapFor`, `isRunMode`, `isPermissionMode`, `MUTATE_OPS`-импорты, если мертвы)
- Modify: `apps/studio/client/src/shared/api/index.ts` (экспорт нового API), прочие consume-точки, подсвеченные typecheck'ом
- Modify: спека — Status → implemented

- [ ] **Step 1: Удаление мёртвого**

Удалять по одному экспорту, каждый раз `bun run --cwd apps/studio typecheck` — красный список потребителей чинить переключением на shared-хелперы. `PERMISSION_MODES` в `harnesys/domain` (библиотека) не трогается.

- [ ] **Step 2: Полная проверка**

Run: `bun run lint && bun run --cwd apps/studio typecheck`
Expected: PASS.

curl-матрица на живом `3000`: тред агента (default `ask`) — run без mode → `202`, runMode `ask`; агент с default `auto` → runMode `auto`; `{"mode":"<кастомный id>"}` → сохраняется; `{"mode":"ghost"}` → дефолт агента; расписание с modeId → при fire runMode = modeId.

agent-browser-матрица: пресеты CRUD; Modes-таб (blank + from preset + default); композер (фолбэки, кастомный режим, отправка); план-режим (гейт, схемы plan-паков в контексте, писать нельзя); from-preset модалка (Task 0); расписание (селект режимов + дефолт).

---

## Self-review

- Spec coverage: Decisions 1–3 → Tasks 3–7; 4 → Task 8 (резолвер), 12 (фолбэк); 5 → Tasks 8, 14; 6 → Task 9; 7–8 → Tasks 2, 9; 9 → Task 8 (XML-блок, plan-текст из сида Task 3); 10 → Task 9; 11 → Tasks 10–11; 12 → Task 12; 13 → Task 0. Non-goals не нарушены: `graph-spawn`/`tool-permission`/`sandbox` не трогаются.
- Placeholder scan: каждый шаг содержит код или точный адрес правки; единственные «grep-шаги» (passthrough Task 2 Step 3, маунт Task 4 Step 3) указывают файлы-образцы и симметричное поле.
- Type consistency: `defaultModeId`/`modes` одинаково в shared, домене, зоде и клиенте; `runMode` — string везде после Task 8; `modeId` в schedules после Task 10–11; `ModePreset`/`AgentMode`/`ModeOpPermissions` — единственные имена, импортируемые из `@harnesys/studio-shared`.
- Известный компромисс: `agent-modes-pane.tsx` зависит от Task 13 (Add from preset) — финальная проверка вкладки в Task 13 Step 3.
