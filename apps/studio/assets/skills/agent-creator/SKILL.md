---
name: agent-creator
description: Create agent definitions and presets with valid graphs, packs, skills, and HITL behavior for the harnesys engine
when_to_use: Before creating or editing any agent, preset, or graph; when fixing validation errors; when a run fails with MissingToolResultsError or unexpected permission asks
---
# Agent Creator

Reference for authoring `AgentDefinition`s and Studio presets. The engine executes one node type per graph node and nothing else: `llm:generate` calls the model once and never executes tools; `tool:call` executes tools and never calls the model. All control flow lives in edges.

## The tool-calls invariant (the one that kills runs)

- A `llm:generate` node WITHOUT `tools` sees the entire run registry (all enabled packs). `"tools": []` means explicitly no tools. Omitting the key is not "no tools".
- When the model answers with tool calls, the assistant message (with `toolCalls`) is appended to `$state.messages` even if no edge executes them.
- Any later `llm:generate` in the same run converts those messages and throws `AI_MissingToolResultsError`; the run fails. One unhandled tool call is enough.
- Therefore: every `llm:generate` that can see tools must either route `when: '$output.finishReason = "tool-calls"'` to a batch `tool:call` over `calls: "$output.toolCalls"`, or loop back to itself after that node, or declare `"tools": []`.
- Pure decision/report nodes get `"tools": []` and instruct the model to answer in text.
- Canonical loop (copy this shape; see `../../../server/src/application` and the shipped presets in `apps/studio/assets/skills/agent-creator/presets/`):

```json
"start": { "type": "core:start" },
"think": { "type": "llm:generate", "prompt": "main", "messages": "$state.messages" },
"act":   { "type": "tool:call", "calls": "$output.toolCalls", "concurrency": "parallel", "barrier": { "policy": "all" } },
"end":   { "type": "core:end" }
```
```json
[{ "from": "start", "to": "think" },
 { "from": "think", "to": "act", "when": "$output.finishReason = \"tool-calls\"" },
 { "from": "think", "to": "end" },
 { "from": "act", "to": "think" }]
```

## Graph structure

Exactly one `core:start`; at least one `core:end`. Every node except `core:end` and `control:goto` needs an outgoing edge (`control:handoff` too, formally; runtime never follows it after rebinding). Edges are first-wins by array order. With any `when` edge from a node, a default (no `when`) is required and must be last; at most one default per `from`.

## Nodes

- `core:start`: no fields. Appends the user message to `$state.messages`.
- `core:end`: omit `output` to finish with the last message. Do not write `"$state.messages[-1]"`: negative indexes are not supported, the end node falls back to the literal string as output.
- `llm:generate`: `prompt` (key in `agent.prompts`; Studio maps `main` = agent instructions, so per-node prompts are not available in presets), `messages: "$state.<key>"` (must be a `$state.*` path; this node is the only history writer), `tools?: string[]` (see invariant), `output?: JsonSchema` (structured: keys merge into `$output`; reserved `finishReason`/`text`/`toolCalls` win; avoid combining `output` with tools in one node).
- `tool:call`: fixed form `name` + `args` (args values may be `$…` expressions) OR batch form `calls` (array expr) + `concurrency` + `barrier: { policy: 'all' }` + optional `approve: { tools, reason, resumeSchema }`. Max 32 calls (`tool_call_limit`). Results append to the messages path of the most recent `llm:generate`, in `calls` order; `$output = { results: [{ id, name, result, isError, skipped?, cancelled? }] }`. Reading `$output.results` before the barrier throws `output_not_ready`.
- `control:assign`: `patch: { key: Expr | literal | "text {$...}" }`. Writes go through reducers: default strategy is merge (arrays concat, objects deep-merge), `"replace"` only via `state.reducers`.
- `control:goto`: `target` evaluates to a node id; no `$output` written.
- `control:interrupt`: `reason` + `resumeSchema`; parks the run with an ask. Throws `sandbox_blocked` in a spawned child.
- `control:spawn`: `calls` evaluates to `[{ agentId, input }]`. The `agents_spawn` tool queues that array into `$state.spawns`; route it with `when: 'exists($state.spawns) && length($state.spawns) > 0'`. After completion the queue is cleared and a `"Spawn results: …"` assistant message is appended. Child result = the child's last message. Children run sandboxed: permission gates, `approve`, `ask_user` and `control:interrupt` return `denied in subagent context`. The engine does not limit spawn depth: subagent definitions must not enable the `agents` pack.
- `control:map`: fan-out over `items` (array expr, max 32). `enter` + `body` (node ids) run once per item with `$item` / `$index` slots. Body edges must stay in `body`; each path ends at `control:yield` (optional `value` expr). Workers are sandboxed (no HITL/wait/interrupt). Join barrier is `all`. `$output = { results: [{ index, item, output, error? }] }`. Optional `timeoutMs` + `onTimeout`: `fail` (run `timed_out`) or `partial` (unfinished items get `error.code: "timeout"`). Nested map, `core:end`, and `control:handoff` inside body are validation errors.
- `control:yield`: only inside a map `body`; terminates that worker.
- `control:wait`: parks as lifecycle `waiting` (not `needs_input`). Sleep: `delayMs` or `untilMs` (expr → epoch ms). Gate: omit both, optional `resumeSchema` + `timeoutMs` with `onTimeout` `fail`|`continue`|`interrupt`. Timer ticker auto-resumes; `respond` also wakes gate/sleep early. Forbidden in sandbox/map workers.
- `control:handoff`: `agentId` (resolves by id, id prefix, or name), `input`. The `agents_handoff` tool queues `$state.handoffAgentId`. At runtime handoff rebinds the same run to the target definition and continues from the target's `core:start` with the parent's messages and budget.

## Edge expressions

Operators: `=`, `==`, `!=`, `>`, `<`, `>=`, `<=`, `&&`, `||`, `!`, parentheses, string/number/boolean/null literals, `exists($path)`, `length($path)` (array/string/object; path argument only, not expressions). Paths: `$input`, `$state`, `$output`, `$resume`, and inside map workers also `$item`, `$index`. No arithmetic, no negative indexes. A missing path inside `when` throws `unknown_path` and the edge simply does not match (same for a broken expression); in `args`/`calls` it fails the run. `$state.*` paths are validated statically only when `state.initial` defines the key.

## Permissions and HITL

Gates resolve per operation through `PermissionMap` keyed by OPERATIONS, not tool names; unknown operation defaults to `ask`, mixed gates take the worst. Default map: `fs.read` allow; `fs.write`, `process`, `network`, `mcp` ask. Tool operations: `read_file`/`list_dir`/`glob`/`grep` = `fs.read`; `write_file`/`edit_file` = `fs.write`; `shell` = `process`; `fetch` = `network`; MCP tools = `mcp`. `plan_*`, `agents_*`, `threads`, memory, scheduler and webhook tools declare no operations and are never gated. A `deny` fails the call; an `ask` parks the run per call (one approval per gated call in a batch) with resume `{ approved }`; denial is terminal for that call, never re-send it unchanged. Studio run modes (plan/ask/auto/dont_ask/bypass) map to these operations in `../../../server/src/adapters`.

## Budget

`budget: { maxSteps?, maxTokens?, deadlineMs?, policy?: "ask" | "error" }`. Cyclic graphs require `maxSteps` or `deadlineMs` (`cycle_budget`). `maxTokens` absent = unlimited (cumulative usage across calls; small values trip after a couple of rounds, avoid it unless intended). On exhaustion with `policy: "ask"` the run parks and continue resets the window; `error` fails with `budget_exceeded`. Children cannot answer asks: use `policy: "error"` for subagents.

## Packs

Definition field is `packs` (Studio records and preset files carry the legacy key `capabilities`; the bridge maps it). Value shapes: `{}` = enabled with defaults, `{ spec: {...} }` = enabled with settings, absent/null = off; booleans are rejected by preset/tool input schemas, do not use them. Exact names, wrong ones silently warn `pack_unknown` and load nothing:

| pack | tools |
|---|---|
| `files` | `read_file`, `write_file`, `edit_file`, `list_dir`, `glob`, `grep` |
| `shell` | `shell` (arg: `command`) |
| `fetch` | `fetch` (arg: `url`; the old name `http` no longer exists) |
| `plan` | `plan_save`, `plan_item_update`, `plan_get` |
| `agents` | `agents_list`, `agents_create`, `agents_create_subagent`, `agents_spawn`, `agents_handoff` |
| `threads` | `thread_list` |
| `scheduler` | `schedule_list`, `schedule_peek`, `schedule_set`, `schedule_pause`, `schedule_delete` |
| `webhook` | `webhook_list`, `webhook_set`, `webhook_delete` |
| `episodic-memory` | `recall_search` |
| `semantic-memory` | `memory_write`, `memory_list`, `memory_delete` |
| `knowledge-memory` | `knowledge_search`, `knowledge_read` |
| `pin-memory` | `pin_set`, `pin_list`, `pin_remove` |

`agents_create` makes a standalone top-level agent visible to the user; `agents_create_subagent` makes a one-shot delegate under the calling agent (spawn target; `agents` pack rejected, permissions intersected with the caller's).

System tools are always registered: `load_tools`, `load_skill`, `ask_user` (`prompt` + optional `options[{id,label}]`), `map` (`items` array → `$state.mapItems` → `control:map`), `wait` (`delayMs` → `$state.waitUntilMs` → `control:wait`). There is no `knowledge_upsert`, no `semantic_upsert`, no `semantic_search`. `edit_file` args are `path`, `old_string`, `new_string` (unique match required), not camelCase. ReAct presets that expose map/wait must route `act` → `map` when `exists($state.mapItems)` and `act` → `wait` when `exists($state.waitUntilMs)`, with a map body ending in `control:yield`. Prefer `wait` for mid-run sleep; `schedule_set` for recurring / next-session fires after the run ends.

## Skills

Three roots, ascending precedence: shipped bundle (`apps/studio/assets/skills/<name>/SKILL.md`), host home (`~/.harnesys/skills/<name>/SKILL.md`), workspace (`<workspace>/.harnesys/skills/<name>/SKILL.md`). A later root overrides an earlier one by `name`. Flat `.md` files are ignored; the file must be `<dir>/SKILL.md`. Frontmatter `name`, `description`, `when_to_use` plus body. The agent `skills` array lists names; content loads only via `load_skill(name)`. The registry scans once at server start. Reference only skills that exist.

## Presets

`<skills-root>/agent-creator/presets/<id>.json`, id pattern `^[a-z0-9][a-z0-9-]*$` from the filename. Shipped presets live in the bundle; a same-id file in home or workspace shadows it. Recognized keys: `name`, `role`, `instructions` (required), `tools`, `skills`, `mcpServers`, `budget`, `capabilities`, `graph`. Unknown keys (including `model`, `compaction`, `packs`) are silently stripped; model and compaction come from Studio defaults. Without `graph` the host builds the default ReAct loop. The loader zod-checks shape but not the tool-calls invariant; validate the graph yourself. One unparseable file breaks the entire preset listing.

## Before saving (checklist)

1. Every `llm:generate` that can see tools: `tool-calls` edge to a batch `tool:call` over `$output.toolCalls` (or self-loop via act), or `"tools": []`.
2. `core:end` has no `output` expr with negative index.
3. All referenced tool names exist in enabled packs; all pack names are from the table above.
4. Cycles have `budget.maxSteps`/`deadlineMs`; subagents use `policy: "error"` and no `agents` pack.
5. Run `validateStructural` (exported from `harnesys`) against `{ id, prompts: { main: { instructions } }, graph, budget, packs }`; creating via Studio API runs the same gate at save time. Warnings (`spawn_targets_dynamic` on queue-based spawns) are acceptable; errors are not.
6. Compare against a working preset before inventing a new shape; a custom graph needs a concrete reason the loop is insufficient.
