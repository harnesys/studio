import type { CapabilityScope } from '../../domain/pack.ts';
import type { CreateAgentsToolsParams } from './create-agents-tools.ts';
export function scopeFor(
  deps: CreateAgentsToolsParams,
  ctx: {
    agentId?: string;
  },
): CapabilityScope {
  const base = deps.resolveScope();
  return ctx.agentId && ctx.agentId !== base.agentId ? { ...base, agentId: ctx.agentId } : base;
}
