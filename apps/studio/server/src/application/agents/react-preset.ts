import type { Edge, Node } from 'harnesys';
import type { AgentGraph } from '../../domain/agent.port.ts';

const THINK_NODE: Extract<Node, { type: 'llm:generate' }> = {
  type: 'llm:generate',
  prompt: 'main',
  messages: '$state.messages',
};

const REACT_NODES: Record<string, Node> = {
  start: { type: 'core:start' },
  think: THINK_NODE,
  act: {
    type: 'tool:call',
    calls: '$output.toolCalls',
    concurrency: 'parallel',
  },
  // Узлы управления по форме assistant.json: без них движок отклоняет
  // agents_spawn/agents_handoff («no control:* node»), и тред не отдаётся назад.
  spawn: {
    type: 'control:spawn',
    calls: '$state.spawns',
    concurrency: 'parallel',
    barrier: { policy: 'all' },
  },
  handoff: {
    type: 'control:handoff',
    agentId: '$state.handoffAgentId',
    input: '$input',
  },
  end: { type: 'core:end' },
};

const REACT_EDGES: Edge[] = [
  { from: 'start', to: 'think' },
  { from: 'think', to: 'act', when: '$output.finishReason = "tool-calls"' },
  { from: 'think', to: 'end', when: '$output.finishReason = "stop"' },
  { from: 'think', to: 'end' },
  { from: 'act', to: 'spawn', when: 'exists($state.spawns) && length($state.spawns) > 0' },
  { from: 'act', to: 'handoff', when: 'exists($state.handoffAgentId)' },
  { from: 'act', to: 'think' },
  { from: 'spawn', to: 'handoff', when: 'exists($state.handoffAgentId)' },
  { from: 'spawn', to: 'think' },
  { from: 'handoff', to: 'end' },
];

export function buildReactGraph(tools: string[]): AgentGraph {
  // Пустой список = «все тулы реестра» (llm.ts берёт registry при undefined);
  // tools: [] означало бы «явно никаких» и рвало вызов тулов.
  const thinkNode: Node = {
    ...THINK_NODE,
    ...(tools.length > 0 ? { tools } : {}),
  };

  return {
    nodes: { ...REACT_NODES, think: thinkNode },
    edges: [...REACT_EDGES],
  };
}
