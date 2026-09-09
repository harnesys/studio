import { defineCapability } from '../../domain/pack.ts';
import { createPinTools } from './create-pin-tools.ts';
import type { PinPort } from '../../ports/memory.ts';
import { memoryScopeOf } from './memory-scope.ts';

export type PinMemoryPorts = { pin: PinPort };

export const pinMemoryCapability = defineCapability<PinMemoryPorts>({
  name: 'pin-memory',
  version: '1.0.0',
  description: 'Pinned rules visible to the agent: pin_set / pin_list / pin_remove',
  requires: ['pin'],
  configFrom: (def) => def.memory?.pin,
  tools: (ctx) =>
    createPinTools({ port: ctx.ports.pin, resolveScope: memoryScopeOf(ctx.resolveScope) }),
  prompt: () => `## Durable state
- pin_set: short rules that must stay in this agent's window. pin_list / pin_remove to maintain.`,
});
