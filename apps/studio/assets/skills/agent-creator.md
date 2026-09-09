---
name: agent-creator
description: Create agent definitions with proper graphs, capabilities, skills, and structural validation using harnesys engine
when_to_use: Before creating any agent, when updating agent configuration, or when fixing graph validation errors
---
# Agent Creator Skill

Every agent definition requires `id`, `prompts` (at minimum `main`), `graph` (`nodes` + `edges`), optional `budget`, `skills`, `capabilities`, and `mcpServers`. Custom graphs must pass `validateStructural`.

## Required Graph Structure
Exactly one `core:start`, at least one `core:end`. Every non-end node needs ≥1 outgoing edge. If conditional edges exist, default (no `when`) must exist and be LAST for that `from` node. Maximum one default per `from`.

## Node Types (Reference)
- `core:start` / `core:end`
- `llm:generate`: `prompt` (from prompts), `messages` (`$state.*` if present), optional `tools`, `output` (watch reserved keys)
- `tool:call`: fixed (`name` + `args`) OR batch (`calls` + `concurrency`) — never mix. `barrier` only `"all"`. `calls` must evaluate to array.
- `control:assign`: `patch` updates state (`$state` expressions, literals, `{$...}` replacements). Use `reducers` (`replace`/`merge`) for concurrent spawn.
- `control:goto`: `target` evaluates to existing node id.
- `control:interrupt`: `reason` + `resumeSchema`. Blocked in sandbox mode (`sandbox: true`).
- `control:spawn`: `calls` array (`agentId`, `input`), `concurrency` (`parallel`/`sequential`), `barrier: { policy: 'all' }`. Children sandboxed (no ask, no nested spawn, approval denied).
- `control:handoff`: `agentId` (existing agent id), `input` (passes to target agent). Original budget continues.
- `custom:${string}`: host-defined, `config` optional.

## Edge Expressions
`when` supports paths (`$input`, `$state`, `$output`, `$resume` with `.` and `[...]`), binary (`&&`, `||`, `==`, `!=`, `=`, `>`, `<`, `>=`, `<=`), unary (`!`), functions (`exists()`, `length()`), literals. `$state.*` validated only when `state.initial` exists; without it, expressions work at runtime without path validation.

## Budget (Mandatory for Cycles)
Cyclic graphs MUST have `budget.maxSteps` (positive int) or `budget.deadlineMs` (positive int). Policy: `"ask"` (pause with `resumeSchema`, ask user) or `"error"` (fail with `budget_exceeded`). Without budget on cycles = `cycle_budget` validation error.

## Capabilities (Adapter Format)
`z.object({ spec?: ... }).nullable()` — `{}` = enabled (default settings), `{ spec: {...} }` = enabled with settings, `null` = disabled. `true`/`false` = `invalid_type` error. Never pass booleans.

Packs: `files` (read/write/edit/glob/grep), `shell`, `fetch`, `agents` (list/create/spawn/handoff), `threads` (list), `plan` (save/item/update/get), `scheduler` (cron schedules), `webhook`, memory (`episodic`/`knowledge`/`pin`/`semantic`).

## Skill Registry
Skills load from folder structure: `~/.harnesys/skills/<name>/SKILL.md` (system) and `<workspace>/.harnesys/skills/<name>/SKILL.md` (workspace). Flat `.md` files not loaded. Format: YAML frontmatter (`name`, `description`, `when_to_use`) + instructions body.
Agent `skills` array references skill names. Workspace skills override system skills silently.

## Preset Format
`author-agents/presets/*.json`: `name`, `role`, `instructions` required; optional `tools`, `skills`, `mcpServers`, `budget`, `capabilities`, `graph`. When `graph` omitted, host builds default ReAct (`start` → `think` → `act` batch with `calls: '$output.toolCalls'`, `concurrency: 'parallel'` → loop/end).

## Anti-Patterns (Graph Failures)
- Two `start` nodes → `start_count`
- Zero `end` nodes → `end_count`
- Default edge not last → `default_edge`
- More than one default per `from` → `default_edge`
- Missing default when conditionals present → `missing_default`
- Cyclic graph without budget → `cycle_budget`
- `messages` not `$state.*` → `messages_path`
- `calls` non-array → `spawn_calls_shape`
- `agentId` unknown/ambiguous → `spawn_target_missing`
- Capabilities with booleans → `invalid_type`
- `barrier.policy` not `"all"` → `barrier_policy`
- Non-existent `goto` target → `goto_target_missing`
- Missing `prompt` reference → `prompt_missing`
- Reserved `output` keys → `output_key_reserved` warning

## Building Graphs
Refer to `react-preset.ts` for default ReAct pattern. For custom graphs, design nodes first, then edges. Verify with structural validation before saving agent.
