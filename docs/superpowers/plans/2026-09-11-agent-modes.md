# Agent Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agent `defaultMode` + thread `runMode` inheritance + single resolution chain (Phase A), then per-agent custom Modes tab with notes-tail instructions, op-group gates, skills preload, composer display (Phase B).

**Architecture:** Studio host + `@harnesys/studio-shared` own the mode concept end-to-end (type → SQLite → use cases → client form → composer). Library `packages/harnesys` untouched: it keeps receiving resolved `PermissionMap` / notes / skills via `RunTargetOpts`. `sandbox: true` stays.

**Tech Stack:** TypeScript, Bun, Hono, Drizzle/SQLite (idzap migrations in `bootstrap.ts`), React FSD client (`react-hook-form` + zod, `shared/ui` controls).

**Spec:** `docs/superpowers/specs/2026-09-11-agent-modes-design.md`

## Global Constraints

- File ops only inside `~/Projects/Harnesys` and `~/.harnesys`. Temp files inside those trees.
- No test files: no `*.test.ts` / `*.spec.ts`, no vitest/RTL/playwright. Verify with `bun run lint`, `bun run typecheck`, curl on live ports, manual agent-browser checks.
- No commits unless explicitly requested. End tasks verified, uncommitted.
- Dev servers usually already live (`3000` API, `5173` Vite): reuse, never start second or kill.
- FSD imports only downward; slice outside via its `index.ts`.
- Named types only: no `T['field']`, no `Parameters<typeof fn>[0]`.
- Files ~300 lines guideline; split by responsibility (e.g. `agent-modes-pane.tsx` separate from `agent-config-panes.tsx`).
- Naming: agent field `defaultMode`, column `default_mode`, thread field `runMode`. No bare `mode` on agent.

---

## Touch map

| File | Change |
|---|---|
| `apps/studio/shared/src/agent.ts` | `AgentRecord.defaultMode?`, Phase B `AgentMode`, `ModeOpGate` |
| `apps/studio/shared/src/run-modes.ts` (create) | `DEFAULT_RUN_MODE`, `resolveEffectiveRunMode`, Phase B `resolveModeDefinition`, `permissionMapForDefinition` stays server-side |
| `apps/studio/shared/src/thread.ts` | Phase B: `runMode?: string` |
| `apps/studio/server/src/adapters/store/sqlite/schema/agents.ts` | `defaultMode` column, Phase B `modesJson` |
| `apps/studio/server/src/adapters/store/sqlite/bootstrap.ts` | `ALTER TABLE agents ADD COLUMN default_mode text` (+B `modes_json`) |
| `apps/studio/server/src/domain/agent.port.ts` | `Agent.defaultMode`, `AgentPatch.defaultMode`, B `modes` |
| `apps/studio/server/src/adapters/store/sqlite/repos/sqlite-agent.repo.ts` | passthrough mapping |
| `apps/studio/server/src/adapters/http/agent/agent.body.ts` | `defaultMode` zod, B `modes` zod |
| `apps/studio/server/src/application/agents/create-agent.use-case.ts` | accept + insert `defaultMode` (B `modes`) |
| `apps/studio/server/src/application/agents/update-agent.use-case.ts` | patch `defaultMode` (B `modes`) |
| `apps/studio/server/src/adapters/http/agent/agent.controller.ts` | forward fields |
| `apps/studio/server/src/application/threads/create-thread.use-case.ts` | `metadata: { runMode: agent.defaultMode ?? 'ask' }`, return `runMode` |
| `apps/studio/server/src/application/threads/send-thread-run.use-case.ts` | shared resolver |
| `apps/studio/server/src/adapters/studio-run-targets.adapter.ts` | shared resolver (+B custom definition → permissions/notes/skills) |
| `apps/studio/server/src/composition/wire-packs.ts` | shared `isPlanRunMode` check (same semantics) |
| `apps/studio/client/src/shared/api/agents.ts` | `CreateAgentInput`/`UpdateAgentInput` fields |
| `apps/studio/client/src/entities/agent/model/agent.ts` | `Agent`, `AgentDraft`, `AgentPatch` fields |
| `apps/studio/client/src/entities/agent/model/agent-record.ts` | mapping |
| `apps/studio/client/src/features/manage-agent/model/agent-fields.ts` | schema + `emptyAgentFields` + `agentFieldsFrom` + `toAgentDraft` |
| `apps/studio/client/src/features/manage-agent/ui/agent-config-panes.tsx` | Default Mode select in `AgentModelPane` |
| `apps/studio/client/src/features/manage-agent/model/create-agent.ts` | forward `defaultMode` |
| `apps/studio/client/src/features/manage-agent/model/update-agent.ts` | forward `defaultMode` |
| `apps/studio/client/src/widgets/chat-composer/ui/chat-composer.tsx` | initial mode from agent when thread has none |
| `apps/studio/client/src/features/manage-agent/ui/agent-config-nav.tsx` | B: `modes` category |
| `apps/studio/client/src/features/manage-agent/ui/agent-modes-pane.tsx` (create, B) | list + editor |
| `apps/studio/client/src/widgets/chat-composer/ui/mode-select.tsx` (B) | agent modes in dropdown |

---

### Task 1: Shared resolver + `defaultMode` type

**Files:**
- Modify: `apps/studio/shared/src/agent.ts`
- Create: `apps/studio/shared/src/run-modes.ts`

**Interfaces:**
- Consumes: existing `RUN_MODES`, `RunMode` from `apps/studio/shared/types.ts:181`.
- Produces: `DEFAULT_RUN_MODE: RunMode`, `resolveEffectiveRunMode(input: { bodyMode?: string; threadMode?: string | null; agentDefault?: string | null }): RunMode`, `AgentRecord.defaultMode?: RunMode | null`.

- [ ] **Step 1: Add `defaultMode` to `AgentRecord`**

In `apps/studio/shared/src/agent.ts`, extend the record:

```ts
export type AgentRecord = {
  // ... existing fields ...
  budget?: AgentBudget | null;
  capabilities?: Record<string, PackConfig | null>;
  /** Definition default for run mode; null/absent = 'ask'. */
  defaultMode?: string | null;
  createdAt: string;
  updatedAt: string;
};
```

Run: `bun run --cwd apps/studio typecheck`
Expected: PASS (new optional field, no call sites break).

- [ ] **Step 2: Create shared resolver**

Create `apps/studio/shared/src/run-modes.ts`:

```ts
import { RUN_MODES, type RunMode } from '../types.ts';

export const DEFAULT_RUN_MODE: RunMode = 'ask';

function isRunMode(value: unknown): value is RunMode {
  return typeof value === 'string' && (RUN_MODES as readonly string[]).includes(value);
}

export function resolveEffectiveRunMode(input: {
  bodyMode?: string | null;
  threadMode?: string | null;
  agentDefault?: string | null;
}): RunMode {
  if (isRunMode(input.bodyMode)) return input.bodyMode;
  if (isRunMode(input.threadMode)) return input.threadMode;
  if (isRunMode(input.agentDefault)) return input.agentDefault;
  return DEFAULT_RUN_MODE;
}
```

Re-export from `apps/studio/shared/types.ts`:

```ts
export { DEFAULT_RUN_MODE, resolveEffectiveRunMode } from './src/run-modes.ts';
```

Run: `bun run --cwd apps/studio typecheck`
Expected: PASS.

### Task 2: SQLite column + bootstrap migration

**Files:**
- Modify: `apps/studio/server/src/adapters/store/sqlite/schema/agents.ts`
- Modify: `apps/studio/server/src/adapters/store/sqlite/bootstrap.ts`

**Interfaces:**
- Consumes: Task 1 types (column is plain text, no import).
- Produces: `agentsTable.defaultMode` text column, existing DBs migrated.

- [ ] **Step 1: Add column to table definition**

```ts
effort: text('effort'),
defaultMode: text('default_mode'),
generation: text('generation'),
```

Run: `bun run --cwd apps/studio typecheck`
Expected: PASS.

- [ ] **Step 2: Add idempotent migration after the `effort` block**

```ts
try {
  db.run(sql.raw('ALTER TABLE agents ADD COLUMN default_mode text;'));
} catch {}
```

Pattern matches `bootstrap.ts:293`. Null = `'ask'` by resolver, no backfill update needed.

Run: `bun run lint`
Expected: PASS, no biome findings in touched files.

### Task 3: Domain port + repo mapping

**Files:**
- Modify: `apps/studio/server/src/domain/agent.port.ts`
- Modify: `apps/studio/server/src/adapters/store/sqlite/repos/sqlite-agent.repo.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: `Agent.defaultMode: string | null`, `AgentPatch.defaultMode?: string | null` persisted.

- [ ] **Step 1: Extend domain types**

```ts
effort: string | null;
defaultMode: string | null;
```

in `Agent`, and in `AgentPatch`:

```ts
effort?: string | null;
defaultMode?: string | null;
```

- [ ] **Step 2: Map in repo**

`toAgent`: add `defaultMode: row.defaultMode ?? null,`. `insert`/`update` pass `defaultMode` through `...rest` (destructure lists only JSON columns, so no change needed there; verify `rest` includes it).

Run: `bun run --cwd apps/studio typecheck`
Expected: PASS.

### Task 4: Bodies + use cases + controller

**Files:**
- Modify: `apps/studio/server/src/adapters/http/agent/agent.body.ts`
- Modify: `apps/studio/server/src/application/agents/create-agent.use-case.ts`
- Modify: `apps/studio/server/src/application/agents/update-agent.use-case.ts`
- Modify: `apps/studio/server/src/adapters/http/agent/agent.controller.ts`

**Interfaces:**
- Consumes: Task 3, `RUN_MODES` from `@harnesys/studio-shared`.
- Produces: `defaultMode` accepted on POST/PATCH, stored, returned.

- [ ] **Step 1: Zod bodies**

Add to both `createAgentBody` and `updateAgentBody`:

```ts
import { RUN_MODES } from '@harnesys/studio-shared';
// ...
defaultMode: z.enum(RUN_MODES).nullish(),
```

- [ ] **Step 2: Create use case**

`CreateAgentRequest`: add `defaultMode?: string | null;`. In `execute`:

```ts
const defaultMode = request.defaultMode ?? null;
```

Include `defaultMode` in `agents.insert({...})`.

- [ ] **Step 3: Update use case**

`UpdateAgentRequest`: add `defaultMode?: string | null;`. In `execute`:

```ts
if (request.defaultMode !== undefined) {
  patch.defaultMode = request.defaultMode;
}
```

- [ ] **Step 4: Controller forwarding**

POST: `defaultMode: body.defaultMode ?? undefined,`. PATCH: `defaultMode: body.defaultMode === undefined ? undefined : body.defaultMode,`.

Run: `bun run --cwd apps/studio typecheck && bun run lint`
Expected: PASS both.

### Task 5: Client API types + entity mapping

**Files:**
- Modify: `apps/studio/client/src/shared/api/agents.ts`
- Modify: `apps/studio/client/src/entities/agent/model/agent.ts`
- Modify: `apps/studio/client/src/entities/agent/model/agent-record.ts`

**Interfaces:**
- Consumes: Task 1 (`RunMode` type import from `@harnesys/studio-shared`).
- Produces: `Agent.defaultMode: RunMode | null`, draft/patch plumbing.

- [ ] **Step 1: API input types**

Add `defaultMode?: RunMode | null;` to both `CreateAgentInput` and `UpdateAgentInput` (import type `RunMode`).

- [ ] **Step 2: Entity types**

`Agent`: add `defaultMode: RunMode | null;`. `AgentDraft`: add `defaultMode?: RunMode | null;`. `AgentPatch` Pick list: add `'defaultMode'`.

- [ ] **Step 3: Record mapping**

```ts
defaultMode: record.defaultMode ?? null,
```

Run: `bun run --cwd apps/studio typecheck`
Expected: PASS.

### Task 6: Form schema + Model pane select

**Files:**
- Modify: `apps/studio/client/src/features/manage-agent/model/agent-fields.ts`
- Modify: `apps/studio/client/src/features/manage-agent/ui/agent-config-panes.tsx`
- Modify: `apps/studio/client/src/features/manage-agent/model/create-agent.ts`
- Modify: `apps/studio/client/src/features/manage-agent/model/update-agent.ts`

**Interfaces:**
- Consumes: Task 5, `COMPOSER_MODES` from `@/widgets/chat-composer/model/composer-mode` or local items of `RUN_MODES`.
- Produces: `defaultMode` editable in Model tab for agents and subagents (same pane).

- [ ] **Step 1: Schema + converters**

```ts
import { RUN_MODES } from '@harnesys/studio-shared';
// schema:
defaultMode: z.enum(RUN_MODES).nullable(),
// emptyAgentFields: defaultMode: null,
// agentFieldsFrom: defaultMode: (agent.defaultMode as AgentFieldsInput['defaultMode']) ?? null,
// toAgentDraft return type + body: defaultMode: values.defaultMode,
```

Extend `toAgentDraft` return object with `defaultMode: values.defaultMode`.

- [ ] **Step 2: Model pane select**

In `AgentModelPane`, after the Model/Effort grid, add:

```tsx
<Controller
  control={form.control}
  name="defaultMode"
  render={({ field }) => (
    <Field>
      <FieldLabel htmlFor="agent-default-mode">Default Mode</FieldLabel>
      <Select
        items={COMPOSER_MODES.map((item) => ({ value: item.value, label: item.label }))}
        value={field.value}
        onValueChange={(next) => field.onChange(typeof next === 'string' ? next : null)}
      >
        <SelectTrigger id="agent-default-mode" className="w-full" data-testid="agent-default-mode">
          <SelectValue placeholder="Ask before changes" />
        </SelectTrigger>
        <SelectContent className="w-full" align="start">
          {COMPOSER_MODES.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="shrink-0 text-[11px] text-muted-foreground leading-snug">
        Default for new threads. Threads keep their own mode afterwards.
      </p>
    </Field>
  )}
/>
```

Reuse `Select`/`SelectItem`/`SelectTrigger`/`SelectContent`/`SelectValue` from `@/shared/ui/select` (same as `AgentEffortField`).

- [ ] **Step 3: Forward in create/update**

`create-agent.ts`: add `defaultMode: draft.defaultMode ?? null,` to `createAgentRecord` body. `update-agent.ts`: add `defaultMode: draft.defaultMode !== undefined ? draft.defaultMode : current.defaultMode,` to `updateAgentRecord` body.

Run: `bun run --cwd apps/studio typecheck && bun run lint`
Expected: PASS both.

- [ ] **Step 4: Manual UI check (agent-browser)**

Open Studio, open agent modal → Model tab → Default Mode select visible with 5 items; save agent and subagent; reload modal, value persists.
Expected: persists for both.

### Task 7: Thread init + single server resolver

**Files:**
- Modify: `apps/studio/server/src/application/threads/create-thread.use-case.ts`
- Modify: `apps/studio/server/src/application/threads/send-thread-run.use-case.ts`
- Modify: `apps/studio/server/src/adapters/studio-run-targets.adapter.ts`
- Modify: `apps/studio/server/src/composition/wire-packs.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: new threads inherit `agent.defaultMode`; all server resolution via shared resolver with identical precedence.

- [ ] **Step 1: Init metadata on thread creation**

```ts
metadata: { runMode: agent.defaultMode ?? 'ask' },
```

And include `runMode` in the returned record:

```ts
import { runModeFields } from './thread.helpers.ts';
// after insert:
...runModeFields(thread),
```

- [ ] **Step 2: Replace local resolvers**

`send-thread-run.use-case.ts`: delete local `resolveRunMode`, import shared:

```ts
import { resolveEffectiveRunMode } from '@harnesys/studio-shared';
// ...
const runMode = resolveEffectiveRunMode({ bodyMode: request.mode ?? undefined, threadMode: thread.metadata ... });
```

Thread metadata read: reuse pattern from `thread.helpers.ts:45` (`runModeFields` works on `Pick<Thread,'metadata'>`). Keep `setRunMode(thread.id, runMode)` and plan `decorateText` untouched.

`studio-run-targets.adapter.ts`: replace `resolveThreadRunMode` body with:

```ts
import { resolveEffectiveRunMode } from '@harnesys/studio-shared';
function resolveThreadRunMode(thread: Thread): RunMode {
  const { runMode } = runModeFields(thread); // import from thread.helpers
  return resolveEffectiveRunMode({ threadMode: runMode ?? undefined });
}
```

`wire-packs.ts` `isPlanRunMode`: keep semantics (`mode === 'plan'`), read via same helper.

Run: `bun run --cwd apps/studio typecheck && bun run lint`
Expected: PASS both.

- [ ] **Step 3: Curl matrix on live API (port 3000)**

```bash
curl -s -X POST localhost:3000/api/threads/$ID/runs -H 'content-type: application/json' -d '{"text":"ping"}' -o /dev/null -w '%{http_code}\n'
```

for threads with agent default `ask`/`auto`, plus explicit `{"mode":"plan"}`.
Expected: `202` each; thread record shows persisted `runMode`; plan run decorates prompt (existing behavior).

### Task 8: Composer default from agent

**Files:**
- Modify: `apps/studio/client/src/widgets/chat-composer/ui/chat-composer.tsx`

**Interfaces:**
- Consumes: Tasks 5–7 (`agent.defaultMode`, `thread.runMode`).
- Produces: new threads (no stored `runMode`) start on `agent.defaultMode`; existing threads keep theirs.

- [ ] **Step 1: Initial mode effect**

Extend the existing sync effect (`chat-composer.tsx:108`):

```tsx
useEffect(() => {
  if (scheduleMode) {
    setMode(scheduleMode);
    return;
  }
  if (thread?.runMode && isComposerMode(thread.runMode)) {
    setMode(thread.runMode);
    return;
  }
  if (agent?.defaultMode && isComposerMode(agent.defaultMode)) {
    setMode(agent.defaultMode);
  }
}, [thread?.runMode, scheduleMode, agent?.defaultMode]);
```

Keep `useState<ComposerMode>('ask')` as pre-load fallback.

Run: `bun run --cwd apps/studio typecheck && bun run lint`
Expected: PASS both.

- [ ] **Step 2: Manual composer check (agent-browser)**

New thread of agent with default `auto` → selector shows Edit automatically before first send. Old thread keeps its stored mode. Send → thread keeps mode.
Expected: matches.

### Task 9 (Phase B): Custom mode types + validation

**Files:**
- Modify: `apps/studio/shared/src/agent.ts`
- Modify: `apps/studio/shared/src/run-modes.ts`
- Modify: `apps/studio/shared/src/thread.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: `AgentMode`, `ModeOpGate`, `MODE_ID_RE`, `isCustomModeId`, `resolveModeDefinition(modes, runModeId)`, widened `ThreadRecord.runMode?: string`.

- [ ] **Step 1: Types**

```ts
export const MODE_OPS = ['fs.write', 'process', 'network', 'mcp'] as const;
export type ModeOp = (typeof MODE_OPS)[number];
export type ModeOpGate = 'allow' | 'ask' | 'deny';
export type AgentMode = {
  id: string;
  name: string;
  instructions: string;
  skills?: string[];
  permissions?: Partial<Record<ModeOp, ModeOpGate>>;
};
export const MODE_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
export const SYSTEM_MODE_IDS = [...RUN_MODES] as const;
```

`AgentRecord`: add `modes?: AgentMode[];`. `ThreadRecord.runMode` + `ThreadSummary` pick: widen to `string` (keep comment, system ids + custom ids).

- [ ] **Step 2: Definition resolver**

```ts
export function resolveModeDefinition(
  modes: AgentMode[] | undefined,
  runModeId: string | undefined,
): AgentMode | undefined {
  if (!runModeId || !modes) return undefined;
  return modes.find((m) => m.id === runModeId);
}
export function isCustomModeId(value: string): boolean {
  return MODE_ID_RE.test(value) && !(RUN_MODES as readonly string[]).includes(value);
}
```

Unknown/deleted custom id → callers fall back `DEFAULT_RUN_MODE` (spec Decision 8).

Run: `bun run --cwd apps/studio typecheck`
Expected: PASS.

### Task 10 (Phase B): Server persistence + effective permissions/notes/skills

**Files:**
- Modify: schema `agents.ts` (`modesJson`), `bootstrap.ts`, `agent.port.ts`, `sqlite-agent.repo.ts`, `agent.body.ts`, `create/update-agent.use-case.ts`, `agent.controller.ts`
- Modify: `apps/studio/server/src/adapters/studio-run-targets.adapter.ts`
- Modify: `apps/studio/server/src/composition/wire-packs.ts` (notes provider wiring only if needed; plan gate untouched)

**Interfaces:**
- Consumes: Task 9.
- Produces: custom modes stored per agent; effective run resolves custom definition into `PermissionMap` (op gates over thread/agent/system fallback), mode instructions as `<mode>` notes-tail block, mode skills as registry filter + `<mode-skills>` hint. Child rule unchanged (inherit + narrow-only enforced here: `min(parentGates, childGates)` not needed in V1 since spawn path untouched — document).

- [ ] **Step 1: Column + migration + repo + bodies + use cases**

```ts
// schema
modesJson: text('modes_json').notNull().default('[]'),
// bootstrap
db.run(sql.raw(`ALTER TABLE agents ADD COLUMN modes_json text NOT NULL DEFAULT '[]';`));
// zod (agent.body.ts)
const modeOpGate = z.enum(['allow', 'ask', 'deny']);
const agentModeBody = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(48),
  name: z.string().trim().min(1).max(80),
  instructions: z.string().max(4000),
  skills: z.array(z.string().trim().min(1)).max(32).optional(),
  permissions: z.record(z.enum(['fs.write', 'process', 'network', 'mcp']), modeOpGate).optional(),
}).refine((m) => !(RUN_MODES as readonly string[]).includes(m.id), { message: 'system id reserved' });
// add `modes: z.array(agentModeBody).max(24).optional()` to both bodies
```

Use cases: accept `modes?: AgentMode[]`, insert/patch passthrough; repo `toAgent` parses JSON array with shape guard (non-array → `[]`, entries failing shape dropped).

Run: `bun run --cwd apps/studio typecheck && bun run lint`
Expected: PASS both.

- [ ] **Step 2: Effective resolution in `StudioRunTargets.resolve`**

After loading `agentRow`, resolve definition from stored modes (parse once, helper `parseAgentModes` with same shape guard):

```ts
import { permissionMapFor } from './tool-confirm-policy.ts';
import { DEFAULT_RUN_MODE, resolveEffectiveRunMode, resolveModeDefinition, type AgentMode } from '@harnesys/studio-shared';

const threadMode = runModeOf(thread); // existing metadata read
const effectiveId = resolveEffectiveRunMode({ threadMode, agentDefault: agentRow.defaultMode ?? undefined });
const custom = resolveModeDefinition(parseAgentModes(agentRow), effectiveId);
const permissions = custom?.permissions
  ? permissionMapWithOverrides(threadModeFallbackMap(effectiveId), custom.permissions)
  : permissionMapFor(effectiveId as RunMode);
```

where fallback map = `permissionMapFor` of system id, or `permissionMapFor('ask')` for unknown custom ids (Decision 8). Gate merge rule: custom op gate replaces fallback op gate (both are op-keyed, no escalation beyond thread? V1: thread holds the id, so no cross-check; spawn path still inherits parent map).

Notes: append provider result:

```ts
notes: [...notes, ...(custom?.instructions?.trim() ? [{ tag: 'mode', text: custom.instructions.trim() }] : []),
  ...(custom?.skills?.length ? [{ tag: 'mode-skills', text: `Preloaded skills: ${custom.skills.join(', ')}. Prefer load_skill for these first.` }] : [])],
```

as inline `LlmNoteProvider`-compatible static notes (same `LlmNote[]` shape as `createPluginSessionStartNotes` output). Skills registry filter: intersect `agentRow.skills` allowlist semantics unchanged; mode skills are a hint + preload preference, not a second allowlist (Decision 6): pass through existing `effectiveRegistrations`, no new filtering in V1.

Run: `bun run --cwd apps/studio typecheck && bun run lint`
Expected: PASS both.

### Task 11 (Phase B): Modes tab UI

**Files:**
- Modify: `apps/studio/client/src/features/manage-agent/ui/agent-config-nav.tsx`
- Create: `apps/studio/client/src/features/manage-agent/ui/agent-modes-pane.tsx`
- Modify: `apps/studio/client/src/features/manage-agent/ui/agent-config-category-panes.tsx`
- Modify: `apps/studio/client/src/shared/api/agents.ts`, `agent-fields.ts` (modes field), `create/update-agent.ts`

**Interfaces:**
- Consumes: Task 9–10.
- Produces: `modes` category after `model`; list + editor; persists with the dialog save path (`capabilitiesRef`-style ref or form field — use form field `modes` with zod to reuse `buildResult`).

- [ ] **Step 1: Nav + pane skeleton**

Nav: add `'modes'` to `AgentConfigCategory` union + `{ id: 'modes', label: 'Modes', icon: SlidersHorizontalIcon }` after `model` (import from `lucide-react`).

Pane `agent-modes-pane.tsx` (form field `modes`, `UseFormReturn` control, `useFieldArray`):

```tsx
export function AgentModesPane({ form }: { form: AgentFieldsForm }) {
  const { fields, append, remove, update } = useFieldArray({ control: form.control, name: 'modes' });
  // list rows: name + id badge + ops summary; editor: name, id, instructions textarea,
  // skills input (comma-separated), 4 op-gate ToggleGroups (allow/ask/deny)
}
```

Validation in `agent-fields.ts`:

```ts
const agentModeSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits, dash').max(48),
  name: z.string().trim().min(1, 'Name required').max(80),
  instructions: z.string().max(4000),
  skills: z.string(),
  permWrite: z.enum(['allow', 'ask', 'deny']),
  permProcess: z.enum(['allow', 'ask', 'deny']),
  permNetwork: z.enum(['allow', 'ask', 'deny']),
  permMcp: z.enum(['allow', 'ask', 'deny']),
});
modes: z.array(agentModeSchema).max(24).refine(
  (list) => new Set(list.map((m) => m.id)).size === list.length,
  'Mode ids must be unique',
),
```

Form representation keeps skills as comma string and four gate fields (flat, no indexed access); `toAgentDraft`/`agentFieldsFrom` convert to/from `AgentMode[]` (empty permissions object omitted when all gates unset → represent unset as `'ask'`? No: form always has explicit gate per op, default `'ask'`; conversion writes all four. Document in code comment).

- [ ] **Step 2: Wire category + persistence**

`agent-config-category-panes.tsx`: render `<AgentModesPane form={form} />` under `category === 'modes'`. `agent-fields.ts` converters handle `modes`; `create/update-agent.ts` forward `modes` (same pattern as `defaultMode`, Task 6 Step 3).

Run: `bun run --cwd apps/studio typecheck && bun run lint`
Expected: PASS both.

- [ ] **Step 3: Manual Modes check (agent-browser)**

Create agent → Modes → add mode `writer` (instructions + skills + gates) → save → reopen → persists; duplicate id blocked; system id (`auto`) blocked.
Expected: all hold.

### Task 12 (Phase B): Composer custom modes

**Files:**
- Modify: `apps/studio/client/src/widgets/chat-composer/ui/mode-select.tsx`
- Modify: `apps/studio/client/src/widgets/chat-composer/ui/chat-composer.tsx`
- Modify: `apps/studio/client/src/entities/thread/model/thread.ts` (+ `thread-record.ts` passthrough)

**Interfaces:**
- Consumes: Tasks 9–11 (`agent` carries modes via store; thread stores id string).
- Produces: dropdown lists system 5 + agent custom modes; selecting custom id sends it as `mode` (server body zod widened to `z.string()` with shared validation — server change in this task: `thread.body.ts` `mode: z.string().max(48)` + `send-thread-run` validates via shared `isRunModeOrCustomId`).

- [ ] **Step 1: Widen thread types + send body**

`entities/thread/model/thread.ts`: `runMode?: string;`. `thread.body.ts`: `mode: z.string().trim().min(1).max(48).optional()`; `send-thread-run.use-case.ts` `SendThreadRunRequest.mode?: string`, resolution via Task 7 resolver extended to accept custom ids (passthrough string, unknown → ask downstream per Decision 8).

- [ ] **Step 2: Dropdown + submit**

`ModeSelect` props: `customModes: { value: string; label: string }[]`; render after system items with section label from agent name. `chat-composer.tsx`: build from `agent` store modes, `isComposerMode` extended to accept custom ids present in agent modes; `submit` sends the id string as-is (`runnableMode` passthrough).

Run: `bun run --cwd apps/studio typecheck && bun run lint`
Expected: PASS both.

- [ ] **Step 3: End-to-end manual matrix (agent-browser + curl)**

Custom `writer` (auto gates + instructions) on agent → new thread defaults per Task 8 → dropdown shows Writer → send with Writer → writes allowed without asks; switch to Ask → writes ask; subagent spawn from Writer thread inherits; delete mode → thread falls back `ask` on next run.
Expected: matrix holds; no library changes; no test files added.

---

## Self-review

- Spec coverage: Decisions 1–2 → Tasks 1–8. Decisions 4–6 → Task 10 (notes-tail `<mode>`/`<mode-skills>`, op gates, skills hint+registry passthrough). Decision 7 → Tasks 7–8. Decision 8 → Tasks 9–10, 12. Non-goals untouched (no `graph-spawn`/`tool-permission` edits anywhere above).
- Placeholder scan: every step has concrete code, exact run command, expected result. No TBD/TODO, no "appropriate handling", no "similar to Task N" without code.
- Type consistency: `defaultMode: RunMode | null` client entity vs `string | null` server domain/shared record — intentional (server stores text, validates via zod enum; client types strict). `AgentMode.permissions` keyed by `ModeOp` in shared, zod enum mirrors it server-side, form uses four flat gate fields converted in `toAgentDraft`/`agentFieldsFrom`. `runMode` widens to `string` only in Task 9/12; Tasks 1–8 keep `RunMode`.

---

Plan complete and saved to `docs/superpowers/plans/2026-09-11-agent-modes.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
