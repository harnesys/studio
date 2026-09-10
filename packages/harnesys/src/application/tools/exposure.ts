import { LOAD_TOOLS_NAME, MAX_CATALOG_CHARS, MAX_CATALOG_ENTRIES } from '../../constants.ts';
import type { ToolDefinition } from '../../ports/tools.ts';

export { LOAD_TOOLS_NAME };

export function loadedToolsOf(state: Record<string, unknown>): string[] {
  const v = state.loadedTools;
  return Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string') : [];
}

/**
 * Progressive tool set for one LLM step.
 * Schema set changes only when `loaded` grows (successful load_tools).
 * Expect one prefix-cache bust on that step; the next step should hit again
 * if instructions + history prefix are unchanged.
 */
export function resolveProgressiveTools(
  resolved: string[],
  registry: Map<string, ToolDefinition>,
  loaded: string[],
): { toolNames: string[]; deferredPending: string[] } {
  const canLoad = registry.has(LOAD_TOOLS_NAME);
  const deferredPending = canLoad
    ? resolved.filter((n) => registry.get(n)?.exposure === 'deferred' && !loaded.includes(n))
    : [];
  if (deferredPending.length === 0) {
    return { toolNames: resolved, deferredPending };
  }
  const toolNames = resolved.filter((n) => !deferredPending.includes(n));
  if (!toolNames.includes(LOAD_TOOLS_NAME)) {
    toolNames.push(LOAD_TOOLS_NAME);
  }
  for (const n of loaded) {
    if (registry.has(n) && !toolNames.includes(n)) {
      toolNames.push(n);
    }
  }
  return { toolNames, deferredPending };
}

export function formatDeferredCatalog(
  deferredPending: string[],
  registry: Map<string, ToolDefinition>,
): string {
  const shown = deferredPending.slice(0, MAX_CATALOG_ENTRIES);
  const lines = shown.map((n) => {
    const def = registry.get(n);
    return `- ${n}: ${def?.description ?? ''}`;
  });
  if (deferredPending.length > shown.length) {
    lines.push(`+${deferredPending.length - shown.length} more`);
  }
  let text = `Deferred tools (schemas via load_tools):\n${lines.join('\n')}`;
  if (text.length > MAX_CATALOG_CHARS) {
    text = `${text.slice(0, MAX_CATALOG_CHARS)}\n…(catalog truncated)`;
  }
  return text;
}
