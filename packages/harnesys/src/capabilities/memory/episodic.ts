import { createEpisodicTools } from '../../application/memory/create-episodic-tools.ts';
import { defineCapability } from '../../domain/capability.ts';
import type { EpisodicPort } from '../../ports/memory.ts';
import { memoryScopeOf } from './memory-scope.ts';

export type EpisodicMemoryPorts = { episodic: EpisodicPort };

export const episodicMemoryCapability = defineCapability<EpisodicMemoryPorts>({
  name: 'episodic-memory',
  version: '1.0.0',
  description: 'Past-thread recall: recall_search',
  requires: ['episodic'],
  configFrom: (def) => def.memory?.episodic,
  tools: (ctx) =>
    createEpisodicTools({
      port: ctx.ports.episodic,
      resolveScope: memoryScopeOf(ctx.resolveScope),
    }),
  prompt: () => `## Recall
- Past compacted threads: recall_search (query in words: a decision, a failure, a module name).`,
});
