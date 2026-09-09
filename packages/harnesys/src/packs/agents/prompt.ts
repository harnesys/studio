export const AGENTS_PROMPT_FRAGMENT = `## Agents catalog
- agents_list — agents in this workspace (id, name, role, instructions); optional role/name filters. Role is not unique; match on instructions when several share a role.
- agents_create — create an agent (name, role, instructions; optional tools/skills/mcpServers/budget/capabilities/graph/model). Prefer agents_list and reuse before create. Omit graph for the host default ReAct graph.
- agents_spawn — subcontract this turn. calls: [{ agentId, input }]. input is usually { messages: [{ role: "user", content: "<task>" }] }. The graph runs control:spawn after the tool. Do not call control:spawn as a tool name.
- agents_handoff — pass this thread to agentId (current speaker changes). The graph runs control:handoff after the tool. Do not call control:handoff as a tool name.`;
