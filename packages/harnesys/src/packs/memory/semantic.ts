import { defineCapability } from '../../domain/pack.ts';
import { createSemanticTools } from './create-semantic-tools.ts';
import type { SemanticMemoryPort, SemanticSessionTtl } from '../../ports/memory.ts';
import { memoryScopeOf } from './memory-scope.ts';

export type SemanticMemoryPorts = { semantic: SemanticMemoryPort };

function sessionTtlOf(spec: Record<string, unknown> | undefined): SemanticSessionTtl | undefined {
  const value = spec?.sessionTtl;
  return value === 'thread' || value === '24h' ? value : undefined;
}

export const semanticMemoryCapability = defineCapability<SemanticMemoryPorts>({
  name: 'semantic-memory',
  version: '1.0.0',
  description: 'Curated semantic memory: memory_write / memory_list / memory_delete',
  requires: ['semantic'],
  configFrom: (def) => def.memory?.semantic,
  tools: (ctx) =>
    createSemanticTools({
      port: ctx.ports.semantic,
      resolveScope: memoryScopeOf(ctx.resolveScope),
      sessionTtl: sessionTtlOf(ctx.config.spec),
    }),
  prompt: () => `## Memory
- memory_write scope=session: facts for this thread only.
- memory_write scope=long: facts that should survive across threads. Key them as project/module/topic so memory_list stays readable. memory_list is the aggregate view; memory_delete to prune.`,
});
