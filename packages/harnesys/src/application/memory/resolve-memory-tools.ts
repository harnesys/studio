import type { AgentDefinition, PortRef } from '../../domain/agent-definition.ts';
import type {
  EpisodicPort,
  KnowledgePort,
  MemoryScopeId,
  PinPort,
  SemanticMemoryPort,
  SemanticSessionTtl,
} from '../../ports/memory.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { createEpisodicTools } from '../../packs/memory/create-episodic-tools.ts';
import { createKnowledgeTools } from '../../packs/memory/create-knowledge-tools.ts';
import { createPinTools } from '../../packs/memory/create-pin-tools.ts';
import { createSemanticTools } from '../../packs/memory/create-semantic-tools.ts';

export type ResolveMemoryScope = () => MemoryScopeId;

export type MemoryToolPorts = {
  pin?: PinPort;
  semantic?: SemanticMemoryPort;
  episodic?: EpisodicPort;
  knowledge?: KnowledgePort;
};

export type ResolveMemoryToolsInput = {
  definition: AgentDefinition;
  ports: MemoryToolPorts;
  resolveScope: ResolveMemoryScope;
};

export function resolveMemoryTools(input: ResolveMemoryToolsInput): ToolDefinition[] {
  const { definition, ports, resolveScope } = input;
  const memory = definition.memory;
  const out: ToolDefinition[] = [];
  if (memory?.pin && ports.pin) {
    out.push(...createPinTools({ port: ports.pin, resolveScope }));
  }
  if (memory?.semantic && ports.semantic) {
    out.push(
      ...createSemanticTools({
        port: ports.semantic,
        resolveScope,
        sessionTtl: sessionTtlFromRef(memory.semantic),
      }),
    );
  }
  if (memory?.episodic && ports.episodic) {
    out.push(...createEpisodicTools({ port: ports.episodic, resolveScope }));
  }
  if (memory?.knowledge && ports.knowledge) {
    out.push(
      ...createKnowledgeTools({
        port: ports.knowledge,
        resolveScope,
        topK: topKFromRef(memory.knowledge),
      }),
    );
  }
  return out;
}

export function memoryScopeResolver(
  workspaceId: string,
  agentName: string,
  threadId?: string,
): ResolveMemoryScope {
  return () => ({ workspaceId, agentName, ...(threadId ? { threadId } : {}) });
}

function sessionTtlFromRef(ref: PortRef): SemanticSessionTtl | undefined {
  const value = ref?.spec?.sessionTtl;
  return value === 'thread' || value === '24h' ? value : undefined;
}

function topKFromRef(ref: PortRef): number | undefined {
  const value = ref?.spec?.topK;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}
