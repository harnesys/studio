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

/** Deny-only subtract: agent `disallowedTools` (alias spellings) and MCP groups outside `mcpServers`. */
export function subtractDeniedTools(
  registry: Map<string, ToolDefinition>,
  agent: { mcpServers?: string[]; disallowedTools?: string[] },
): Map<string, ToolDefinition> {
  const blocked = new Set((agent.disallowedTools ?? []).map(resolveToolAlias));
  const allowedServers = new Set(agent.mcpServers ?? []);
  const out = new Map<string, ToolDefinition>();
  for (const [name, def] of registry) {
    const isMcp = def.operations?.includes('mcp') ?? false;
    if (isMcp && def.group !== undefined && !allowedServers.has(def.group)) {
      continue;
    }
    if (blocked.has(name)) {
      continue;
    }
    out.set(name, def);
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
