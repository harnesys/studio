import type {
  MemoryScopeId,
  SemanticMemoryPort,
  SemanticScope,
  SemanticSessionTtl,
} from '../../ports/memory.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';

export type CreateSemanticToolsParams = {
  port: SemanticMemoryPort;
  resolveScope: () => MemoryScopeId;
  sessionTtl?: SemanticSessionTtl | (() => SemanticSessionTtl | undefined);
};

type MemoryWriteInput = {
  scope: SemanticScope;
  text: string;
  key?: string;
};

type MemoryListInput = {
  scope?: SemanticScope;
  limit?: number;
};

type MemoryDeleteInput = {
  id: string;
};

export function createSemanticTools(params: CreateSemanticToolsParams): ToolDefinition[] {
  const { port, resolveScope } = params;
  const configuredTtl = params.sessionTtl;
  let ttlOf: (() => SemanticSessionTtl | undefined) | undefined;
  if (typeof configuredTtl === 'function') {
    ttlOf = configuredTtl;
  } else if (configuredTtl !== undefined) {
    ttlOf = () => configuredTtl;
  }
  return [
    tool('memory_write', {
      group: 'memory',
      description: 'Write a curated semantic memory fact (session or long)',
      input: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            enum: ['session', 'long'],
            description: 'session = thread-bound; long = durable',
          },
          text: { type: 'string', description: 'Fact text' },
          key: { type: 'string', description: 'Optional upsert key within scope' },
        },
        required: ['scope', 'text'],
        additionalProperties: false,
      },
      sideEffect: 'write',
      async execute(input) {
        const parsed = input as MemoryWriteInput;
        const scopeId = resolveScope();
        const sessionTtl = ttlOf?.();
        return await port.upsert(scopeId, {
          scope: parsed.scope,
          text: parsed.text,
          key: parsed.key,
          threadId: scopeId.threadId,
          source: 'agent',
          ...(sessionTtl ? { sessionTtl } : {}),
        });
      },
    }),
    tool('memory_list', {
      group: 'memory',
      description: 'List curated semantic memory facts',
      input: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['session', 'long'], description: 'Filter by scope' },
          limit: { type: 'integer', minimum: 1, description: 'Max rows' },
        },
        additionalProperties: false,
      },
      sideEffect: 'read',
      async execute(input) {
        const parsed = input as MemoryListInput;
        const sessionTtl = ttlOf?.();
        return await port.list(resolveScope(), {
          scope: parsed.scope,
          limit: parsed.limit,
          ...(sessionTtl ? { sessionTtl } : {}),
        });
      },
    }),
    tool('memory_delete', {
      group: 'memory',
      description: 'Delete a semantic memory fact by id',
      input: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Memory record id' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      sideEffect: 'write',
      async execute(input) {
        const parsed = input as MemoryDeleteInput;
        await port.remove(resolveScope(), parsed.id);
        return { ok: true, id: parsed.id };
      },
    }),
  ];
}
