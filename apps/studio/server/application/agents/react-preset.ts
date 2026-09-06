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
  end: { type: 'core:end' },
};

const REACT_EDGES: Edge[] = [
  { from: 'start', to: 'think' },
  { from: 'think', to: 'act', when: '$output.finishReason = "tool-calls"' },
  { from: 'think', to: 'end', when: '$output.finishReason = "stop"' },
  { from: 'think', to: 'end' },
  { from: 'act', to: 'think' },
];

export function buildReactGraph(tools: string[]): AgentGraph {
  const thinkNode: Node = {
    ...THINK_NODE,
    tools,
  };

  return {
    nodes: { ...REACT_NODES, think: thinkNode },
    edges: [...REACT_EDGES],
  };
}
