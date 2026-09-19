import {
  DEFAULT_SEMANTIC_AUTO_PROJECT_LONG,
  DEFAULT_SEMANTIC_AUTO_PROJECT_SESSION,
  DEFAULT_SEMANTIC_PROJECT_BUDGET_TOKENS,
  DEFAULT_SEMANTIC_PROJECT_LIMIT,
} from '../../constants.ts';
import { definePack } from '../../domain/pack.ts';
import type { SemanticMemoryPort } from '../../ports/memory.ts';
import { createSemanticTools } from './create-semantic-tools.ts';
import { memoryScopeOf } from './memory-scope.ts';
export type SemanticMemoryPorts = {
  semantic: SemanticMemoryPort;
};
export const semanticMemoryCapability = definePack<SemanticMemoryPorts, Record<string, unknown>>({
  name: 'semantic-memory',
  version: '1.0.0',
  description:
    'Curated semantic memory: memory_write / memory_list / memory_update / memory_delete',
  icon: 'memory-semantic',
  specSchema: {
    type: 'object',
    properties: {
      store: { type: 'string', enum: ['record-store'], default: 'record-store' },
      autoProjectSession: { type: 'boolean', default: DEFAULT_SEMANTIC_AUTO_PROJECT_SESSION },
      autoProjectLong: { type: 'boolean', default: DEFAULT_SEMANTIC_AUTO_PROJECT_LONG },
      projectLimit: { type: 'number', default: DEFAULT_SEMANTIC_PROJECT_LIMIT },
      projectBudgetTokens: { type: 'number', default: DEFAULT_SEMANTIC_PROJECT_BUDGET_TOKENS },
    },
  },
  meta: {
    tools: [
      {
        name: 'memory_write',
        description: 'Write a curated semantic memory fact (session or long)',
      },
      { name: 'memory_list', description: 'List curated semantic memory facts' },
      { name: 'memory_update', description: 'Update a semantic memory fact text by id' },
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
