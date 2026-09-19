import { MAX_BATCH } from '../../constants.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { resolveToolAlias } from '../tool-aliases.ts';
export function createLoadToolsTool(registry: Map<string, ToolDefinition>): ToolDefinition {
  return tool('load_tools', {
    description:
      'Load tool schemas by exact name. Deferred tools (e.g. browser, web search) are not listed in this session until loaded: call load_tools with their names, then call them normally.',
    sideEffect: 'read',
    revealsTools: true,
    input: {
      type: 'object',
      properties: {
        names: { type: 'array', items: { type: 'string' }, maxItems: MAX_BATCH },
      },
      required: ['names'],
    },
    execute(input) {
      const parsed = input as {
        names: string[];
      };
      const loaded: string[] = [];
      const unknown: string[] = [];
      const tools: {
        name: string;
        description: string;
        input: unknown;
      }[] = [];
      for (const name of parsed.names ?? []) {
        const def = registry.get(name) ?? registry.get(resolveToolAlias(name));
        if (!def) {
          unknown.push(name);
          continue;
        }
        loaded.push(def.name);
        tools.push({ name: def.name, description: def.description, input: def.input });
      }
      return { loaded, unknown, tools };
    },
  });
}
