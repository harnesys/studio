---
name: orchestrator-coordination
description: Coordinate agent teams through spawn, handoff, and state accumulation
when_to_use: When managing multi-agent tasks or delegating focused work
---
# Orchestrator Coordination Skill

## Core Pattern
Always reuse existing agents (`agents_list`) before creating new ones (`agents_create`). Prefer spawn delegates already under the current agent (Explorer / General seeds). Delegate with `control:spawn`. Transfer ownership with `control:handoff` only to top-level agents. Accumulate results with `control:assign`.

## Agent Reuse
Before any delegation:
1. Call `agents_list` (returns top-level agents plus this agent's own delegates)
2. Prefer a seeded delegate by name/id for read-only research (`agents_spawn`)
3. Filter by role (`coder`, `reviewer`, etc.), name, or declared tools for specialists
4. Only `agents_create` a top-level agent when you need a new handoff target; never create top-level for a one-shot spawn

## Spawn Pattern (Delegation)
Use `control:spawn` in agent graphs for parallel or sequential delegation:

```json
{
  "type": "control:spawn",
  "calls": "$state.spawnPlan",
  "concurrency": "parallel",
  "barrier": { "policy": "all" }
}
```

Requirements:
- `calls`: Array of `{ agentId: string, input: unknown }`
- `agentId`: Exact agent id, unique prefix (8+ chars), or agent name
- If ambiguous or unknown, spawn fails — list agents first
- Children run in sandbox (`sandbox: true`) — they CANNOT ask user, run approval-gated tools, or spawn further children
- Provide complete input in `{ messages: [{ role: "user", content: "..." }] }` format — children don't interact back
- `barrier: { policy: "all" }` waits for all children before continuing
- `concurrency`: `"parallel"` (recommended) or `"sequential"`

## Handoff Pattern (Ownership Transfer)
When one specialist should own the thread:

```json
{
  "type": "control:handoff",
  "agentId": "$state.specialistId",
  "input": { "messages": "$state.messages", "context": "$state.accumulated" }
}
```

Requirements:
- `agentId`: Must resolve to an existing **top-level** agent in workspace (not a spawn delegate)
- `input`: Usually passes messages and accumulated state
- After handoff, the new agent's graph runs from its `start` node
- The original agent's budget (maxSteps/deadlineMs) continues to apply
- Host rejects handoff onto delegates; use `agents_spawn` for those

## State Accumulation
When collecting results from multiple sources:

```json
{
  "type": "control:assign",
  "patch": {
    "results": "$output.results"
  }
}
```

Requirements:
- `patch` is `Record<string, Expr | unknown>`
- Expressions (`$state.key`, literal) are evaluated from `slots` (`input`, `state`, `output`, `resume`)
- For concurrent spawn results, use `state.reducers` to avoid race conditions (`replace` vs `merge`)

## Planning for Orchestration
Keep orchestration plans short. Each step names an agent owner and exit criteria. Use `plan` capability (`plan_save`, `plan_get`, `plan_item_update`) to track execution state.

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|---|---|---|
| Creating top-level agent for one-shot research | Clutters sidebar; delegates already exist | `agents_list` then `agents_spawn` on Explorer/General |
| Creating new agent without checking `agents_list` | Wastes agents, duplicates capabilities | Always list first |
| Spawn with `calls` missing `agentId` | Fails at validation — `calls[*].agentId` required | Provide exact agent id or unique prefix |
| Spawn without complete input | Child runs sandbox — can't ask back | Include full task description and any needed files/state |
| Handoff to a delegate / non-existent agent | Host rejects delegates; resolve fails otherwise | Handoff only top-level; spawn delegates |
| No budget on cyclic orchestration graph | Validation requires `maxSteps` or `deadlineMs` for cycles | Always set `budget` when graph loops |
