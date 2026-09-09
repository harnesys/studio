import { definePack } from '../../domain/pack.ts';
import type { SemanticMemoryPort } from '../../ports/memory.ts';
import { createSemanticTools } from './create-semantic-tools.ts';
import { memoryScopeOf } from './memory-scope.ts';

export type SemanticMemoryPorts = { semantic: SemanticMemoryPort };

export const semanticMemoryCapability = definePack<SemanticMemoryPorts, Record<string, unknown>>({
  name: 'semantic-memory',
  version: '1.0.0',
  description: 'Curated semantic memory: memory_write / memory_list / memory_delete',
  icon: 'memory-semantic',
  specSchema: {
    type: 'object',
    properties: {
      store: { type: 'string', enum: ['record-store'], default: 'record-store' },
      autoProjectSession: { type: 'boolean', default: false },
      autoProjectLong: { type: 'boolean', default: true },
      projectLimit: { type: 'number', default: 20 },
      projectBudgetTokens: { type: 'number', default: 800 },
    },
  },
  meta: {
    tools: [
      {
        name: 'memory_write',
        description: 'Write a curated semantic memory fact (session or long)',
      },
      { name: 'memory_list', description: 'List curated semantic memory facts' },
      { name: 'memory_delete', description: 'Delete a semantic memory fact by id' },
    ],
    skills: [],
    hasSettings: true,
  },
  create: (ctx) => ({
    tools: createSemanticTools({
      port: ctx.ports.semantic,
      resolveScope: memoryScopeOf(() => ctx.scope),
    }),
  }),
});
