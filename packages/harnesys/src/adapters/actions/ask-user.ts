import { AskUserInterrupt } from '../../domain/errors.ts';
import { tool } from '../../ports/tools.ts';
import type { ToolDefinition } from '../../ports/tools.ts';

export const ASK_USER_TOOL = 'ask_user';

export function askUser(): ToolDefinition {
  return tool(ASK_USER_TOOL, {
    group: 'core',
    description: 'Ask the human a question and wait for their reply. Use for clarifications, choices, or missing information before continuing.',
    input: {
      type: 'object',
      properties: {
        prompt: { type: 'string', minLength: 1 },
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string', minLength: 1 }, label: { type: 'string', minLength: 1 } },
            required: ['id', 'label'],
          },
        },
        multi: { type: 'boolean' },
      },
      required: ['prompt'],
    },
    execute(input) {
      const parsed = input as { prompt: string; options?: Array<{ id: string; label: string }>; multi?: boolean };
      throw new AskUserInterrupt(parsed);
    },
  });
}