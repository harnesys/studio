import type { AgentMemoryConfig } from '../../domain/agent-definition.ts';

const PIN_TOOLS = ['pin_set', 'pin_list', 'pin_remove'];
const SEMANTIC_TOOLS = ['memory_write', 'memory_list', 'memory_delete'];
const EPISODIC_TOOLS = ['recall_search'];
const KNOWLEDGE_TOOLS = ['knowledge_search', 'knowledge_read'];

export const ALL_MEMORY_TOOL_NAMES: string[] = [
  ...PIN_TOOLS,
  ...SEMANTIC_TOOLS,
  ...EPISODIC_TOOLS,
  ...KNOWLEDGE_TOOLS,
];

export function memoryToolNames(memory: AgentMemoryConfig | null | undefined): string[] {
  if (!memory) {
    return [];
  }
  const out: string[] = [];
  if (memory.pin != null) {
    out.push(...PIN_TOOLS);
  }
  if (memory.semantic != null) {
    out.push(...SEMANTIC_TOOLS);
  }
  if (memory.episodic != null) {
    out.push(...EPISODIC_TOOLS);
  }
  if (memory.knowledge != null) {
    out.push(...KNOWLEDGE_TOOLS);
  }
  return out;
}
