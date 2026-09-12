import { type AgentMode, ASK_MODE, DEFAULT_MODE_ID } from '@harnesys/studio-shared';
import type { Agent, AgentRepository } from '../../domain/agent.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';

export function requireAgent(agents: AgentRepository, workspaceId: string, agentId: string): Agent {
  const found = agents.findById(agentId);
  if (!found || found.workspaceId !== workspaceId) {
    throw new NotFoundError('agent not found');
  }
  return found;
}

export function validateModeIds(modes: AgentMode[]): void {
  const ids = new Set<string>();
  for (const mode of modes) {
    if (ids.has(mode.id)) {
      throw new ValidationError(`duplicate mode id: ${mode.id}`);
    }
    ids.add(mode.id);
  }
}

/** 'ask' is builtin on every agent: tolerated exactly once, appended when absent. */
export function ensureAskMode(modes: AgentMode[]): AgentMode[] {
  return modes.some((mode) => mode.id === DEFAULT_MODE_ID) ? modes : [...modes, { ...ASK_MODE }];
}

export function validateDefaultModeId(defaultModeId: string | null, modes: AgentMode[]): void {
  if (defaultModeId === null || defaultModeId === DEFAULT_MODE_ID) {
    return;
  }
  if (!modes.some((mode) => mode.id === defaultModeId)) {
    throw new ValidationError(`unknown defaultModeId: ${defaultModeId}`);
  }
}
