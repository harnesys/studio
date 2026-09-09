import { defineCapability } from '../../domain/pack.ts';
import { createKnowledgeTools } from './create-knowledge-tools.ts';
import type { KnowledgePort } from '../../ports/memory.ts';
import { memoryScopeOf } from './memory-scope.ts';

export type KnowledgeMemoryPorts = { knowledge: KnowledgePort };

function topKOf(spec: Record<string, unknown> | undefined): number | undefined {
  const value = spec?.topK;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

export const knowledgeMemoryCapability = defineCapability<KnowledgeMemoryPorts>({
  name: 'knowledge-memory',
  version: '1.0.0',
  description: 'Indexed corpus: knowledge_search / knowledge_read',
  requires: ['knowledge'],
  configFrom: (def) => def.memory?.knowledge,
  tools: (ctx) =>
    createKnowledgeTools({
      port: ctx.ports.knowledge,
      resolveScope: memoryScopeOf(ctx.resolveScope),
      topK: topKOf(ctx.config.spec),
    }),
  prompt: () => `## Knowledge
- Indexed corpus: knowledge_search, then knowledge_read by hit id.`,
});
