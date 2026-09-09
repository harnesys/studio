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

## Sequencing rule

Old `Capability*` names stay compilable until the final task. Each task adds the new shape next to the old one and migrates its own consumers, so `tsc --noEmit` is green after every task. Deletions of `CapabilityConfig`, `CapabilityPack`, `CapabilityRegistration`, `defineCapability`, `registerCapability`, `resolveCapabilities`, `capability*` helpers, `composeSystemPrompt`, and the memory resolve files happen only in Task 10.

---

### Task 1: `domain/pack.ts` new types next to old

**Files:**
- Modify: `packages/harnesys/src/domain/pack.ts`

**Interfaces:**
- Consumes: `LlmNoteProvider` from `application/llm-notes.ts`, `ToolDefinition` from `ports/tools.ts`, `JsonSchema` from `domain/json-schema.ts`.
- Produces: `PackSkill`, `PackToolMeta`, `PackMeta`, `PackConfig`, `PackAssignment`, `PackName`, `AgentPacks`, `PackCtx<Ports, Spec>`, `Pack<Ports, Spec>`, `PackRegistration<Ports>`, `definePack`, `registerPack`, `normalizePackAssignment`. Task 2 imports `definePack`, `registerPack`, `Pack`.

- [ ] **Step 1: Append new types, delete nothing**

Append the block below to `domain/pack.ts`. Keep every existing export (`CapabilityConfig`, `CapabilityPackContext`, `CapabilityPack`, `CapabilityRegistration`, `defineCapability`, `registerCapability`, `CapabilityScope`) byte-identical. `CapabilityScope` keeps its name permanently (ports import it).

```ts
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

- [ ] **Step 2: Verify**

Run: `bunx biome check packages/harnesys/src/domain/pack.ts`
Expected: PASS.

Run: `bunx tsc --noEmit -p packages/harnesys/tsconfig.json`
Expected: PASS. Nothing else changed, so no new errors are possible.

---

### Task 2: Rewrite all pack objects, delete the skills pack

**Files:**
- Modify: `packages/harnesys/src/packs/base.ts`, `packages/harnesys/src/packs/plan/index.ts`, `packages/harnesys/src/packs/threads/index.ts`, `packages/harnesys/src/packs/scheduler/index.ts`, `packages/harnesys/src/packs/webhook/index.ts`, `packages/harnesys/src/packs/agents/index.ts`, `packages/harnesys/src/packs/memory/pin.ts`, `packages/harnesys/src/packs/memory/semantic.ts`, `packages/harnesys/src/packs/memory/episodic.ts`, `packages/harnesys/src/packs/memory/knowledge.ts`, `packages/harnesys/src/application/create-runtime.ts`, `packages/harnesys/index.ts`
- Delete: `packages/harnesys/src/packs/skills.ts`

**Interfaces:**
- Consumes: `definePack`, `Pack` from `domain/pack.ts` (Task 1).
- Produces: eleven `definePack` objects with `meta` and single `create`. Task 4 reads `meta`, Task 5 calls `create`.

**Ownership decision:** the kernel owns `load_skill` from this task on. The `skillsCapability` object is deleted together with its file. Its `tools` output (the `load_skill` tool) and its `notes` output (skills catalog note) move to the kernel merge in Task 5. Between Task 2 and Task 5 `load_skill` is absent from fresh registries; no test coverage exists for it in the repo, so the gap is ordering-only and closes in Task 5.

- [ ] **Step 1: Rewrite the ten pack objects with `definePack`**

In each of the ten files replace `defineCapability<Ports>({...})` with `definePack<Ports, Record<string, unknown>>({...})` and reshape the literal: drop `requires`, `dependsOn`, `configFrom`, `prompt`; keep `name`, `version`, `description`; add `icon` (`"files"`, `"shell"`, `"fetch"`, `"plan"`, `"threads"`, `"scheduler"`, `"webhook"`, `"agents"`, `"memory-pin"`, `"memory-semantic"`, `"memory-episodic"`, `"memory-knowledge"`); add static `meta` (`tools` name plus description per tool the pack creates, `skills` names it will serve, `hasSettings: false` for all packs in this task — Task 8 flips the four memory packs to `true` together with their `specSchema`); replace `tools: (ctx) => ...` with `create: (ctx) => ({ tools: ... })` where `ctx` is `{ ports, spec: (ctx as unknown as { config: PackConfig }).config ?? {} }` mapped to the new shape — concretely `create: (ctx) => ({ tools: <old tools body with ctx.ports and ctx.resolveScope replaced> })`. For packs with `notes` (`plan/index.ts:15-32` and memory packs), return `{ tools, notes }` from `create` with the provider body unchanged. For the plan pack, inline the active-plan text construction into `create` without importing `./prompt.ts` (the file dies in Task 10). Keep exported const names (`filesCapability`, `planCapability`, `threadsCapability`, `schedulerCapability`, `webhookCapability`, `agentsCapability`, `pinMemoryCapability`, `semanticMemoryCapability`, `episodicMemoryCapability`, `knowledgeMemoryCapability`) unchanged so the barrel and Studio keep compiling.

- [ ] **Step 2: Delete the skills pack and its two references**

Delete `packs/skills.ts`. In `application/create-runtime.ts` delete the auto-skills block (lines 50-63: `autoSkills` const and its `baseTools.push`) and the `skillsCapability` import (line 13), and remove `...(autoSkills ? [autoSkills] : [])` from the `capabilityRegistrations` array (lines 64-68). In `packages/harnesys/index.ts` delete lines 30-31 (`SkillsCapabilityPorts` type and `skillsCapability` export). Nothing else in the barrel changes in this task.

- [ ] **Step 3: Verify**

Run: `bunx biome check packages/harnesys/src/packs packages/harnesys/src/application/create-runtime.ts packages/harnesys/index.ts`
Expected: PASS.

Run: `bunx tsc --noEmit -p packages/harnesys/tsconfig.json`
Expected: PASS. Old `Capability*` types still exist, old registry still reads `def.capabilities`, new objects are only referenced by the barrel consts.

---

### Task 3: Agent `packs` field and validation

**Files:**
- Modify: `packages/harnesys/src/domain/agent-definition.ts`
- Modify: `packages/harnesys/src/application/validate.ts`

**Interfaces:**
- Consumes: `AgentPacks`, `PackAssignment`, `PackConfig`, `normalizePackAssignment` from `domain/pack.ts` (Task 1).
- Produces: normalized `packs` shape used by Tasks 4, 5, and 7. Studio repo normalization in Task 7 imports `normalizePackAssignment`.

- [ ] **Step 1: Replace `capabilities` with `packs`**

In `domain/agent-definition.ts`: change the import at line 5 to `import type { AgentPacks } from './pack.ts'`. Replace line 83 `capabilities?: Record<string, CapabilityConfig | null>` with `packs?: AgentPacks`. Leave `tools?: string[]` (line 71), `memory?: AgentMemoryConfig` (line 75), and `Node` `tools?: string[]` (line 119) untouched; memory dies in Task 8. No other `def.capabilities` readers remain inside the package after Task 2 (pack objects no longer use `configFrom`); the registry still reads `def.capabilities` and is rewritten in Task 4.

- [ ] **Step 2: Structural validation for `boolean | PackConfig`**

In `application/validate.ts`: accept `packs` values that are `true`, `false`, or an object with optional `spec` record. `false` normalizes to key removal before compile. Remove the `tools: []` error at lines 258-265 and replace it with nothing (empty means zero pack tools by Task 6 semantics). Keep all other structural checks byte-identical.

- [ ] **Step 3: Verify**

Run: `bunx biome check packages/harnesys/src/domain/agent-definition.ts packages/harnesys/src/application/validate.ts`
Expected: PASS.

Run: `bunx tsc --noEmit -p packages/harnesys/tsconfig.json`
Expected: PASS for these files. `registry.ts` mismatch is Task 4.

---

### Task 4: Pack resolve and catalog

**Files:**
- Modify: `packages/harnesys/src/application/packs/registry.ts`
- Modify: `packages/harnesys/src/application/packs/tool-names.ts`

**Interfaces:**
- Consumes: `Pack`, `PackConfig`, `PackRegistration`, `AgentPacks` from `domain/pack.ts`; `AgentDefinition` from `domain/agent-definition.ts` (Task 3).
- Produces: `ResolvedPack = { reg: PackRegistration; config: PackConfig }`, `PackDiagnostic = { severity: 'warning'; code: PackDiagnosticCode; message: string }`, `resolvePacks(def, registrations)`, `packTools(def, registrations)`, `packCatalog(registrations)`. Task 5 imports `resolvePacks`, `ResolvedPack`, `packTools`, `packCatalog`.

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

const ajv = new Ajv({ strict: false, allErrors: true });

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

Rules: no `dependsOn` traversal, no `configFrom` branch, no `requires` check. The Ajv instance shape follows the existing pattern in `tool-registry.ts:4`. All severities are `warning`. Keep `compareStrings` only if other files import it; otherwise delete it here and fix the single importer.

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
): ToolDefinition[] {
  const { enabled } = resolvePacks(def, registrations);
  return enabled.flatMap((p) => {
    const out = p.reg.pack.create({
      ports: (p.reg.ports ?? {}) as Record<string, unknown>,
      spec: (p.config.spec ?? {}) as Record<string, unknown>,
      scope: p.reg.resolveScope?.() ?? { workspaceId: '_', agentId: '_', threadId: '_' },
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

Scope comes from `reg.resolveScope`, never fabricated from the agent id, so memory packs keep per-agent R15 scoping (`wire-capabilities.ts:79-82`). Delete `capabilityToolNames`, `capabilityTools`, `allCapabilityToolNames`, `capabilityCatalog`, `CapabilityCatalogEntry`, and the stub-scope instantiation.

- [ ] **Step 3: Verify**

Run: `bunx biome check packages/harnesys/src/application/packs`
Expected: PASS.

Run: `bunx tsc --noEmit -p packages/harnesys/tsconfig.json`
Expected: PASS for these two files. Callers (`create-runtime.ts`, `graph.ts`, studio adapters) still use old names and fail; they move in Task 5.

---

### Task 5: Runtime lifecycle, plumbing layer, kernel `load_skill`

**Files:**
- Modify: `packages/harnesys/src/application/create-runtime.ts`, `packages/harnesys/src/application/graph.ts`, `packages/harnesys/src/application/graph-run.ts`, `packages/harnesys/src/application/graph-spawn.ts`, `packages/harnesys/src/application/session.ts`, `packages/harnesys/src/application/run-engine.ts`, `packages/harnesys/src/application/run-engine-types.ts`, `packages/harnesys/src/ports/create-runtime.ts`, `packages/harnesys/src/ports/run-targets.ts`, `packages/harnesys/src/ports/agents-catalog.ts`, `packages/harnesys/index.ts`

**Interfaces:**
- Consumes: `resolvePacks`, `ResolvedPack` from `application/packs/registry.ts` (Task 4); `registerPack` from `domain/pack.ts` (Task 1); `filterSkills` from `application/skills/skills-catalog.ts`; `createLoadSkillTool` from `application/skills/create-load-skill-tool.ts`.
- Produces: run-scoped memoized pack outputs passed to graph execution and the `LlmContext` shape. Task 6 consumes the context shape.

**Rename decision:** the option and plumbing fields follow the agent field. `CreateRuntimeOptions.capabilities` becomes `packs`, `RunTarget.capabilities` (`ports/run-targets.ts:17`) becomes `packs`, `RuntimeHandle.capabilities.list` becomes `packs.list`, `RuntimeContext.capabilityRegistrations` becomes `packRegistrations`, `AgentCatalogCreateInput.capabilities` (`ports/agents-catalog.ts:24`) becomes `packs`. Rationale: single vocabulary, package version is `0.3.0` pre-1.0, agent database is wiped.

- [ ] **Step 1: Boot validation, base packs, and plumbing renames**

In `create-runtime.ts` replace the block at lines 40-68: duplicate names inside `options.packs` throw `pack "${name}" registered twice by host`. Base packs register only when the host did not supply the name. `registerCapability(pack, {}, stubScope)` becomes `registerPack(pack, { resolveScope: stubScope })` with no `ports` key for portless packs. Rename `capabilityRegistrations` to `packRegistrations` at lines 64, 120, 145, 168, and the `capabilities: { list }` handle at lines 195-197 to `packs: { list: () => packCatalog(packRegistrations) }`. In `ports/create-runtime.ts:47`, `ports/run-targets.ts:17`, `ports/agents-catalog.ts:24`, `application/session.ts:31`, `application/run-engine-types.ts:30,41`, `application/graph.ts:152` rename the fields to the `packs` / `packRegistrations` names with `PackRegistration` type. In `application/graph-run.ts:58`, `graph-spawn.ts:159`, `session.ts:134`, `run-engine.ts:162` rename the passed properties only.

- [ ] **Step 2: Per-run `create` memoization and kernel skills catalog**

In `run`, `start`, and the session path, after `resolveAgent` add: `const { enabled, diagnostics } = resolvePacks(def, packRegistrations)`. Build one `Map<string, { tools, skills, notes }>` per run by calling each enabled pack `create` exactly once with `{ ports: reg.ports ?? {}, spec: config.spec ?? {}, scope: reg.resolveScope?.() ?? stubScope() }`. Pass the map into `runGraph` / `startGraph` / `createSession` through `runtimeCtx` instead of raw registrations. Narrow catch: only when `reg.ports === undefined` is a `create` throw reported as `pack_port_missing` with the pack excluded from the run. When ports are present a `create` throw propagates.

In the same step build the combined skills catalog for `load_skill`: start from `options.skills` (FS registry), append each enabled pack output `skills` in registration order, filtered by `def.skills` allowlist when present via the existing `filterSkills`. An FS skill with the same name wins silently over pack skills. A duplicate name between two packs emits `skill_name_collision` and keeps the first registration order. Register one `load_skill` tool from the merged catalog. In `graph.ts` replace both `resolveCapabilities` calls (lines 213 and 1046) with the memoized map lookup, and line 683 `capabilities: caps.enabled` with the memoized outputs.

- [ ] **Step 3: Barrel new exports and verify**

In `packages/harnesys/index.ts` add exports for `definePack`, `registerPack`, `Pack`, `PackCtx`, `PackMeta`, `PackSkill`, `PackConfig`, `PackAssignment`, `AgentPacks`, `PackRegistration`, `resolvePacks`, `ResolvedPack`, `packTools`, `packCatalog`, `PackCatalogEntry`. Keep all old exports in place (they die in Task 10).

Run: `bunx biome check packages/harnesys/src/application packages/harnesys/src/ports packages/harnesys/index.ts`
Expected: PASS.

Run: `bunx tsc --noEmit -p packages/harnesys/tsconfig.json`
Expected: PASS.

---

### Task 6: Turn assembly in `llm.ts`

**Files:**
- Modify: `packages/harnesys/src/application/llm.ts`
- Modify: `packages/harnesys/src/adapters/ai-llm-adapter.ts`
- Delete: `packages/harnesys/src/application/packs/prompt.ts`

**Interfaces:**
- Consumes: memoized per-run pack outputs from Task 5, `formatDeferredCatalog`, `loadedToolsOf`, `resolveProgressiveTools` from `application/tools/exposure.ts`, `assembleNotes` from `application/llm-notes.ts`.
- Produces: fixed zone order `[tools] [system] [messages] [tail]`. Task 10 consumes the removed `composeSystemPrompt` absence.

- [ ] **Step 1: Prompt, tools, and tail in `llm.ts`**

Replace `composeSystemPrompt(agentText, ctx.capabilities ?? [])` at line 106 with `agentText` (pack group instructions arrive through tool descriptions and pack skills). Change line 108 semantics: `node.tools === undefined` means all run-registry tools, `[]` means zero pack tools. Keep the progressive branch shape at lines 111-114 but apply `resolveProgressiveTools` to the MCP subset regardless of `node.tools`, so an explicit node list no longer disables deferred handling. Replace lines 124-126: notes go as a separate trailing message after history, never merged into the head `system` parameter. Update `LlmContext.capabilities?: ResolvedCapability[]` (line 31) to the memoized pack outputs type from Task 5.

- [ ] **Step 2: Adapter head-`system` merge removal**

In `adapters/ai-llm-adapter.ts` lines 64-78, stop collecting `role: 'system'` entries from the message array into the head `system` text. The tail message from Step 1 travels as a normal message. Delete `application/packs/prompt.ts` (`composeSystemPrompt`) and its single import in `llm.ts`.

- [ ] **Step 3: Verify**

Run: `bunx biome check packages/harnesys/src/application/llm.ts packages/harnesys/src/adapters/ai-llm-adapter.ts packages/harnesys/src/application/packs`
Expected: PASS.

Run: `bunx tsc --noEmit -p packages/harnesys/tsconfig.json`
Expected: PASS.

---

### Task 7: Studio wiring, catalog, and storage

**Files:**
- Rename: `apps/studio/server/composition/wire-capabilities.ts` to `apps/studio/server/composition/wire-packs.ts`
- Modify: `apps/studio/server/composition/wire-packs.ts`, `apps/studio/server/application/workspaces/list-workspace-capabilities.use-case.ts`, `apps/studio/server/adapters/http/workspace/capabilities.controller.ts`, `apps/studio/server/adapters/workspace-harnesys.registry.ts`, `apps/studio/server/adapters/store/sqlite/sqlite-agent.repo.ts`, `apps/studio/server/adapters/store/sqlite/bootstrap.ts`, `apps/studio/server/adapters/studio-run-targets.adapter.ts`

**Interfaces:**
- Consumes: `packCatalog`, `packTools` from `application/packs/tool-names.ts` (Task 4), `registerPack` from `domain/pack.ts` (Task 1), `normalizePackAssignment` from `domain/pack.ts` (Task 1).
- Produces: catalog entries with `meta` shape for Task 9, `packs` persistence.

- [ ] **Step 1: Pack wiring with sqlite ports**

Rename the file in the IDE (imports update automatically). Inside, replace `registerCapability` calls with `registerPack(pack, { ports, resolveScope })` using the existing sqlite ports (`sqlite-plan.port.ts`, `sqlite-threads.port.ts`, `sqlite-scheduler.port.ts`, `sqlite-webhook.port.ts`, `sqlite-agents-catalog.port.ts` from `adapters/capabilities/`, memory ports through `composition/wire-memory.ts`). Portless base packs register with `{ resolveScope: stubScope }` and no `ports` key. In `studio-run-targets.adapter.ts` lines 63-74 replace `capabilityToolNames` / `capabilityTools` pruning with the `packTools` intersection from Task 4. Keep `scope`, `permissionMapFor`, and `paths` at lines 75-83 byte-identical.

- [ ] **Step 2: Catalog endpoint and `packs` persistence**

`list-workspace-capabilities.use-case.ts` returns `packCatalog()` entries (`name`, `version`, `description`, `icon`, `hasSettings`, `tools`, `skills`). The controller shape follows the use case without extra mapping. `workspace-harnesys.registry.ts` `resolveAgentDefinition` passes `packs` through as-is with `true` normalized via `normalizePackAssignment`; it no longer maps `tools` or `memory` and performs no workspace-spec merge. `sqlite-agent.repo.ts` reads and writes the existing `capabilities_json` column under the `packs` name (no new migration) and stops reading and writing the `tools` and `memory_json` columns; stored data stays on disk. `bootstrap.ts` deletes the `legacyPacks` seeding block at lines 278-284.

- [ ] **Step 3: Verify**

Run: `bunx biome check apps/studio/server/composition apps/studio/server/application/workspaces apps/studio/server/adapters`
Expected: PASS.

Run: `bunx tsc --noEmit -p apps/studio/tsconfig.json`
Expected: PASS.

---

### Task 8: Memory removal on the server

**Files:**
- Modify: `packages/harnesys/src/application/memory/create-semantic-tools.ts`, `packages/harnesys/src/ports/memory.ts`, `packages/harnesys/src/packs/memory/semantic.ts`, `packages/harnesys/src/packs/memory/pin.ts`, `packages/harnesys/src/packs/memory/episodic.ts`, `packages/harnesys/src/packs/memory/knowledge.ts`, `packages/harnesys/src/packs/memory/index.ts`, `apps/studio/shared/agent-runtime-defaults.ts`
- Delete: `packages/harnesys/src/application/memory/resolve-memory-tools.ts`, `packages/harnesys/src/application/memory/memory-tool-names.ts`
- Modify: `apps/studio/server` create-agent and update-agent use cases (memory glue), semantic HTTP endpoints, `AgentMemoryConfig` consumers

**Interfaces:**
- Consumes: `specSchema` (`JsonSchema` in `domain/json-schema.ts`) for the four memory packs.
- Produces: per-agent memory configuration exclusively through `packs[name].spec`. Task 9 renders the settings buttons from `hasSettings`.

- [ ] **Step 1: Delete memory resolve path**

Delete the two files above. In create-agent and update-agent use cases remove the `memoryToolNames` merge (`create-agent.use-case.ts:85`, `update-agent.use-case.ts:124-132`) and the stock-graph rebuild branch keyed on memory. In `domain/agent-definition.ts` delete `AgentMemoryConfig` (lines 42-48) and the `memory` field (line 75). Delete `AgentMemoryConfig.project` without replacement.

- [ ] **Step 2: `sessionTtl` removal and memory `specSchema`**

Remove `sessionTtl` from `ports/memory.ts` (lines 47, 54, 63), `create-semantic-tools.ts` (lines 12, 32-90), and `packs/memory/semantic.ts` (lines 8-9). Remove the semantic HTTP endpoints carrying TTL, the `SemanticSection` frontend field referencing them, and the default in `apps/studio/shared/agent-runtime-defaults.ts:26`. Add `specSchema` to each of the four memory packs covering their current modal fields: pin store plus budget tokens plus max items, semantic store plus auto project plus limits, episodic store plus topK plus index on compact, knowledge on/off plus topK. Each schema uses only `string`, `number`, `boolean`, `enum`. Flip the four packs `meta.hasSettings` to `true` in the same edit.

- [ ] **Step 3: Verify**

Run: `bunx biome check packages/harnesys/src/packs/memory packages/harnesys/src/application/memory packages/harnesys/src/ports apps/studio/server apps/studio/shared`
Expected: PASS.

Run: `bunx tsc --noEmit -p packages/harnesys/tsconfig.json`
Expected: PASS.

---

### Task 9: Agent cards and Memory tab removal

**Files:**
- Modify: `apps/studio/client/src/features/manage-agent/ui/agent-config-dialog.tsx`, `apps/studio/client/src/features/manage-agent/ui/draft-capability-packs.tsx`, `apps/studio/client/src/features/manage-agent/ui/draft-capabilities.tsx`
- Remove: `apps/studio/client/src/features/manage-agent/ui/draft-memory.tsx` from the dialog (delete the file once nothing imports it)

**Interfaces:**
- Consumes: catalog entries from Task 7, `Pack` type from Task 1.
- Produces: finished client slice. Nothing downstream except Task 10 cleanup.

- [ ] **Step 1: Pack cards and Memory tab deletion**

`draft-capability-packs.tsx` renders one card per catalog entry: toggle on/off, `description`, tool list with descriptions, skills count, icon through the frontend Lucide map keyed by `icon`, settings button only when `hasSettings` is true with a `specSchema` form (`string`, `number`, `boolean`, `enum`). Enabling writes `true`, disabling removes the key. Remove the Memory tab entry from `agent-config-dialog.tsx` and the `draft-memory.tsx` import. `draft-capabilities.tsx` keeps FS skills and MCP servers only. Workspace `memory-pane.tsx` (`KnowledgeIndexPane`) stays for index settings.

- [ ] **Step 2: Verify**

Run: `bunx biome check apps/studio/client/src/features/manage-agent`
Expected: PASS.

Run: `bunx tsc --noEmit -p apps/studio/client/tsconfig.app.json`
Expected: PASS.

---

### Task 10: Old names deletion and boundary rule

**Files:**
- Modify: `packages/harnesys/src/domain/pack.ts`, `packages/harnesys/index.ts`, `packages/harnesys/package.json`, `biome.json`
- Delete: `packages/harnesys/src/application/memory/resolve-memory-tools.ts` and `memory-tool-names.ts` are already gone (Task 8). Nothing new to delete except old exports below.

**Interfaces:**
- Consumes: nothing new. Closes Tasks 1-9.

- [ ] **Step 1: Delete old capability surface**

In `domain/pack.ts` delete `CapabilityConfig`, `CapabilityPackContext`, `CapabilityPack`, `CapabilityRegistration`, `defineCapability`, `registerCapability`. Keep `CapabilityScope`. In `packages/harnesys/index.ts` delete the old exports: `CapabilityDiagnostic`, `ResolvedCapability`, `resolveCapabilities` (lines 24-28), `composeSystemPrompt` (lines 32-34), `CapabilityCatalogEntry`, `allCapabilityToolNames`, `capabilityCatalog`, `capabilityToolNames`, `capabilityTools` (lines 35-41), `memoryToolNames`, `resolveMemoryTools` and related types (lines 204-214), prompt fragments `planFollowPrompt`, `AGENTS_PROMPT_FRAGMENT`, `SCHEDULER_PROMPT_FRAGMENT` (lines 220, 231, 247), `registerCapability`, `defineCapability`, `CapabilityRegistration`, `CapabilityPack`, `CapabilityPackContext`, `CapabilityConfig`, `CapabilityScope` type export at lines 274-280 (keep the `CapabilityScope` type itself, it stays exported under its name). Delete the `prompt.ts` files under `packs/plan`, `packs/scheduler`, `packs/agents` (group instructions already live in tool descriptions and pack skills since Task 2). Run `grep -rn "from './prompt.ts'\|from '../prompt.ts'\|prompt\.ts" packages/harnesys/src apps/studio/server` and fix every remaining importer before deleting. Then run `grep -rn "resolveCapabilities\|ResolvedCapability\|capabilityTools\|capabilityToolNames\|allCapabilityToolNames\|capabilityCatalog\|CapabilityCatalogEntry\|composeSystemPrompt\|defineCapability\|registerCapability\|CapabilityPack\|CapabilityRegistration\|CapabilityConfig\|memoryToolNames\|resolveMemoryTools\|planCapability\|threadsCapability\|schedulerCapability\|webhookCapability\|agentsCapability\|pinMemoryCapability\|semanticMemoryCapability\|episodicMemoryCapability\|knowledgeMemoryCapability\|skillsCapability\|memoryCapabilityList\|memoryCapabilities\|memoryScopeOf" packages/harnesys/src packages/harnesys/index.ts apps/studio --include='*.ts' --include='*.tsx` and fix every remaining importer (expected: none outside deleted files) before removing the barrel exports.

- [ ] **Step 2: Subpath export and boundary rule**

Create `src/packs/index.ts` re-exporting every pack object from Task 2 plus `base.ts`. Replace the `"./actions": "./src/adapters/actions/index.ts"` line in the `exports` block of `packages/harnesys/package.json` (lines 7-12) with `"./packs": "./src/packs/index.ts"`. Add the packs boundary rule to `biome.json` next to the FSD rules at lines 77-99 so `domain`, `ports`, and `application` cannot import concrete packs.

- [ ] **Step 3: Verify**

Run: `bun run lint`
Expected: PASS on the whole monorepo.

Run: `bunx tsc --noEmit -p packages/harnesys/tsconfig.json`
Expected: PASS.

Run: `bunx tsc --noEmit -p apps/studio/tsconfig.json`
Expected: PASS.
