import { askUserSchema } from '../../application/ask-schema.ts';
import { sandboxDenyText } from '../../application/tool-permission.ts';
import { ASK_USER_TOOL } from '../../constants.ts';
import { AskUserInterrupt } from '../../domain/errors.ts';
import type { ToolContext, ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';

export { ASK_USER_TOOL };

function formatResumeResult(
  resume: unknown,
  options?: Array<{
    id: string;
    label: string;
  }>,
): string {
  const payload = resume as
    | {
        text?: string;
        optionIds?: string[];
      }
    | undefined;
  if (!payload) {
    return 'answered';
  }
  const labels = (payload.optionIds ?? [])
    .map((id) => options?.find((o) => o.id === id)?.label ?? id)
    .filter(Boolean);
  const parts = [...labels];
  if (payload.text?.trim()) {
    parts.push(payload.text.trim());
  }
  return parts.join(' · ') || 'answered';
}
export function askUser(): ToolDefinition {
  return tool(ASK_USER_TOOL, {
    group: 'core',
    description:
      'Ask the human a question and wait for their reply. Use for clarifications, choices, or missing information before continuing.',
    input: {
      type: 'object',
      properties: {
        prompt: { type: 'string', minLength: 1 },
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', minLength: 1 },
              label: { type: 'string', minLength: 1 },
            },
            required: ['id', 'label'],
          },
        },
        multi: { type: 'boolean' },
      },
      required: ['prompt'],
    },
    execute(input, ctx: ToolContext) {
      const parsed = input as {
        prompt: string;
        options?: Array<{
          id: string;
          label: string;
        }>;
        multi?: boolean;
      };
      if (ctx.resume !== undefined && ctx.resume !== null) {
        return formatResumeResult(ctx.resume, parsed.options);
      }
      if (ctx.sandbox) {
        return sandboxDenyText(ASK_USER_TOOL, 'user input');
      }
      throw new AskUserInterrupt({
        prompt: parsed.prompt,
        resumeSchema: askUserSchema({
          options: parsed.options,
          multi: parsed.multi,
          allowText: true,
        }),
      });
    },
  });
}
