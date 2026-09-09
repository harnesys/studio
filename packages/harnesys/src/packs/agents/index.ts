import { defineCapability } from '../../domain/pack.ts';
import type { AgentsCatalogPort } from '../../ports/agents-catalog.ts';
import { createAgentsTools } from './create-agents-tools.ts';
import { AGENTS_PROMPT_FRAGMENT } from './prompt.ts';

export type AgentsCapabilityPorts = { agents: AgentsCatalogPort };

export const agentsCapability = defineCapability<AgentsCapabilityPorts>({
  name: 'agents',
  version: '1.0.0',
  description: 'Agent catalog: agents_list / agents_create / agents_spawn / agents_handoff',
  requires: ['agents'],
  tools: (ctx) => createAgentsTools({ agents: ctx.ports.agents, resolveScope: ctx.resolveScope }),
  prompt: () => AGENTS_PROMPT_FRAGMENT,
});
