import type { Edge, Node } from 'harnesys';
import type { AgentGraph } from '../../domain/agent.port.ts';

const REACT_NODES: Record<string, Node> = {
  start: { type: 'core:start' },
  think: {
    type: 'llm:generate',
    prompt: 'main',
    messages: '$state.messages',
  },
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
    ...REACT_NODES.think,
    ...(tools.length > 0 ? { tools } : {}),
  };

  return {
    nodes: { ...REACT_NODES, think: thinkNode },
    edges: [...REACT_EDGES],
  };
}
