import { DEFAULT_PIN_BUDGET_TOKENS, DEFAULT_PIN_MAX_ITEMS } from '../../constants.ts';
import { definePack } from '../../domain/pack.ts';
import type { PinPort } from '../../ports/memory.ts';
import { createPinTools } from './create-pin-tools.ts';
import { memoryScopeOf } from './memory-scope.ts';

export type PinMemoryPorts = { pin: PinPort };

export const pinMemoryCapability = definePack<PinMemoryPorts, Record<string, unknown>>({
  name: 'pin-memory',
  version: '1.0.0',
  description: 'Pinned rules visible to the agent: pin_set / pin_list / pin_remove',
  icon: 'memory-pin',
  specSchema: {
    type: 'object',
    properties: {
      store: { type: 'string', enum: ['kv-pin'], default: 'kv-pin' },
      budgetTokens: { type: 'number', default: DEFAULT_PIN_BUDGET_TOKENS },
      maxItems: { type: 'number', default: DEFAULT_PIN_MAX_ITEMS },
    },
  },
  meta: {
    tools: [
      { name: 'pin_set', description: 'Upsert a pin that stays visible in the agent window' },
      { name: 'pin_remove', description: 'Remove a pin by key' },
      { name: 'pin_list', description: 'List all pins for this agent scope' },
    ],
    skills: [],
    hasSettings: true,
  },
  create: (ctx) => ({
    tools: createPinTools({ port: ctx.ports.pin, resolveScope: memoryScopeOf(() => ctx.scope) }),
  }),
});
