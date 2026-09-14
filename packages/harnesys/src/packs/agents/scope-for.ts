/** Скоуп тула глазами текущего спикера рана. Экземпляры паков собираются под
 *  стартовым агентом, а control:handoff меняет спикера посреди рана: ownership,
 *  списки каталога и self-гейты должны сверяться с ctx.agentId, не с замыканием. */
import type { CapabilityScope } from '../../domain/pack.ts';
import type { CreateAgentsToolsParams } from './create-agents-tools.ts';

export function scopeFor(
  deps: CreateAgentsToolsParams,
  ctx: { agentId?: string },
): CapabilityScope {
  const base = deps.resolveScope();
  return ctx.agentId && ctx.agentId !== base.agentId ? { ...base, agentId: ctx.agentId } : base;
}
