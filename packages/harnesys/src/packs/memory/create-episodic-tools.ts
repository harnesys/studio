import type { EpisodicPort, MemoryScopeId } from '../../ports/memory.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';

export type CreateEpisodicToolsParams = {
  port: EpisodicPort;
  resolveScope: () => MemoryScopeId;
};

type RecallSearchInput = {
  query: string;
  threadId?: string;
  limit?: number;
};

export function createEpisodicTools(params: CreateEpisodicToolsParams): ToolDefinition[] {
  const { port, resolveScope } = params;
  return [
    tool('recall_search', {
      group: 'memory',
      description: 'Search past thread experience (episodic recall)',
      input: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          threadId: { type: 'string', description: 'Limit search to one thread' },
          limit: { type: 'integer', minimum: 1, description: 'Max hits' },
        },
        required: ['query'],
        additionalProperties: false,
      },
      sideEffect: 'read',
      async execute(input) {
        const parsed = input as RecallSearchInput;
        const scope = resolveScope();
        return await port.search({
          workspaceId: scope.workspaceId,
          query: parsed.query,
          threadId: parsed.threadId,
          limit: parsed.limit,
        });
      },
    }),
  ];
}
