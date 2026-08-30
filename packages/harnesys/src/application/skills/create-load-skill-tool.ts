import { tool } from '../../ports/tools.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import type { SkillRegistry } from '../../ports/skills.ts';

export function createLoadSkillTool(registry: SkillRegistry): ToolDefinition {
  return tool('load_skill', {
    group: 'skills',
    description: 'Load full skill instructions by name from the skill registry',
    input: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
    execute(input) {
      const { name } = input as { name: string };
      try {
        const doc = registry.load(name) as { instructions: string };
        return Promise.resolve({ instructions: doc.instructions });
      } catch (error) {
        return Promise.resolve({ error: true, code: 'UNKNOWN_SKILL', message: error instanceof Error ? error.message : String(error) });
      }
    },
  });
}
