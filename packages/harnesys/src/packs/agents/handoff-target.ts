/** Handoff-target resolution for the `agents_handoff` tool: delegates and
 *  unknown ids come back as tool-level errors, never as a failed run. */
import { formatAgentTargets, resolveAgentTarget } from '../../application/agent-target-resolve.ts';

import type { AgentCatalogSummary } from '../../ports/agents-catalog.ts';

export type HandoffTargetResult = { agentId: string } | { error: string };

export function resolveHandoffTarget(
  id: string,
  rows: AgentCatalogSummary[],
  currentAgentId: string,
): HandoffTargetResult {
  const hit = resolveAgentTarget(id, rows);
  if (!('error' in hit) && hit.id === currentAgentId) {
    return {
      error: 'you are already the speaker of this thread; handoff to yourself is not allowed',
    };
  }
  const delegate =
    'error' in hit ? undefined : rows.find((r) => r.id === hit.id && r.parentId != null);
  if (delegate) {
    const parent = rows.find((r) => r.id === delegate.parentId)?.name ?? delegate.parentId;
    return {
      error: `"${delegate.name}" is a subagent of "${parent}". Handoff passes the thread only between top-level agents; run a delegate with agents_spawn and its result returns to you.`,
    };
  }
  if ('error' in hit && !hit.error.startsWith('ambiguous')) {
    const tops = formatAgentTargets(rows.filter((r) => r.parentId == null)) || '(none)';
    return { error: `unknown handoff target "${id}". Available top-level agents: ${tops}` };
  }
  return 'error' in hit ? hit : { agentId: hit.id };
}
