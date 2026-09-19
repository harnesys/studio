---
name: agent-creator
description: Create agent definitions and presets with valid graphs, packs, skills, and HITL behavior for the harnesys engine
when_to_use: Before creating or editing any agent, preset, or graph; when fixing validation errors; when a run fails with MissingToolResultsError or unexpected permission asks
---
# Agent Creator

Reference for authoring `AgentDefinition`s and Studio presets. The engine executes one node type per graph node and nothing else: `llm:generate` calls the model once and never executes tools; `tool:call` executes tools and never calls the model. All control flow lives in edges.

## The tool-calls invariant (the one that kills runs)

- Node `"tools"` narrows the run set: omitted/undefined = the full run set, `[]` = no tools (pure decision nodes). A node never sees more than the agent grant.
- When the model answers with tool calls, the assistant message (with `toolCalls`) is appended to `$state.messages` even if no edge executes them.
- Any later `llm:generate` in the same run converts those messages and throws `AI_MissingToolResultsError`; the run fails. One unhandled tool call is enough.
- Therefore: every `llm:generate` that can see tools must either route `when: '$output.finishReason = "tool-calls"'` to a batch `tool:call` over `calls: "$output.toolCalls"`, or loop back to itself after that node, or declare `"tools": []`.
- Pure decision/report nodes get `"tools": []` and instruct the model to answer in text.
- Canonical loop (copy this shape; see `../../../server/src/application` and the shipped presets in `apps/server/assets/presets/agents/`):

```json
"start": { "type": "core:start" },
"think": { "type": "llm:generate", "prompt": "main", "messages": "$state.messages", "tools": ["read_file", "write_file", "shell"] },
"act":   { "type": "tool:call", "calls": "$output.toolCalls", "concurrency": "parallel", "barrier": { "policy": "all" } },
"end":   { "type": "core:end" }
```
```json
[{ "from": "start", "to": "think" },
 { "from": "think", "to": "act", "when": "$output.finishReason = \"tool-calls\"" },
 { "from": "think", "to": "end" },
 { "from": "act", "to": "think" }]
```
The `think` `tools` list is the agent's full tool set. Split truth: at registry level the resolver adds `load_tools` (and `load_skill`/`Skill` when the agent has skills) after the agent-level filter, so these names go in node `tools` only (the resolver adds them after the agent filter; no source grant names them). At node level a node sees only the names it lists, so `think` must name the services to offer them to the model. Naming a tool the run registry lacks is harmless at node level (invisible, no error).

## Graph structure

Exactly one `core:start`; at least one `core:end`. Every node except `core:end` and `control:goto` needs an outgoing edge (`control:handoff` too, formally; runtime never follows it after rebinding). Edges are first-wins by array order. With both tools enabled, presets route `act` → `spawn` before `act` → `handoff`; the `spawn` → `handoff` edge carries the second intent in the same step. With any `when` edge from a node, a default (no `when`) is required and must be last; at most one default per `from`.

## Nodes

- `core:start`: no fields. Appends the user message to `$state.messages`.
- `core:end`: omit `output` to finish with the last message. Do not write `"$state.messages[-1]"`: negative indexes are not supported, the end node falls back to the literal string as output.
- `llm:generate`: `prompt` (key in `agent.prompts`; Studio maps `main` = agent instructions, so per-node prompts are not available in presets), `messages: "$state.<key>"` (must be a `$state.*` path; this node is the only history writer), `tools: string[]` — only listed names are visible (omitted = full run set, `[]` = none, see invariant), `output?: JsonSchema` (structured: keys merge into `$output`; reserved `finishReason`/`text`/`toolCalls` win; avoid combining `output` with tools in one node).
- `tool:call`: fixed form `name` + `args` (args values may be `$…` expressions) OR batch form `calls` (array expr) + `concurrency` + `barrier: { policy: 'all' }` + optional `approve: { tools, reason, resumeSchema }`. Max 32 calls (`tool_call_limit`). Results append to the messages path of the most recent `llm:generate`, in `calls` order; `$output = { results: [{ id, name, result, isError, skipped?, cancelled? }] }`. Reading `$output.results` before the barrier throws `output_not_ready`.
- `control:assign`: `patch: { key: Expr | literal | "text {$...}" }`. Writes go through reducers: default strategy is merge (arrays concat, objects deep-merge), `"replace"` only via `state.reducers`.
- `control:goto`: `target` evaluates to a node id; no `$output` written.
- `control:interrupt`: `reason` + `resumeSchema`; parks the run with an ask. Throws `sandbox_blocked` in a spawned child.
- `control:spawn`: `calls` evaluates to `[{ agentId, input }]`. `agents_spawn` needs a matching `control:spawn` node in the agent's own graph: without it the tool returns an error and nothing is queued. The tool queues that array into `$state.spawns`; route it with `when: 'exists($state.spawns) && length($state.spawns) > 0'`. After completion the queue is cleared and a `"Spawn results: …"` assistant message is appended. A finished child's result is persisted and emitted (`agent.completed`/`agent.failed`) as soon as that child finishes, not at the barrier; on a retry after a crash the checkpointed children are not re-run, their results carry over. Child result = the child's last message. A spawn `budget` replaces the child's limits; on exhaustion the child is not killed mid-step: the run arms one closing no-tools `llm:generate`, its report becomes the result and the result carries a `budget` marker `{ kind, limit, used, closingStep: true }` (`used` includes that closing report step and may exceed `limit`). Spawn `input` is required in the tool path: `{ messages: [...] }` or a plain string (the engine wraps a string into one user message and runs `UserPromptSubmit` hooks on it). Children run sandboxed against the user: a call whose effective permission gate is `ask` or `deny` (unlisted ops fall back to `ask` for writes/network), an `approve` batch, `ask_user` and `control:interrupt` return `denied in subagent context` — the delegate's own `permissions` allow map, intersected with the creator's, lets file/shell/network tools run unattended; shared-state writes (`plan_save`, `plan_item_update`, `pin_set`, `pin_remove`, `schedule_set`, `schedule_pause`, `schedule_delete`, `webhook_set`, `webhook_delete`) are denied before execution regardless of declared operations, denial text starts `denied in subagent context:`. Reads and `memory_*` stay allowed (memory is agent-namespaced). The engine does not limit spawn depth: subagent definitions must not enable the `agents` pack.
- `control:map`: fan-out over `items` (array expr, max 32). `enter` + `body` (node ids) run once per item with `$item` / `$index` slots. Optional `instruction` template (`$item`/`$index` substituted per worker; tool-call `instruction` overrides the node default via `$state.mapInstruction`); without it the worker gets the legacy `Map item [i]` text. Optional `maxTokensPerItem` (integer >= 1, tool-call override via `$state.mapMaxTokensPerItem`): truncates each worker text result to `maxTokensPerItem * 4` chars. Body edges must stay in `body`; each path ends at `control:yield` (optional `value` expr). Workers are sandboxed (no HITL/wait/interrupt). Join barrier is `all`. `$output = { results: [{ index, item, output, error? }] }` (stored full; the `Map results` context message strips per-item `reasoning`/`usage`). Optional `timeoutMs` + `onTimeout`: `fail` (run `timed_out`) or `partial` (unfinished items get `error.code: "timeout"`). Nested map, `core:end`, and `control:handoff` inside body are validation errors.
- `control:yield`: only inside a map `body`; terminates that worker.
- `control:wait`: parks as lifecycle `waiting` (not `needs_input`). Sleep: `delayMs` or `untilMs` (expr → epoch ms). Gate: omit both, optional `resumeSchema` + `timeoutMs` with `onTimeout` `fail`|`continue`|`interrupt`. Timer ticker auto-resumes; `respond` also wakes gate/sleep early. Forbidden in sandbox/map workers.
- `control:handoff`: `agentId` (resolves by id, id prefix, or name), `input`. `agents_handoff` needs a matching `control:handoff` node in the agent's own graph: without it the tool returns an error and nothing is queued. The tool queues `$state.handoffAgentId`. At runtime handoff rebinds the same run to the target definition and continues from the target's `core:start` with the parent's messages; the limits come from the target's stored `budget` (the same run, step counters keep their values). Handoff transfers the thread: return is not guaranteed by the engine, the new speaker hands back with its own `agents_handoff` or the user switches the speaker manually. `agents_handoff` rejects a delegate (subagent), an unknown id/name/prefix (the error lists top-level agents), the current speaker itself, and a target with no model configured (the thread would strand: the next run fails `model_unresolved`); each rejection is a tool error, not a run failure. Plugin agents are never handoff targets (spawn-only); a plugin id fails as an unknown target. The engine double-checks the model at `control:handoff` and fails with `handoff_model_unresolved` before the rebind commits.

## Edge expressions

Operators: `=`, `==`, `!=`, `>`, `<`, `>=`, `<=`, `&&`, `||`, `!`, parentheses, string/number/boolean/null literals, `exists($path)`, `length($path)` (array/string/object; path argument only, not expressions). Paths: `$input`, `$state`, `$output`, `$resume`, and inside map workers also `$item`, `$index`. No arithmetic, no negative indexes. A missing path inside `when` throws `unknown_path` and the edge simply does not match (same for a broken expression); in `args`/`calls` it fails the run. `$state.*` paths are validated statically only when `state.initial` defines the key.

## Permissions and HITL

Gates resolve per operation through `PermissionMap` keyed by OPERATIONS, not tool names; unknown operation defaults to `ask`, mixed gates take the worst. Default map: `fs.read` allow; `fs.write`, `process`, `network`, `mcp`, `agents` ask. Tool operations: `read_file`/`list_dir`/`glob`/`grep` = `fs.read`; `write_file`/`edit_file` = `fs.write`; `shell` = `process`; `fetch` = `network`; MCP tools = `mcp`. `plan_*`, `agents_list`/`agents_spawn`/`agents_handoff`, `threads`, memory, scheduler and webhook tools declare no operations and are never gated (in a spawned child the shared-state writes among them are still denied before execution, see `control:spawn`); `agents_create`/`agents_create_subagent` declare `agents`. A `deny` fails the call; an `ask` parks the run per call (one approval per gated call in a batch) with resume `{ approved }`; denial is terminal for that call, never re-send it unchanged. Studio run modes (plan/ask/auto/dont_ask/bypass) map to these operations in `../../../server/src/adapters`.

## Budget

`budget: { maxSteps?, maxTokens?, deadlineMs?, policy?: "ask" | "error" }`. Cyclic graphs require `maxSteps` or `deadlineMs` (`cycle_budget`). `maxTokens` absent = unlimited (cumulative usage across calls; small values trip after a couple of rounds, avoid it unless intended). On exhaustion with `policy: "ask"` the run parks and continue resets the window; `error` fails with `budget_exceeded`. Children cannot answer asks: use `policy: "error"` for subagents.

## Packs

Definition field is `packs` (Studio records and preset files carry the legacy key `capabilities`; the bridge maps it). Value shapes: `true` or `{}` = enabled with defaults, `{ spec: {...} }` (+ optional `disabledTools`/`exposure` overrides) = enabled with settings, absent/`false`/`null` = off. Sources, not tool names: the grant lists packs, plugins, skills, and MCP servers; the tool set derives from those sources, so a source update needs no agent rewrite. Creation stores the given pack map as-is. Exact pack names: an unregistered pack on write fails validation with 400 `unknown pack: <name>`; if the host stops registering a stored one, the resolver reports `pack "<name>" is not registered by the host` at run start and the target is rejected (no run claims):

| pack | tools |
|---|---|
| `core` | `ask_user`, `map`, `wait` (grant also enables the `load_tools` + `load_skill`/`Skill` services) |
| `files` | `read_file`, `write_file`, `edit_file`, `list_dir`, `glob`, `grep` |
| `shell` | `shell` (args: `command`, `run_in_background`, `block_until_ms`, `open_in_terminal`) |
| `process_poll` | `process_poll` (args: `job_id`, `since`, `wait_ms`; reads a `shell` background job) |
| `process_kill` | `process_kill` (arg: `job_id`; marks a `shell` background job killed) |
| `fetch` | `fetch` (arg: `url`; the old name `http` no longer exists) |
| `plan` | `plan_save`, `plan_item_update`, `plan_get` |
| `agents` | `agents_list`, `agents_create`, `agents_create_subagent`, `agents_spawn`, `agents_handoff`, `agents_update`, `agents_delete` |
| `threads` | `thread_list` |
| `scheduler` | `schedule_list`, `schedule_peek`, `schedule_set`, `schedule_pause`, `schedule_delete` |
| `webhook` | `webhook_list`, `webhook_set`, `webhook_delete` |
| `episodic-memory` | `recall_search` |
| `semantic-memory` | `memory_write`, `memory_list`, `memory_update`, `memory_delete` |
| `knowledge-memory` | `knowledge_search`, `knowledge_read` |
| `pin-memory` | `pin_set`, `pin_list`, `pin_remove` |

`agents_create` makes a standalone top-level agent visible to the user; `agents_create_subagent` makes a one-shot delegate under the calling agent (spawn target but not a handoff target; `agents` pack rejected, permissions intersected with the caller's). Both inherit the creating agent's model when the input carries none; explicit model selection is not exposed to tools yet. The host default ReAct graph includes `control:spawn` and `control:handoff` nodes, so an agent created without `graph` can delegate and hand back without an explicit graph. `agents_list` rows carry `level` with values `top`|`delegate`|`plugin`; plugin rows come from installed plugins and are spawn-only. Managing your own delegates: `agents_update` patches `name`/`role`/`instructions`/`budget`, `agents_delete` removes the delegate; both act only on delegates the calling agent created (`parentId`), top-level agents are managed in the workspace UI. `agents_update.budget` replaces the stored budget whole: `policy` (`ask`|`error`) is patchable, omitted limit fields drop out. `agents_delete` refuses while the delegate is the speaker of any thread (spawn children run inside the parent's thread and do not block deletion); delete or rebind those threads first.

System tools: `ask_user` (`prompt` + optional `options[{id,label}]`), `map` (`items` array → `$state.mapItems` → `control:map`; optional `instruction` → `$state.mapInstruction`, `maxTokensPerItem` → `$state.mapMaxTokensPerItem`), `wait` (`delayMs` → `$state.waitUntilMs` → `control:wait`) come from `coreCapability.create()` — outputs of the `core` pack (mandatory grant, Studio keeps its checkbox on), not host-registry entries. `load_tools` is likewise granted only through the `core` grant (a service the resolver builds from the run registry); `load_skill`/`Skill` additionally require the host to have filesystem skills. The resolver adds those services after the agent filter, so name them in node `tools` only. There is no `knowledge_upsert`, no `semantic_upsert`, no `semantic_search`. `edit_file` args are `path`, `old_string`, `new_string` (unique match required), not camelCase. ReAct presets that expose map/wait must route `act` → `map` when `exists($state.mapItems)` and `act` → `wait` when `exists($state.waitUntilMs)`, with a map body ending in `control:yield`. Prefer `wait` for mid-run sleep; `schedule_set` for recurring / next-session fires after the run ends.

## Recipes (copy-paste shapes)

Four common delegate/thread patterns. Each is a `calls` element you can pass straight to `agents_spawn` (or the create-args to `agents_create_subagent`).

**Read-only explorer** (can see files, cannot edit; ask-mode would block the child, so grant nothing that needs a confirm):
```json
{ "name": "Read-Only Explorer", "role": "explorer",
  "instructions": "Read files, report findings. Never write or run commands.",
  "packs": { "files": { "disabledTools": ["write_file","edit_file"] }, "core": true } }
```

**Pre-approved worker** (child may write/run without HITL — effective rights are still intersected with yours; a child that needs `fs.write:"allow"` but whose parent has `ask` gets ask-as-deny at spawn, so pre-approve only where you already hold the gate):
```json
{ "name": "Coder", "role": "coder",
  "instructions": "Edit code, run tests, report. Never spawn.",
  "packs": { "files": true, "shell": true, "core": true },
  "permissions": { "fs.write": "allow", "process": "allow" } }
```

**Batch fan-out** (parallel one-shots; give each child a distinct budget cap and everything it needs upfront — children cannot ask back):
```json
{ "calls": [
  { "agentId": "<code-explorer-id>", "input": { "messages": [{" role":"user","content":"Map auth flow in src/auth." }] }, "budget": { "maxSteps": 8, "policy": "error" } },
  { "agentId": "<code-explorer-id>", "input": { "messages": [{" role":"user","content":"Map db schema in src/db." }] },      "budget": { "maxSteps": 8, "policy": "error" } }
]}
```

**Hand-off round-trip to a specialist** (top-level, owns its threads, `agents` pack so it can hand back; the same run continues under the target's stored budget, so size the target's `budget` for the work it will do, not what's left of yours):
```json
{ "name": "Deep Reviewer", "role": "reviewer",
  "instructions": "You are a handoff target. Review what the parent passed, then agents_handoff back to the parent id.",
  "packs": { "files": true, "agents": true, "core": true },
  "budget": { "maxSteps": 60, "policy": "ask" } }
```

## Skills

Three roots, ascending precedence: shipped bundle (`apps/server/assets/skills/<name>/SKILL.md`), host home (`~/.harnesys/skills/<name>/SKILL.md`), workspace (`<workspace>/.harnesys/skills/<name>/SKILL.md`). A later root overrides an earlier one by `name`. Flat `.md` files are ignored; the file must be `<dir>/SKILL.md`. Frontmatter `name`, `description`, `when_to_use` plus body. The agent `skills` array lists names; content loads only via `load_skill(name)`. The registry scans once at server start. Reference only skills that exist.

## Presets

`apps/server/assets/presets/agents/<id>.json` (bundle) and `~/.harnesys/presets/agents/<id>.json` (home), id pattern `^[a-z0-9][a-z0-9-]*$` from the filename. A same-id file in home shadows the bundle. Recognized keys: `name`, `role`, `instructions` (required), `skills`, `mcpServers`, `budget`, `capabilities`, `permissions`, `graph`. Unknown keys (including `model`, `compaction`, `packs`) are silently stripped; model and compaction come from Studio defaults. There is no `tools` key: sending one fails with `tools removed; use sources`. An agent with no `capabilities` grants only `core`. Narrow a source without dropping it: a pack assignment carries `disabledTools` (subtract by name) and `exposure` (`direct`|`deferred` per tool); both validate against that source's own outputs. Without `graph` the host builds the default ReAct loop. The loader zod-checks shape but not the tool-calls invariant; validate the graph yourself. One unparseable file breaks the entire preset listing. Subagents: presets without the `agents` pack (explorer, general) are delegate-safe; agents-pack presets (assistant, coder, orchestrator, researcher) create top-level agents only.

## Before saving (checklist)

1. Every `llm:generate` that can see tools: `tool-calls` edge to a batch `tool:call` over `$output.toolCalls` (or self-loop via act), or `"tools": []`.
2. `core:end` has no `output` expr with negative index.
3. All referenced tool names exist in enabled packs; all pack names are from the table above.
4. Cycles have `budget.maxSteps`/`deadlineMs`; subagents use `policy: "error"` and no `agents` pack.
5. Run `validateStructural` (exported from `harnesys`) against `{ id, prompts: { main: { instructions } }, graph, budget, packs }`; creating via Studio API runs the same gate at save time. Warnings (`spawn_targets_dynamic` on queue-based spawns) are acceptable; errors are not.
6. Compare against a working preset before inventing a new shape; a custom graph needs a concrete reason the loop is insufficient.
