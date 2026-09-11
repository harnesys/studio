import type { ToolDefinition } from '../../ports/tools.ts';

/** Same tool reachable under an extra name (symlink); the description says so. */
export function aliasTool(def: ToolDefinition, name: string): ToolDefinition {
  return {
    ...def,
    name,
    description: `${def.description} (alias of ${def.name})`,
  };
}
