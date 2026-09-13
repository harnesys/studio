import Ajv from 'ajv';
import type { ToolDefinition } from '../ports/tools.ts';
import { resolveToolAlias } from './tool-aliases.ts';

const ajv = new Ajv({ strict: false, allErrors: true });

export function createToolRegistry(tools: ToolDefinition[] = []): Map<string, ToolDefinition> {
  const map = new Map<string, ToolDefinition>();
  for (const t of tools) {
    if (map.has(t.name)) {
      throw new Error(`tool collision: ${t.name}`);
    }
    map.set(t.name, t);
  }
  return map;
}

export function mergeTools(
  base: Map<string, ToolDefinition>,
  extra: ToolDefinition[],
): Map<string, ToolDefinition> {
  const merged = new Map(base);
  for (const t of extra) {
    if (merged.has(t.name)) {
      throw new Error(`tool collision: ${t.name}`);
    }
    merged.set(t.name, t);
  }
  return merged;
}

export function filterToolsForAgent(
  registry: Map<string, ToolDefinition>,
  agent: { tools?: string[]; mcpServers?: string[]; disallowedTools?: string[] },
): Map<string, ToolDefinition> {
  const disallowed = agent.disallowedTools;
  const hasAllowList = agent.tools !== undefined && agent.tools.length > 0;
  if (
    agent.mcpServers === undefined &&
    (disallowed === undefined || disallowed.length === 0) &&
    !hasAllowList
  ) {
    return registry;
  }
  const allowedServers = new Set(agent.mcpServers ?? []);
  const blocked = new Set((disallowed ?? []).map(resolveToolAlias));
  // Requested names keep their alias spelling in the child registry so
  // CC-authored prompts ("use the Glob tool") call tools verbatim.
  const requested = new Map<string, string>();
  if (hasAllowList) {
    for (const name of agent.tools ?? []) {
      requested.set(resolveToolAlias(name), name);
    }
  }
  const out = new Map<string, ToolDefinition>();
  for (const [name, def] of registry) {
    if (requested.size > 0 && !requested.has(name)) {
      continue;
    }
    const isMcp = def.operations?.includes('mcp') ?? false;
    if (isMcp && def.group !== undefined && !allowedServers.has(def.group)) {
      continue;
    }
    if (blocked.has(name)) {
      continue;
    }
    const alias = requested.get(name);
    out.set(alias ?? name, alias !== undefined && alias !== name ? { ...def, name: alias } : def);
  }
  return out;
}

export function validateToolInput(
  schema: unknown,
  data: unknown,
): { ok: boolean; errors?: string } {
  const valid = ajv.validate(schema as never, data);
  if (valid) {
    return { ok: true };
  }
  return { ok: false, errors: ajv.errorsText(ajv.errors) };
}
