import type { SkillRegistry } from '../../ports/skills.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';

export function createLoadSkillTool(registry: SkillRegistry): ToolDefinition {
  return tool('load_skill', {
    group: 'skills',
    description: 'Load full skill instructions by name from the skill registry',
    input: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
    async execute(input) {
      const { name } = input as { name: string };
      try {
        // Composed registries (compose/prefix/combine/filter) load async.
        const doc = (await registry.load(name)) as { instructions: string };
        return { instructions: doc.instructions };
      } catch (error) {
        return {
          error: true,
          code: 'UNKNOWN_SKILL',
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
}
