import type { MemoryScopeId, PinPort } from '../../ports/memory.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';

export type CreatePinToolsParams = {
  port: PinPort;
  resolveScope: () => MemoryScopeId;
};

type PinSetInput = {
  key: string;
  text: string;
};

type PinRemoveInput = {
  key: string;
};

export function createPinTools(params: CreatePinToolsParams): ToolDefinition[] {
  const { port, resolveScope } = params;
  return [
    tool('pin_set', {
      group: 'memory',
      description: 'Upsert a pin that stays visible in the agent window',
      input: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Stable pin key' },
          text: { type: 'string', description: 'Pin body text' },
        },
        required: ['key', 'text'],
        additionalProperties: false,
      },
      sideEffect: 'write',
      async execute(input) {
        const parsed = input as PinSetInput;
        return await port.upsert(resolveScope(), {
          key: parsed.key,
          text: parsed.text,
          source: 'agent',
        });
      },
    }),
    tool('pin_remove', {
      group: 'memory',
      description: 'Remove a pin by key',
      input: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Pin key to remove' },
        },
        required: ['key'],
        additionalProperties: false,
      },
      sideEffect: 'write',
      async execute(input) {
        const parsed = input as PinRemoveInput;
        await port.remove(resolveScope(), parsed.key);
        return { ok: true, key: parsed.key };
      },
    }),
    tool('pin_list', {
      group: 'memory',
      description: 'List all pins for this agent scope',
      input: { type: 'object', properties: {}, additionalProperties: false },
      sideEffect: 'read',
      async execute() {
        return await port.list(resolveScope());
      },
    }),
  ];
}
