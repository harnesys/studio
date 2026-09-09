---
name: master-orchestrator
description: Manage workspace setup, agent team design, schedules, memory, and multi-agent coordination
when_to_use: "For workspace-level management: setting up agents, building knowledge bases, configuring schedules, coordinating specialist agents"
---
# Master Orchestrator Skill

## Scope
This skill covers workspace-level coordination across all capabilities: agent design (`agents`), planning (`plan`), scheduling (`scheduler`), memory (`episodic`, `knowledge`, `pin`, `semantic`), workspace setup (`workspace-setup`), and team delegation (`orchestrator-coordination`).

## When Not to Use
Don't use this for single-file code edits (use `code-implementation`). Don't use this for investigating single bugs (use `systematic-debugging`). Don't use this for designing a single feature (use `brainstorm` first).

## Workspace Inspection Pattern
Before any workspace change, gather evidence:

```bash
# Inspect agents
agents_list

# Inspect schedules
schedule_list
schedule_peek <id>

# Inspect memory
pin_list
recall_search "query"
knowledge_search "topic"
semantic_search "concept"

# Inspect workspace files
list_dir <workspace-path>
read_file <workspace-path>/.harnesys/skills/<name>/SKILL.md
```

Always cite the exact file path or command output in your brief.

## Agent Team Design Pattern
For multi-agent tasks:

1. **Plan**: Use `plan_save` with structured items (`id`, `order`, `title`, `status`, `description`).
2. **Design team**: Check `agents_list`. If specialist needed (e.g., `coder` for code changes, `reviewer` for review), either reuse existing agent or create (`agents_create`) with appropriate `graph`, `capabilities`, `skills`, and `budget`.
3. **Delegate**: Use `control:spawn` with `calls` array (`agentId`, `input`). Provide complete input (`messages`, any needed `files` references, `state` context). Children run sandboxed — they cannot ask user or use interactive tools.
4. **Monitor**: Use `state` tracking (`control:assign`) to accumulate spawn outputs (`results`, `findings`, `errors`).
5. **Synthesize**: After spawn/accumulation, use `llm:generate` to combine results into a final brief or action.
6. **Hand off**: If specialist should take ownership (`review` after `code`), use `control:handoff` with `agentId` from `agents_list` and `input` passing accumulated messages/state.

## Memory and Knowledge Building
When building persistent workspace knowledge:

- `knowledge_upsert`: Add files or URLs with structured facts. Each entry should include `content` and `source`. Use `plan_save` to structure the ingestion steps.
- `pin_set`: Add persistent rules visible to all agents (`budget` policies, naming conventions, forbidden patterns). Keep pins focused — max 32 items (`maxItems` setting).
- `semantic_upsert`: Build conceptual index for recall. Combine with `recall_search` during agent execution.
- `episodic_memory`: Search past thread experience. Useful when the same task recurs.

Always verify memory state after changes (`pin_list`, `knowledge_search`, `semantic_search`).

## Schedule Management Pattern
For periodic or event-driven tasks:

1. Create: `schedule_set` with `targetAgentId`, `threadId` (`"self"` to wake current chat, UUID for dedicated thread, omit for new isolated thread), `cron`, `history` (`none`/`last`/`all`), `historyLast`, and `mode` (`run` mode: `ask`/`error`).
2. Monitor: `schedule_peek` to check last fire results (`runId`, `agentId`, events, errors).
3. Pause/Resume: `schedule_pause` by `id`.
4. Clean up: `schedule_delete` for obsolete schedules.

One schedule per thread. Dedicated schedule threads keep logs isolated from chat threads.

## Graph Design Rules (Critical)
Every agent using a custom `graph` must follow these structural rules (validated by `harnesys`):

- Exactly one `core:start` node
- At least one `core:end` node
- Every non-end node must have at least one outgoing edge
- At most one default (no `when`) edge per `from` node
- Default edge (if any conditional edges exist) must be LAST in the edge list for that `from`
- If graph has cycles, `budget.maxSteps` or `budget.deadlineMs` MUST be set (`policy`: `ask` or `error`)
- `llm:generate` nodes must reference an existing `prompt` key in agent `prompts` (default is `main`)
- `messages` expressions must reference `$state.messages` (or another state path — validated only when `state.initial` exists)
- `tool:call` batch nodes (`calls` + `concurrency`) and fixed nodes (`name` + `args`) are mutually exclusive per node
- `barrier.policy` for spawn must be `"all"`
- `control:goto` target must exist in nodes and be a valid `string` or expression evaluating to a node id
- `control:spawn` `calls` must evaluate to array of `{ agentId, input }`
- `control:handoff` `agentId` must resolve to existing agent; `input` is `Expr | Record<string, Expr | unknown>`
- `control:assign` `patch` updates state; expressions reference `slots` (`$input`, `$state`, `$output`, `$resume`)

## System Workflow Example
```
1. Inspect workspace (`agents_list`, `schedule_list`, `pin_list`, `plan_get`)
2. Identify user's request (setup team / build knowledge / configure schedule)
3. Plan steps (`plan_save`)
4. Execute: create/update agents with appropriate graphs and capabilities
5. Configure skills (workspace-level or reference system skills by name in agent `skills` array)
6. Build memory (`knowledge_upsert`, `pin_set`, `semantic_upsert`)
7. Configure schedules (`schedule_set`) if needed
8. Verify (`agents_list`, `schedule_peek`, `pin_list`, `plan_get`, `shell` for file inspection)
9. Report results with exact file paths and command outputs
```

## Anti-Patterns
- Creating new agents without checking `agents_list`
- Using `control:spawn` with ambiguous `agentId`
- Missing `budget` on cyclic graphs
- Using `control:goto` with non-existent target
- Not providing complete `input` for spawn (children are sandboxed)
- Not verifying workspace state after changes
