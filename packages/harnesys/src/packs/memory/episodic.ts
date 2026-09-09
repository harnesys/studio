import { definePack } from '../../domain/pack.ts';
import type { EpisodicPort } from '../../ports/memory.ts';
import { createEpisodicTools } from './create-episodic-tools.ts';
import { memoryScopeOf } from './memory-scope.ts';

export type EpisodicMemoryPorts = { episodic: EpisodicPort };

function topKOf(spec: Record<string, unknown> | undefined): number | undefined {
  const value = spec?.topK;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

export const episodicMemoryCapability = definePack<EpisodicMemoryPorts, Record<string, unknown>>({
  name: 'episodic-memory',
  version: '1.0.0',
  description: 'Past-thread recall: recall_search',
  icon: 'memory-episodic',
  specSchema: {
    type: 'object',
    properties: {
      store: { type: 'string', enum: ['fts', 'vector'], default: 'fts' },
      topK: { type: 'number', default: 8 },
      indexOnCompact: { type: 'boolean', default: true },
    },
  },
  meta: {
    tools: [
      { name: 'recall_search', description: 'Search past thread experience (episodic recall)' },
    ],
    skills: [],
    hasSettings: true,
  },
  create: (ctx) => ({
    tools: createEpisodicTools({
      port: ctx.ports.episodic,
      resolveScope: memoryScopeOf(() => ctx.scope),
      topK: topKOf(ctx.spec),
    }),
  }),
});
