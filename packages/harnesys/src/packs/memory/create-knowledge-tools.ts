import type { KnowledgePort, MemoryScopeId } from '../../ports/memory.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
export type CreateKnowledgeToolsParams = {
  port: KnowledgePort;
  resolveScope: () => MemoryScopeId;
  topK?: number | (() => number | undefined);
};
type KnowledgeSearchToolInput = {
  query: string;
  limit?: number;
};
type KnowledgeReadToolInput = {
  id: string;
};
export function createKnowledgeTools(params: CreateKnowledgeToolsParams): ToolDefinition[] {
  const { port, resolveScope } = params;
  const configuredTopK = params.topK;
  let topKOf: (() => number | undefined) | undefined;
  if (typeof configuredTopK === 'function') {
    topKOf = configuredTopK;
  } else if (configuredTopK !== undefined) {
    topKOf = () => configuredTopK;
  }
  return [
    tool('knowledge_search', {
      group: 'memory',
      description: 'Search the knowledge corpus (docs / wiki)',
      input: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'integer', minimum: 1, description: 'Max hits' },
        },
        required: ['query'],
        additionalProperties: false,
      },
      sideEffect: 'read',
      async execute(input) {
        const parsed = input as KnowledgeSearchToolInput;
        return await port.search({
          workspaceId: resolveScope().workspaceId,
          query: parsed.query,
          limit: parsed.limit ?? topKOf?.(),
        });
      },
    }),
    tool('knowledge_read', {
      group: 'memory',
      description: 'Read a knowledge document by id from search hits',
      input: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Knowledge chunk / document id' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      sideEffect: 'read',
      async execute(input) {
        const parsed = input as KnowledgeReadToolInput;
        if (!port.read) {
          return {
            error: true,
            code: 'KNOWLEDGE_READ_UNSUPPORTED',
            message: 'knowledge port has no read()',
          };
        }
        return await port.read({
          workspaceId: resolveScope().workspaceId,
          id: parsed.id,
        });
      },
    }),
  ];
}
