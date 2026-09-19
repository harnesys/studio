import type { ToolDefinition } from '../../ports/tools.ts';
export function aliasTool(def: ToolDefinition, name: string): ToolDefinition {
  return {
    ...def,
    name,
    description: `${def.description} (alias of ${def.name})`,
  };
}
