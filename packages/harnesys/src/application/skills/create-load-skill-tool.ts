import type { SkillDocument } from '../../domain/skill.ts';
import type { SkillRegistry } from '../../ports/skills.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
export function createLoadSkillTool(registry: SkillRegistry): ToolDefinition {
  return tool('load_skill', {
    group: 'skills',
    description:
      'Load full skill instructions by name from the skill registry. ' +
      '{name} returns the instructions plus the supporting-file list; ' +
      '{name, file} reads one supporting file (relative path from that list) from the skill directory.',
    input: {
      type: 'object',
      properties: { name: { type: 'string' }, file: { type: 'string' } },
      required: ['name'],
    },
    async execute(input) {
      const { name, file } = input as {
        name: string;
        file?: string;
      };
      let doc: SkillDocument;
      try {
        doc = (await registry.load(name)) as SkillDocument;
      } catch (error) {
        return {
          error: true,
          code: 'UNKNOWN_SKILL',
          message: error instanceof Error ? error.message : String(error),
        };
      }
      if (file === undefined || file === '') {
        return { instructions: doc.instructions, files: doc.files ?? [] };
      }
      try {
        const skillFile = await registry.loadFile(name, file);
        return { file: skillFile.path, content: skillFile.content };
      } catch (error) {
        return {
          error: true,
          code: 'UNKNOWN_SKILL_FILE',
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
}
