export const AGENTS_PROMPT_FRAGMENT = `## Agents catalog
- agents_list — agents in this workspace (id, name, role, instructions); optional role/name filters. Role is not unique; match on instructions when several share a role.
- agents_create — create an agent (name, role, instructions; optional tools/skills/mcpServers/budget/capabilities/graph/model). Prefer agents_list and reuse before create. Omit graph for the host default ReAct graph.
- Use returned ids with control:spawn (subcontract) or control:handoff (switch current speaker on this thread).`;
