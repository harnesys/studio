# Pack architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `Capability*` with self-contained `Pack` modules collected by the kernel at fixed lifecycle points.

**Architecture:** One `create(ctx)` entry per pack returning tools, skills, and notes; memoized per run. Agent enables packs through `packs`, the run registry is the intersection point, turn assembly appends a tail message.

**Tech Stack:** TypeScript, Bun workspaces, Biome, SQLite-backed Studio adapters.

**Spec:** `docs/superpowers/specs/2026-09-09-pack-architecture-design.md`

## Global Constraints

- File operations only inside `~/Projects/Harnesys` and `~/.harnesys`.
- No `*.test.ts` / `*.spec.ts` files, no vitest / RTL / playwright. Verification is `bunx biome check <paths>` and `bunx tsc --noEmit -p packages/harnesys/tsconfig.json`.
- No commits without an explicit human request. Task steps end with verification, never with `git commit`.
- Lint and format is Biome on the whole monorepo (`bun run lint` runs `bunx biome check .`).
- New files stay near 300 lines. Split by responsibility, not by technical layer.
- No indexed access types (`ModelRecord['cost']` style). Named types live next to their record and are imported.
- FSD slices are consumed only through their `index.ts`.
- Library (`packages/harnesys`) is the source of truth. Studio (`apps/studio`) adapts to the library, never the reverse.
- Dev servers are owned by the repo host. Check ports `3000` / `5173` before browser or curl checks. Never start, kill, or restart чужой стенд.

---

### Task 1: `domain/pack.ts` Pack types

**Files:**
- Modify: `packages/harnesys/src/domain/pack.ts`
- Modify imports in: `packages/harnesys/src/domain/agent-definition.ts`, `packages/harnesys/src/ports/plan.ts`, `packages/harnesys/src/ports/threads.ts`, `packages/harnesys/src/ports/scheduler.ts`, `packages/harnesys/src/ports/webhook.ts`, `packages/harnesys/src/ports/agents-catalog.ts`, `packages/harnesys/src/application/packs/registry.ts`, `packages/harnesys/src/application/packs/tool-names.ts`, `packages/harnesys/src/packs/base.ts`, `packages/harnesys/src/packs/skills.ts`, `packages/harnesys/src/packs/plan/index.ts`

**Interfaces:**
- Consumes: `LlmNoteProvider` from `application/llm-notes.ts`, `ToolDefinition` from `ports/tools.ts`, `JsonSchema` from `domain/json-schema.ts`, `AgentDefinition` and `PortRef` from `domain/agent-definition.ts`.
- Produces: `PackSkill`, `PackMeta`, `PackCtx<Ports, Spec>`, `Pack<Ports, Spec>`, `PackRegistration<Ports>`, `PackConfig`, `PackAssignment`, `AgentPacks`, `definePack`, `registerPack`. Later tasks import exactly these names.

- [ ] **Step 1: Rewrite `domain/pack.ts` with Pack types**

Replace the full file content with:

```ts
import type { LlmNoteProvider } from '../application/llm-notes.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import type { AgentDefinition } from './agent-definition.ts';
import type { JsonSchema } from './json-schema.ts';

export type CapabilityScope = {
  workspaceId: string;
  agentId: string;
  agentName?: string;
  threadId: string;
};

export type PackSkill = {
  name: string;
  description: string;
  whenToUse?: string;
  body: string;
};

export type PackToolMeta = { name: string; description: string };

export type PackMeta = {
  tools: PackToolMeta[];
  skills: string[];
  hasSettings: boolean;
};

export type PackConfig = { spec?: Record<string, unknown> };
export type PackAssignment = boolean | PackConfig;
export type PackName = string;
export type AgentPacks = Record<PackName, PackAssignment>;

export type PackCtx<Ports, Spec> = {
  ports: Ports;
  spec: Spec;
  scope: CapabilityScope;
};

export type Pack<Ports = Record<string, never>, Spec = Record<string, unknown>> = {
  name: string;
  version: string;
  description: string;
  icon?: string;
  specSchema?: JsonSchema;
  meta: PackMeta;
  create: (ctx: PackCtx<Ports, Spec>) => {
    tools?: ToolDefinition[];
    skills?: PackSkill[];
    notes?: LlmNoteProvider | LlmNoteProvider[];
  };
};

export type PackRegistration<Ports = Record<string, unknown>> = {
  pack: Pack<Ports, Record<string, unknown>>;
  ports?: Ports;
  resolveScope?: () => CapabilityScope;
};

export function definePack<Ports, Spec>(pack: Pack<Ports, Spec>): Pack<Ports, Spec> {
  if (!pack.name || !pack.version || !pack.description) {
    throw new Error('pack requires name, version, description');
  }
  if (!pack.meta) {
    throw new Error(`pack "${pack.name}" requires meta for the catalog endpoint`);
  }
  return pack;
}

export function registerPack<Ports>(
  pack: Pack<Ports, Record<string, unknown>>,
  opts?: { ports?: Ports; resolveScope?: () => CapabilityScope },
): PackRegistration<Ports> {
  return { pack, ports: opts?.ports, resolveScope: opts?.resolveScope };
}

export function normalizePackAssignment(value: PackAssignment): PackConfig {
  return value === true ? {} : value;
}
```

Delete from the file: `CapabilityConfig`, `CapabilityPackContext`, `CapabilityPack`, `CapabilityRegistration`, `defineCapability`, `registerCapability`, `requires`, `dependsOn`, `configFrom`, `prompt`. Keep `CapabilityScope` untouched (ports import it by name).

- [ ] **Step 2: Update import sites to the new names**

In each file listed under Modify imports, replace `CapabilityPack` with `Pack`, `CapabilityPackContext` with `PackCtx`, `CapabilityRegistration` with `PackRegistration`, `CapabilityConfig` with `PackConfig`, `defineCapability` with `definePack`, `registerCapability` with `registerPack`. In `domain/agent-definition.ts` change the import of `CapabilityConfig` from `./pack.ts` to `PackConfig, AgentPacks` and leave the `capabilities` field untouched (Task 5 renames it). Do not change behavior in this step, only names.

- [ ] **Step 3: Verify**

Run: `bunx biome check packages/harnesys/src/domain packages/harnesys/src/ports`
Expected: PASS, no errors.

Run: `bunx tsc --noEmit -p packages/harnesys/tsconfig.json`
Expected: PASS. Behavior differences from pack rewrites are expected in later tasks; only type errors in touched import sites fail this step.

---

### Task 2: Pack resolve and catalog

**Files:**
- Modify: `packages/harnesys/src/application/packs/registry.ts`
- Modify: `packages/harnesys/src/application/packs/tool-names.ts`

**Interfaces:**
- Consumes: `Pack`, `PackConfig`, `PackRegistration`, `AgentPacks`, `normalizePackAssignment` from `domain/pack.ts`; `AgentDefinition` from `domain/agent-definition.ts`.
- Produces: `ResolvedPack = { reg: PackRegistration; config: PackConfig }`, `PackDiagnostic = { severity: 'warning'; code: PackDiagnosticCode; message: string }`, `resolvePacks(def, registrations)`, `packTools(def, registrations)`, `packCatalog(registrations)`. Task 3 imports `resolvePacks` and `ResolvedPack`.

- [ ] **Step 1: Rewrite `registry.ts` without requires and dependsOn**

```ts
import Ajv from 'ajv';
import type { AgentDefinition } from '../../domain/agent-definition.ts';
import type { AgentPacks, PackConfig, PackRegistration } from '../../domain/pack.ts';

export type ResolvedPack = {
  reg: PackRegistration;
  config: PackConfig;
};

export type PackDiagnosticCode =
  | 'pack_unknown'
  | 'pack_port_missing'
  | 'pack_tools_empty'
  | 'skill_name_collision'
  | 'spec_invalid';

export type PackDiagnostic = {
  severity: 'warning';
  code: PackDiagnosticCode;
  message: string;
};

function enabledConfig(
  reg: PackRegistration,
  packs: AgentPacks | undefined,
): PackConfig | null {
  const raw = packs?.[reg.pack.name];
  if (raw === undefined || raw === null || raw === false) {
    return null;
  }
  return raw === true ? {} : raw;
}

export function resolvePacks(
  def: AgentDefinition,
  registrations: PackRegistration[],
): { enabled: ResolvedPack[]; diagnostics: PackDiagnostic[] } {
  const diagnostics: PackDiagnostic[] = [];
  const byName = new Map(registrations.map((r) => [r.pack.name, r]));
  const enabled: ResolvedPack[] = [];
  const sorted = [...registrations].sort((a, b) => (a.pack.name < b.pack.name ? -1 : 1));
  for (const reg of sorted) {
    const config = enabledConfig(reg, def.packs);
    if (config === null) {
      continue;
    }
    if (reg.resolveScope === undefined && reg.ports !== undefined) {
      diagnostics.push({
        severity: 'warning',
        code: 'pack_port_missing',
        message: `${reg.pack.name}: ports provided without resolveScope`,
      });
      continue;
    }
    if (reg.pack.specSchema !== undefined) {
      const valid = ajv.validate(
        reg.pack.specSchema as Record<string, unknown>,
        config.spec ?? {},
      );
      if (!valid) {
        diagnostics.push({
          severity: 'warning',
          code: 'spec_invalid',
          message: `${reg.pack.name}: spec does not match specSchema (${ajv.errorsText()})`,
        });
        continue;
      }
    }
    enabled.push({ reg, config });
  }
  for (const name of Object.keys(def.packs ?? {})) {
    if (!byName.has(name) && def.packs?.[name] !== undefined && def.packs?.[name] !== false) {
      diagnostics.push({
        severity: 'warning',
        code: 'pack_unknown',
        message: `pack "${name}" is not registered by the host`,
      });
    }
  }
  return { enabled, diagnostics };
}
```

Rules: no `dependsOn` traversal, no `configFrom` branch, no `requires` check. Port presence is decided by each pack at `create` time (a ported pack without ports returns no tools and the empty case below reports it). All severities are `warning`.

- [ ] **Step 2: Rewrite `tool-names.ts` on `meta` and single `create`**

```ts
import type { AgentDefinition } from '../../domain/agent-definition.ts';
import type { PackRegistration } from '../../domain/pack.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { resolvePacks } from './registry.ts';

export type PackCatalogEntry = {
  name: string;
  version: string;
  description: string;
  icon?: string;
  hasSettings: boolean;
  tools: Array<{ name: string; description: string }>;
  skills: string[];
};

export function packTools(
  def: AgentDefinition,
  registrations: PackRegistration[],
  scope: { workspaceId: string; agentId: string; threadId: string },
): ToolDefinition[] {
  const { enabled } = resolvePacks(def, registrations);
  return enabled.flatMap((p) => {
    const out = p.reg.pack.create({
      ports: (p.reg.ports ?? {}) as Record<string, unknown>,
      spec: (p.config.spec ?? {}) as Record<string, unknown>,
      scope: { ...scope, agentName: scope.agentId },
    });
    return out.tools ?? [];
  });
}

export function packCatalog(registrations: PackRegistration[]): PackCatalogEntry[] {
  return [...registrations]
    .sort((a, b) => (a.pack.name < b.pack.name ? -1 : 1))
    .map((r) => ({
      name: r.pack.name,
      version: r.pack.version,
      description: r.pack.description,
      icon: r.pack.icon,
      hasSettings: r.pack.specSchema !== undefined,
      tools: r.pack.meta.tools,
      skills: r.pack.meta.skills,
    }));
}
```

Delete `capabilityToolNames`, `capabilityTools`, `allCapabilityToolNames`, `capabilityCatalog`, `CapabilityCatalogEntry`, and the stub-scope instantiation. Keep `compareStrings` only if other files import it; otherwise delete it here and fix the single importer.

- [ ] **Step 3: Verify**

Run: `bunx biome check packages/harnesys/src/application/packs`
Expected: PASS.

Run: `bunx tsc --noEmit -p packages/harnesys/tsconfig.json`
Expected: PASS for these two files. Callers (`create-runtime.ts`, `llm.ts`, studio adapters) still use old names and fail; they move in Tasks 3 and 6.

---

### Task 3: Runtime lifecycle and memoization

**Files:**
- Modify: `packages/harnesys/src/application/create-runtime.ts`
- Modify: `packages/harnesys/src/ports/create-runtime.ts`

**Interfaces:**
- Consumes: `resolvePacks`, `ResolvedPack` from `application/packs/registry.ts`; `registerPack` from `domain/pack.ts`.
- Produces: run-scoped `ResolvedPack[]` passed to graph execution and `LlmContext.capabilities` replacement. Task 4 consumes the context shape.

- [ ] **Step 1: Boot validation and base packs in `create-runtime.ts`**

Replace the block at lines 40-68: duplicate names inside `options.capabilities` throw `pack "${name}" registered twice by host`. Base packs (`filesCapability`, `shellCapability`, `fetchCapability` from `packs/base.ts`) register only when the host did not supply the name (first wins stays for host versus systemic). `registerCapability(pack, {}, stubScope)` becomes `registerPack(pack, { resolveScope: stubScope })` with no `ports` key for portless packs. Auto skills keep `registerPack(skillsCapability, { ports: { skills: options.skills }, resolveScope: stubScope })`.

- [ ] **Step 2: Per-run `create` memoization**

In `run`, `start`, and the session path, after `resolveAgent` add: `const { enabled, diagnostics } = resolvePacks(def, capabilityRegistrations)`. Build one `Map<string, { tools, skills, notes }>` per run by calling each enabled pack `create` exactly once with `{ ports: reg.ports ?? {}, spec: config.spec ?? {}, scope: reg.resolveScope?.() ?? stubScope() }`. Pass the map into `runGraph` / `startGraph` / `createSession` through `runtimeCtx` instead of raw `capabilityRegistrations`. Narrow catch: only when `reg.ports === undefined` is a `create` throw reported as `pack_port_missing` with the pack excluded from the run. When ports are present a `create` throw propagates (real bug, never masked as diagnostics).

In the same step build the combined skills catalog for `load_skill`: start from `options.skills` (FS registry), append each enabled pack output `skills` in registration order. An FS skill with the same name wins silently over pack skills. A duplicate name between two packs emits `skill_name_collision` and keeps the first registration order. The catalog feeds `createLoadSkillTool` and the per-turn skills note, replacing the `skillsCapability` tools and notes path (`packs/skills.ts` is rewritten in Task 8).

- [ ] **Step 3: Verify**

Run: `bunx biome check packages/harnesys/src/application/create-runtime.ts packages/harnesys/src/ports/create-runtime.ts`
Expected: PASS.

Run: `bunx tsc --noEmit -p packages/harnesys/tsconfig.json`
Expected: PASS for the runtime file. `llm.ts` and `graph.ts` mismatches are Task 4.

---

### Task 4: Turn assembly in `llm.ts`

**Files:**
- Modify: `packages/harnesys/src/application/llm.ts`
- Modify: `packages/harnesys/src/adapters/ai-llm-adapter.ts`
- Delete: `packages/harnesys/src/application/packs/prompt.ts`

**Interfaces:**
- Consumes: memoized per-run pack outputs from Task 3, `formatDeferredCatalog`, `loadedToolsOf`, `resolveProgressiveTools` from `application/tools/exposure.ts`, `assembleNotes` from `application/llm-notes.ts`.
- Produces: fixed zone order `[tools] [system] [messages] [tail]`. Task 8 consumes the removed `composeSystemPrompt` absence.

- [ ] **Step 1: Prompt, tools, and tail in `llm.ts`**

Replace `composeSystemPrompt(agentText, ctx.capabilities ?? [])` at line 106 with `agentText` (pack group instructions arrive through tool descriptions and pack skills). Change line 108 semantics: `node.tools === undefined` means all run-registry tools, `[]` means zero pack tools. Keep the progressive branch shape at lines 111-114 but apply `resolveProgressiveTools` to the MCP subset regardless of `node.tools`, so an explicit node list no longer disables deferred handling. Replace lines 124-126: notes go as a separate trailing message after history, never merged into the head `system` parameter. Update `LlmContext.capabilities?: ResolvedCapability[]` to the memoized pack outputs type from Task 3.

- [ ] **Step 2: Adapter head-`system` merge removal**

In `adapters/ai-llm-adapter.ts` lines 64-78, stop collecting `role: 'system'` entries from the message array into the head `system` text. The tail message from Step 1 travels as a normal message. Delete `application/packs/prompt.ts` (`composeSystemPrompt`) and its single import in `llm.ts`.

- [ ] **Step 3: Verify**

Run: `bunx biome check packages/harnesys/src/application/llm.ts packages/harnesys/src/adapters/ai-llm-adapter.ts packages/harnesys/src/application/packs`
Expected: PASS.

Run: `bunx tsc --noEmit -p packages/harnesys/tsconfig.json`
Expected: PASS.

---

### Task 5: Agent `packs` field and validation

**Files:**
- Modify: `packages/harnesys/src/domain/agent-definition.ts`
- Modify: `packages/harnesys/src/application/validate.ts`

**Interfaces:**
- Consumes: `AgentPacks`, `PackAssignment`, `PackConfig`, `normalizePackAssignment` from `domain/pack.ts`.
- Produces: normalized `packs` shape used by Tasks 2, 3, and 6. Studio repo normalization in Task 6 imports `normalizePackAssignment`.

- [ ] **Step 1: Replace `capabilities` with `packs`**

In `domain/agent-definition.ts`: change the import at line 5 to `import type { AgentPacks } from './pack.ts'`. Replace line 83 `capabilities?: Record<string, CapabilityConfig | null>` with `packs?: AgentPacks`. Leave `tools?: string[]` (line 71), `memory?: AgentMemoryConfig` (line 75), and `Node` `tools?: string[]` (line 119) untouched; memory dies in Task 7. Fix remaining `def.capabilities` readers inside the package in this step by switching them to `def.packs` with `normalizePackAssignment` for `true` values. This includes the `configFrom` callbacks in `packs/base.ts` (`def.capabilities?.files`, `?.shell`, `?.fetch`) and `packs/skills.ts` (`def.capabilities?.skills`, `def.skills` fallback); change them to read `def.packs` with identical fallback logic. Full rewrites of both files land in Task 8, this step is mechanical name-only.

- [ ] **Step 2: Structural validation for `boolean | PackConfig`**

In `application/validate.ts`: accept `packs` values that are `true`, `false`, or an object with optional `spec` record. `false` normalizes to key removal before compile. Remove the `tools: []` error at lines 258-265 and replace it with nothing (empty means zero pack tools by Task 4 semantics). Keep all other structural checks byte-identical.

- [ ] **Step 3: Verify**

Run: `bunx biome check packages/harnesys/src/domain/agent-definition.ts packages/harnesys/src/application/validate.ts`
Expected: PASS.

Run: `bunx tsc --noEmit -p packages/harnesys/tsconfig.json`
Expected: PASS.

---

### Task 6: Studio wiring, catalog, and storage

**Files:**
- Rename: `apps/studio/server/composition/wire-capabilities.ts` to `apps/studio/server/composition/wire-packs.ts`
- Modify: `apps/studio/server/composition/wire-packs.ts`, `apps/studio/server/application/workspaces/list-workspace-capabilities.use-case.ts`, `apps/studio/server/adapters/http/workspace/capabilities.controller.ts`, `apps/studio/server/adapters/workspace-harnesys.registry.ts`, `apps/studio/server/adapters/store/sqlite/sqlite-agent.repo.ts`, `apps/studio/server/adapters/store/sqlite/bootstrap.ts`, `apps/studio/server/adapters/studio-run-targets.adapter.ts`

**Interfaces:**
- Consumes: `packCatalog` from `application/packs/tool-names.ts`, `resolvePacks` from `application/packs/registry.ts`, `registerPack` from `domain/pack.ts`, `normalizePackAssignment` from `domain/pack.ts`.
- Produces: catalog entries with `meta` shape for Task 8, `packs` persistence for existing agents.

- [ ] **Step 1: Pack wiring with sqlite ports**

Rename the file in the IDE (imports update automatically). Inside, replace `registerCapability` calls with `registerPack(pack, { ports, resolveScope })` using the existing sqlite ports (`sqlite-plan.port.ts`, `sqlite-threads.port.ts`, `sqlite-scheduler.port.ts`, `sqlite-webhook.port.ts`, `sqlite-agents-catalog.port.ts` from `adapters/capabilities/`, memory ports through `composition/wire-memory.ts`). In `studio-run-targets.adapter.ts` lines 63-74 replace `capabilityToolNames` / `capabilityTools` pruning with `packTools` intersection from Task 2. Keep `scope`, `permissionMapFor`, and `paths` at lines 75-83 byte-identical.

- [ ] **Step 2: Catalog endpoint and `packs` persistence**

`list-workspace-capabilities.use-case.ts` returns `packCatalog()` entries (`name`, `version`, `description`, `icon`, `hasSettings`, `tools`, `skills`). The controller shape follows the use case without extra mapping. `workspace-harnesys.registry.ts` `resolveAgentDefinition` passes `packs` through as-is with `true` normalized via `normalizePackAssignment`; it no longer maps `tools` or `memory` and performs no workspace-spec merge. `sqlite-agent.repo.ts` reads and writes the existing `capabilities_json` column under the `packs` name (no new migration) and stops reading and writing the `tools` and `memory_json` columns; stored data stays on disk. `bootstrap.ts` deletes the `legacyPacks` seeding block at lines 278-284.

- [ ] **Step 3: Verify**

Run: `bunx biome check apps/studio/server/composition apps/studio/server/application/workspaces apps/studio/server/adapters`
Expected: PASS.

Run: `bunx tsc --noEmit -p apps/studio/tsconfig.json`
Expected: PASS.

---

### Task 7: Memory removal on the server

**Files:**
- Modify: `packages/harnesys/src/application/memory/create-semantic-tools.ts`, `packages/harnesys/src/ports/memory.ts`, `packages/harnesys/src/packs/memory/semantic.ts`, `packages/harnesys/src/packs/memory/pin.ts`, `packages/harnesys/src/packs/memory/episodic.ts`, `packages/harnesys/src/packs/memory/knowledge.ts`, `packages/harnesys/src/packs/memory/index.ts`
- Delete: `packages/harnesys/src/application/memory/resolve-memory-tools.ts`, `packages/harnesys/src/application/memory/memory-tool-names.ts`
- Modify: `apps/studio/server` create-agent and update-agent use cases (memory glue), semantic HTTP endpoints, `AgentMemoryConfig` consumers

**Interfaces:**
- Consumes: `specSchema` (`JsonSchema` in `domain/json-schema.ts`) for the four memory packs.
- Produces: per-agent memory configuration exclusively through `packs[name].spec`. Task 8 renders the settings buttons from `hasSettings`.

- [ ] **Step 1: Delete memory resolve path**

Delete the two files above. In create-agent and update-agent use cases remove the `memoryToolNames` merge (`create-agent.use-case.ts:85`, `update-agent.use-case.ts:124-132`) and the stock-graph rebuild branch keyed on memory. In `domain/agent-definition.ts` delete `AgentMemoryConfig` (lines 42-48) and the `memory` field (line 75). Delete `AgentMemoryConfig.project` without replacement.

- [ ] **Step 2: `sessionTtl` removal and memory `specSchema`**

Remove `sessionTtl` from `ports/memory.ts` (lines 47, 54, 63), `create-semantic-tools.ts` (lines 12, 32-90), `resolve-memory-tools.ts` (already deleted in Step 1), and `packs/memory/semantic.ts` (lines 8-9). Remove the semantic HTTP endpoints carrying TTL and the `SemanticSection` frontend field referencing them. Add `specSchema` to each of the four memory packs covering their current modal fields: pin store plus budget tokens plus max items, semantic store plus auto project plus limits, episodic store plus topK plus index on compact, knowledge on/off plus topK. Each schema uses only `string`, `number`, `boolean`, `enum`.

- [ ] **Step 3: Verify**

Run: `bunx biome check packages/harnesys/src/packs/memory packages/harnesys/src/application/memory packages/harnesys/src/ports apps/studio/server`
Expected: PASS.

Run: `bunx tsc --noEmit -p packages/harnesys/tsconfig.json`
Expected: PASS.

---

### Task 8: Agent cards, Memory tab removal, boundaries

**Files:**
- Modify: `apps/studio/client/src/features/manage-agent/ui/agent-config-dialog.tsx`, `apps/studio/client/src/features/manage-agent/ui/draft-capability-packs.tsx`, `apps/studio/client/src/features/manage-agent/ui/draft-capabilities.tsx`
- Remove: `apps/studio/client/src/features/manage-agent/ui/draft-memory.tsx` from the dialog (delete the file once nothing imports it)
- Create: `packages/harnesys/src/packs/index.ts`
- Modify: `packages/harnesys/src/packs/base.ts`, `packages/harnesys/src/packs/skills.ts`, `packages/harnesys/src/packs/plan/index.ts`, `packages/harnesys/src/packs/threads/index.ts`, `packages/harnesys/src/packs/scheduler/index.ts`, `packages/harnesys/src/packs/webhook/index.ts`, `packages/harnesys/src/packs/agents/index.ts`, `packages/harnesys/package.json`, `biome.json`

**Interfaces:**
- Consumes: catalog entries from Task 6, `Pack` type from Task 1.
- Produces: finished slice 1. Nothing downstream.

- [ ] **Step 1: Pack cards and Memory tab deletion**

`draft-capability-packs.tsx` renders one card per catalog entry: toggle on/off, `description`, tool list with descriptions, skills count, icon through the frontend Lucide map keyed by `icon`, settings button only when `hasSettings` is true with a `specSchema` form (`string`, `number`, `boolean`, `enum`). Enabling writes `true`, disabling removes the key. Remove the Memory tab entry from `agent-config-dialog.tsx` and the `draft-memory.tsx` import. `draft-capabilities.tsx` keeps FS skills and MCP servers only. Workspace `memory-pane.tsx` (`KnowledgeIndexPane`) stays for index settings.

- [ ] **Step 2: Pack objects, exports, and boundary rule**

Rewrite each pack object with `definePack`: `name`, `version`, `description`, `icon`, `specSchema` where settings exist, static `meta`, single `create`. Portless packs (`files`, `shell`, `fetch` in `packs/base.ts`, `packs/files/*`, `packs/shell/shell.ts`, `packs/web/fetch.ts`) pass no `ports`. Delete `prompt.ts` files under `packs/plan`, `packs/scheduler`, `packs/agents` after moving group instructions into tool descriptions and pack skills. Create `src/packs/index.ts` re-exporting every pack object plus `base.ts` (`filesCapability`, `shellCapability`, `fetchCapability`) so the new subpath has a single entry. Replace the `"./actions": "./src/adapters/actions/index.ts"` line in the `exports` block of `packages/harnesys/package.json` (lines 7-12) with `"./packs": "./src/packs/index.ts"`. Add the packs boundary rule to `biome.json` next to the FSD rules at lines 77-99 so `domain`, `ports`, and `application` cannot import concrete packs.

- [ ] **Step 3: Verify**

Run: `bun run lint`
Expected: PASS on the whole monorepo.

Run: `bunx tsc --noEmit -p packages/harnesys/tsconfig.json`
Expected: PASS.

Run: `bunx tsc --noEmit -p apps/studio/tsconfig.json`
Expected: PASS.
