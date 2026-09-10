import type { AgentRepository } from '../../domain/agent.port.ts';

/** First free display name: `Coder`, then `Coder 2`, `Coder 3`, … */
export function uniqueAgentName(
  agents: AgentRepository,
  workspaceId: string,
  baseName: string,
): string {
  const base = baseName.trim();
  if (!agents.findByName(workspaceId, base)) {
    return base;
  }
  let n = 2;
  while (agents.findByName(workspaceId, `${base} ${n}`)) {
    n += 1;
  }
  return `${base} ${n}`;
}
