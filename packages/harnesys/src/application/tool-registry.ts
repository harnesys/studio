import Ajv from 'ajv';
import type { ToolDefinition } from '../ports/tools.ts';

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
  agent: { mcpServers?: string[] },
): Map<string, ToolDefinition> {
  if (agent.mcpServers === undefined) {
    return registry;
  }
  const allowed = new Set(agent.mcpServers);
  const out = new Map<string, ToolDefinition>();
  for (const [name, def] of registry) {
    const isMcp = def.operations?.includes('mcp') ?? false;
    if (isMcp && def.group !== undefined && !allowed.has(def.group)) {
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
