/** Fuzzy spawn-target resolution, shared by the graph and agents_spawn fail-fast.
 *  Order: exact id → unique id prefix (length ≥ 8) → exact name →
 *  case-insensitive name. Every miss lists available `name (id)` so the
 *  model can self-correct. Pure: no runtime imports, no cycles in either direction. */
import type { AgentRosterEntry } from '../ports/create-runtime.ts';

export type AgentTargetOutcome = { id: string } | { error: string };

const MIN_PREFIX_LEN = 8;

export function formatAgentTargets(roster: AgentRosterEntry[]): string {
  return roster.map((e) => `${e.name} (${e.id})`).join(', ');
}

export function resolveAgentTarget(query: string, roster: AgentRosterEntry[]): AgentTargetOutcome {
  const exact = roster.find((e) => e.id === query);
  if (exact) {
    return { id: exact.id };
  }
  if (query.length >= MIN_PREFIX_LEN) {
    const prefixed = roster.filter((e) => e.id.startsWith(query));
    if (prefixed.length === 1 && prefixed[0]) {
      return { id: prefixed[0].id };
    }
    if (prefixed.length > 1) {
      return {
        error: `ambiguous spawn target "${query}": matches ${formatAgentTargets(prefixed)}. Available agents: ${formatAgentTargets(roster)}`,
      };
    }
  }
  const named = roster.filter((e) => e.name === query);
  if (named.length === 1 && named[0]) {
    return { id: named[0].id };
  }
  if (named.length > 1) {
    return {
      error: `ambiguous spawn target "${query}": matches ${formatAgentTargets(named)}. Available agents: ${formatAgentTargets(roster)}`,
    };
  }
  const folded = roster.filter((e) => e.name.toLowerCase() === query.toLowerCase());
  if (folded.length === 1 && folded[0]) {
    return { id: folded[0].id };
  }
  if (folded.length > 1) {
    return {
      error: `ambiguous spawn target "${query}": matches ${formatAgentTargets(folded)}. Available agents: ${formatAgentTargets(roster)}`,
    };
  }
  const available = roster.length > 0 ? formatAgentTargets(roster) : '(none)';
  return { error: `unknown spawn target "${query}". Available agents: ${available}` };
}
