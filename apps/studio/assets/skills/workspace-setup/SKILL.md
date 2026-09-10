---
name: workspace-setup
description: Configure workspace agents, skills, capabilities, schedules, memory, and workspace meta
when_to_use: When setting up or reconfiguring agent workspace environment
---
# Workspace Setup Skill

## Core Purpose
Guide users through configuring workspace-level agent runtime settings: agent catalog, assigned capabilities (packs), skill registry references, MCP server connections, schedules, webhooks, and memory/knowledge configurations.

## When Not to Use
Don't use this for single-file edits (use `code-implementation`). Don't use this for investigating bugs (use `systematic-debugging`). Don't use this for designing new architecture (use `brainstorm`).

## Workspace Meta Structure
Workspace meta lives at `<workspace>/.harnesys/`:

```
.workspace/.harnesys/
  skills/             # Workspace skills (`<name>/SKILL.md`)
  mcp.json            # MCP server configurations
  threads/            # Thread attachments and logs
```
System skills live at `~/.harnesys/skills/` (folder/`SKILL.md` format). System skills are always loaded by `FsSkillRegistry` via `skillRegistryRoots()` — they bind to any workspace by default.

## Agent Catalog Setup Pattern
Before creating new agents:

1. Inspect existing agents: `agents_list`
2. Check declared capabilities: `capabilities` (`files`, `shell`, `fetch`, `agents`, `threads`, `plan`, `scheduler`, `webhook`, `episodic-memory`, `semantic-memory`, `knowledge-memory`, `pin-memory`)
3. Check skills: `skills` array references registry skill names (from `~/.harnesys/skills/` and workspace `.harnesys/skills/`)
4. Check budget: `maxSteps`, `maxTokens`, `deadlineMs`, `policy` (`ask` or `error`)
5. Check graph: `graph.nodes` (must have exactly 1 `core:start`, at least 1 `core:end`), `graph.edges` (default edge must be last per `from`)

When creating new agents (`agents_create`):
- Set `name`, `role`, `instructions`
- Assign `capabilities` (enabled packs as `{}` or with `{ spec: {...} }`; disabled as `null`; omit for default)
- Set `skills` array (skill names from registry)
- Set `mcpServers` array (allowed server IDs from `.harnesys/mcp.json`)
- Omit `graph` to use the host default ReAct graph; the host then stores `budget: { maxSteps: 50, policy: "ask" }` if `budget` is omitted
- For a custom cyclic graph, pass `budget.maxSteps` or `budget.deadlineMs`; `budget.policy` is `ask` or `error`

## Skill Registry Pattern
Skills are loaded by `FsSkillRegistry` from two roots (system first, workspace second):

```typescript
roots: [systemSkillsPath(), workspaceSkillsPath(workspacePath)]
```

System skills (`~/.harnesys/skills/`) are always available. Workspace skills (`<workspace>/.harnesys/skills/`) override system skills with the same name. Skill format: folder name = skill name, `SKILL.md` inside with YAML frontmatter (`name`, `description`, optional `when_to_use`) followed by instructions body.

When creating skills (`createWorkspaceSkill`):
- Name must be kebab-case (`[a-z0-9][a-z0-9-]*`)
- Description is required
- Instructions body is required (non-empty)
- File saved to `<workspace>/.harnesys/skills/<name>/SKILL.md`

## Capability (Pack) Assignment Pattern
Capabilities are assigned to agents as `capabilities` record. Each pack provides tools and optionally skills:

- `files`: `read_file`, `write_file`, `edit_file`, `list_dir`, `glob`, `grep`
- `shell`: `shell` command execution
- `fetch`: `fetch` HTTP requests
- `agents`: `agents_list`, `agents_create`, `agents_spawn`, `agents_handoff`
- `threads`: `thread_list`
- `plan`: `plan_save`, `plan_item_update`, `plan_get`
- `scheduler`: `schedule_list`, `schedule_set`, `schedule_pause`, `schedule_delete`, `schedule_peek`
- `webhook`: `webhook_list`, `webhook_set`, `webhook_delete`
- `episodic-memory`: `recall_search`
- `knowledge-memory`: `knowledge_search`, `knowledge_read`
- `pin-memory`: `pin_set`, `pin_list`, `pin_remove`
- `semantic-memory`: `memory_write`, `memory_list`, `memory_delete`

Values: `{}` = enabled (default spec); `{ spec: {...} }` = enabled with settings; `null` = disabled/omitted.

## Memory and Knowledge Pattern
Memory capabilities build persistent workspace context:

- `memory_write`: Store a curated semantic fact (`scope: session` or `long`).
- `pin_set`: Persistent rules visible to agents. Keep focused (max `maxItems` default 32). Use for conventions, forbidden patterns, budget policies.
- `knowledge_search` / `knowledge_read`: Search the indexed corpus, then read a hit by id. The index is built from knowledge roots, not from a write tool.
- `recall_search`: Search past thread experience. Read-only.

Always verify memory state after changes (`pin_list`, `memory_list`, `knowledge_search`, `recall_search`).

## Schedule Pattern
Schedules (`scheduler` capability) manage periodic agent execution:

- `schedule_set`: Create/update cron job. Fields: `targetAgentId`, `threadId` (`"self"` = this chat, fires after the current run is idle; UUID = specific thread; omit = new dedicated thread), `cron`, `mode` (`ask`/`auto`/`dont_ask`/`bypass`), `history` (`none`/`last`/`all`), `historyLast`. `nextRunAt` is the next cron instant, not create time.
- `schedule_peek`: Read last fire results (run journal, agent messages, tool results, errors).
- `schedule_pause`: Pause/resume by `id`.
- `schedule_delete`: Remove obsolete schedules.

One schedule per thread. Dedicated schedule threads keep logs isolated from chat threads.

## Verification Pattern
After any workspace change, inspect:

1. `agents_list` — verify agents exist with correct `capabilities`, `skills`, `graph`
2. `schedule_list` — verify schedules configured with correct `cron` and `targetAgentId`
3. `plan_get` — verify execution plans if `plan` capability used
4. `pin_list` / `memory_list` / `knowledge_search` / `recall_search` — verify memory state
5. `shell` or `read_file` — inspect `.harnesys/skills/` and workspace meta for file-level verification
