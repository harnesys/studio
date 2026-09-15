import { definePack } from '../../domain/pack.ts';
import type { AgentsCatalogPort } from '../../ports/agents-catalog.ts';
import { createAgentLifecycleTools } from './create-agent-lifecycle-tools.ts';
import { createAgentsHandoffTool } from './create-agents-handoff-tool.ts';
import { createAgentsTools } from './create-agents-tools.ts';

export type AgentsCapabilityPorts = { agents: AgentsCatalogPort };

export const agentsCapability = definePack<AgentsCapabilityPorts, Record<string, unknown>>({
  name: 'agents',
  version: '1.0.0',
  description:
    'Agent catalog: agents_list / agents_create / agents_spawn / agents_handoff / agents_update / agents_delete',
  icon: 'agents',
  meta: {
    tools: [
      {
        name: 'agents_list',
        description:
          'List agents in this workspace (id, name, role, instructions, packs, model). Optional role/name filters; role is not unique. packs lists enabled source assignments per agent; tool availability derives from those sources, not from a stored tool-name list. Prefer reuse via agents_list before agents_create. Spawned children are one-shot with no interactive user: judge fit by packs/model before agents_spawn.',
      },
      {
        name: 'agents_create',
        description:
          'Create an agent in this workspace. Returns { id, name }. Before creating, load_skill("agent-creator") for graphs, packs, budget, and HITL. Omit graph to let the host build a default ReAct graph and store budget { maxSteps: 50, policy: "ask" } when budget is omitted. budget.policy is ask|error. Call agents_list first to reuse an existing agent when possible.',
      },
      {
        name: 'agents_spawn',
        description:
          'Queue one-shot subcontracts: the graph then runs control:spawn. calls is [{ agentId, input }]. input is usually { messages: [{ role: "user", content: "<task>" }] }. Children cannot ask questions back (permission/approval/input tools are denied in child context); provide everything upfront. agentId accepts an exact id, a unique id prefix (8+ chars), or a name — unknown/ambiguous targets fail here with the agent list. Prefer agents_list (reuse) before agents_create. This is not the tool name control:spawn.',
      },
      {
        name: 'agents_handoff',
        description:
          'Pass this thread to another agent (current speaker changes, origin stays). The graph then runs control:handoff. agentId from agents_list or agents_create. This is not the tool name control:handoff. Top-level agents only; delegates must be run via agents_spawn.',
      },
      {
        name: 'agents_update',
        description:
          'Patch name/role/instructions/budget of your own delegate; graph, tools and packs are owner-only. budget replaces the stored budget (omitted fields drop out): maxSteps/maxTokens/deadlineMs (integers >= 1) and policy ask|error, same shape as agents_create, at least one field required. Returns { agentId }. agentId accepts an exact id, a unique id prefix (8+ chars), or a name.',
      },
      {
        name: 'agents_delete',
        description:
          'Remove your own delegate that is not running anywhere; workspace UI manages top-level agents. Returns { removed, name }. agentId accepts an exact id, a unique id prefix (8+ chars), or a name.',
      },
    ],
    skills: [],
    hasSettings: false,
  },
  create: (ctx) => ({
    tools: [
      ...createAgentsTools({ agents: ctx.ports.agents, resolveScope: () => ctx.scope }),
      createAgentsHandoffTool({ agents: ctx.ports.agents, resolveScope: () => ctx.scope }),
      ...createAgentLifecycleTools({ agents: ctx.ports.agents, resolveScope: () => ctx.scope }),
    ],
  }),
});
