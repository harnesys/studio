# Pack architecture

Date: 2026-09-09. Status: design approved in chat, slice 1. Replaces the 2026-09-09 pack-system draft for implementation.

## Goal

Packets are the single way to extend the engine. A pack is a self-contained module (ports, tools, skills, notes) that the kernel collects at defined lifecycle points. The host decides storage through ports. Example packs: plan (tasks, progress, execution), memory (pin, semantic, episodic, knowledge).

## `Pack`

```ts
export type PackSkill = {
  name: string;
  description: string;
  whenToUse?: string;
  body: string;
};

export type PackMeta = {
  tools: Array<{ name: string; description: string }>;
  skills: string[];
  hasSettings: boolean;
};

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
```

`meta` serves the catalog endpoint without stub instantiation. `create` runs once per run and is memoized on `run+agent+thread`. `icon` is a string key (for example `"plan"`, `"memory-pin"`), the frontend maps the key to a Lucide component. No SVG lives in the core type. Limit: `body` is an inline markdown string next to the tools.

## Lifecycle

Boot in `create-runtime.ts`: single pass over registrations, uniqueness check on `name`. No tool instantiation. Duplicate host name is an error (current silent dedupe in `create-runtime.ts:44-48` changes).

Agent resolve: enabled set is keys of `packs` with a present value. No instantiation.

Run init: for each enabled pack the kernel builds `PackCtx` from registration ports, agent spec, and `resolveScope()` output for the run. It calls `create` once. A ported pack without ports stops here with `pack_port_missing` and stays out of the run. A portless pack always proceeds.

Turn assembly in `llm.ts`: no repeated `create`. The kernel uses the memoized result. Pack tool schemas go to `[tools]` as immediate schemas. Pack skills go to the shared `load_skill` catalog (`capabilities/skills.ts`, `create-load-skill-tool.ts`). Pack notes providers evaluate per turn with turn context (budget from `graph.ts:630`, plan progress) and append to the tail with the deferred catalog (`exposure.ts`, limits 60/4000). Order: `[tools] [system] [messages] [tail]`. `[system]` is stable agent instructions plus compaction prefix. `[tail]` is an ephemeral `user` message (`assembleNotes`), not `role:system`, not persisted in thread history. The head-`system` merge in `ai-llm-adapter.ts` is removed so volatile notes never sit before history (prefix cache).

Execution: tools close over `ports/scope/spec` at creation. The kernel resolves by registry name only.

Compaction: `runSummaryPassIfDue` (`graph.ts:574`) reads only `agent.compaction`. No pack hooks exist in the kernel in slice 1. Episodic indexing after compaction stays in the host composition. File: `composition/studio.ts` equivalent, `compact-thread.use-case.ts`.

## Agent `packs` field

```ts
export type PackName = string;
export type PackConfig = { spec?: Record<string, unknown> };
export type PackAssignment = boolean | PackConfig;
export type AgentPacks = Record<PackName, PackAssignment>;
```

Agent definition carries `packs?: AgentPacks`. The `capabilities` field is replaced by `packs` in the same slice. `AgentDefinition.tools` stays untouched in slice 1. Absent key means off. Present key means on. `true` is sugar for enabled with defaults, `{ spec }` is enabled with settings. The server normalizes `false` to key removal and `true` to `{}`. Storage keeps the object form. The key is the pack `name`. Version stays informational. A separate id arrives only with marketplace and dynamic loading.

`node.tools` (`domain/agent-definition.ts:119`) is an intersection with the run registry. Absent key means all run tools, `[]` means zero pack tools. The trio and deferred MCP tools follow their own rules in `llm.ts:111-114` and `exposure.ts`. The rules `undefined to keys()` (`llm.ts:108`) and `tools_empty` (`validate.ts:258-265`) are rewritten to this semantic. Stock think carries no baked list; the agent dialog maintains `think.tools` on pack toggles, the server does not rewrite `graph_json` (`sqlite-agent.repo.ts:238-259`, `react-preset.ts`, `is-stock-react-graph.ts`).

## Catalog endpoint and agent cards

The workspace endpoint lists packs from `list-workspace-capabilities.use-case.ts:32` (`hx.capabilities.list()`). Entry: `name`, `version`, `description`, `icon`, `meta.tools` (name plus description), `meta.skills`, `hasSettings`. The frontend renders one card per pack (`draft-capability-packs.tsx` replaces the current toggle-only list).

Card: toggle on/off, description, contents (tool names with descriptions, skills count), icon from the frontend map, settings button only when `hasSettings` is true. Enabling writes `true` (all tools marked by default, removable individually only if per-tool toggles land in a later slice). The settings form renders from `specSchema` (`string`, `number`, `boolean`, `enum` in slice 1). Default state is all off.

## Memory placement

The Memory tab of the agent modal is removed (`draft-memory.tsx`, `agent-memory-port-fields.tsx`). `AgentDefinition.memory` (`domain/agent-definition.ts:75`) and `AgentMemoryConfig` (`:42-48`) die with it. The graph glue `memoryToolNames` in `create-agent.use-case.ts:85` and `update-agent.use-case.ts:124-132`, plus `resolve-memory-tools.ts` and `memory-tool-names.ts`, die with the tab.

Pin fields (store, budget tokens, max items), semantic fields (store, auto project, limits, session TTL), episodic fields (store, topK, index on compact), knowledge fields (on/off, topK) move to `specSchema` of `pin-memory`, `semantic-memory`, `episodic-memory`, `knowledge-memory`. Each agent sets values in the pack card. `AgentMemoryConfig.project` is not ported (no readers in the kernel). `sessionTtl` is removed with its endpoints and `SemanticSection` (`ports/memory.ts:47,54,63`, `create-semantic-tools.ts:12-90`).

Workspace index settings stay. `Settings to Memory` (`memory-pane.tsx`, `KnowledgeIndexPane`) is a studio-level shared service usable by any pack. Agent budgets and limits are never duplicated there. Scope stays per agent by name (`ports/memory.ts:1-5`, `memory-scope.ts:9`).

## Diagnostics

All resolve diagnostics are warnings, the run never fails on them: `pack_unknown` (agent key without host registration, currently silent in `studio-run-targets.adapter.ts:63-69`), `pack_port_missing` (ported pack without ports), `pack_tools_empty` (`create` returned nothing), `skill_name_collision` (first registration wins, FS skills from `options.skills` win silently over both), `spec_invalid` (agent spec against `specSchema`, pack stays out). Check order: names and ports first, then the single `create` call. The stub-instantiation helper `tool-names.ts:35-41` is removed with this order.

## Boundaries

`domain`, `ports`, `application` import only the `Pack` type and `PackRegistration`. Concrete packs are passed through options, never imported by the kernel. Current violations (`application/create-runtime.ts:8-9`, `application/capabilities/registry.ts:2`, `application/graph.ts:8`, `ports/plan.ts:1` and neighbors) are fixed in this direction. A `noRestrictedImports` rule for `packs` is added to `biome.json` (current file covers only FSD slices at `:77-99`). The `harnesys/actions` subpath dies with the move, the new subpath is `harnesys/packs` to `src/packs/index.ts`.

## Out of scope

Marketplace, dynamic loading from FS, per-agent override of workspace memory beyond pack spec, migration of old agents (no live data, agents are recreated), physical npm split (`@harnesys/core` / `@harnesys/packs` stays mechanical later), MCP inside packs (`mcpServers` stays on the agent in `domain/agent-definition.ts:72`), Plugin format (skills plus MCP).
