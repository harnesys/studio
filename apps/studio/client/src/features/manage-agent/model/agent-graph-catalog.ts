import type { InterruptReason, Node } from 'harnesys';

export type GraphNodeGroup = 'core' | 'llm' | 'tool' | 'control';

export type GraphNodePorts = { in: boolean; out: boolean };

export type GraphNodeSpec = {
  type: string;
  group: GraphNodeGroup;
  label: string;
  inPalette: boolean;
  ports: GraphNodePorts;
  defaults: () => Node;
};

const DEFAULT_INTERRUPT_REASON: InterruptReason = 'human_review';

export const GRAPH_NODE_SPECS: GraphNodeSpec[] = [
  {
    type: 'core:start',
    group: 'core',
    label: 'Start',
    inPalette: true,
    ports: { in: false, out: true },
    defaults: () => ({ type: 'core:start' }),
  },
  {
    type: 'core:end',
    group: 'core',
    label: 'End',
    inPalette: true,
    ports: { in: true, out: false },
    defaults: () => ({ type: 'core:end' }),
  },
  {
    type: 'llm:generate',
    group: 'llm',
    label: 'Generate',
    inPalette: true,
    ports: { in: true, out: true },
    defaults: () => ({
      type: 'llm:generate',
      prompt: 'main',
      messages: '$state.messages',
    }),
  },
  {
    type: 'tool:call',
    group: 'tool',
    label: 'Tool call',
    inPalette: true,
    ports: { in: true, out: true },
    defaults: () => ({
      type: 'tool:call',
      calls: '$output.toolCalls',
      concurrency: 'parallel',
    }),
  },
  {
    type: 'control:assign',
    group: 'control',
    label: 'Assign',
    inPalette: true,
    ports: { in: true, out: true },
    defaults: () => ({ type: 'control:assign', patch: {} }),
  },
  {
    type: 'control:spawn',
    group: 'control',
    label: 'Spawn',
    inPalette: true,
    ports: { in: true, out: true },
    defaults: () => ({
      type: 'control:spawn',
      calls: '$output.spawns',
      concurrency: 'parallel',
    }),
  },
  {
    type: 'control:handoff',
    group: 'control',
    label: 'Handoff',
    inPalette: true,
    ports: { in: true, out: true },
    defaults: () => ({
      type: 'control:handoff',
      agentId: '',
      input: {},
    }),
  },
  {
    type: 'control:goto',
    group: 'control',
    label: 'Goto',
    inPalette: true,
    ports: { in: true, out: true },
    defaults: () => ({ type: 'control:goto', target: '' }),
  },
  {
    type: 'control:interrupt',
    group: 'control',
    label: 'Interrupt',
    inPalette: true,
    ports: { in: true, out: true },
    defaults: () => ({
      type: 'control:interrupt',
      reason: DEFAULT_INTERRUPT_REASON,
      resumeSchema: { type: 'object' },
    }),
  },
];

const SPECS_BY_TYPE = new Map(GRAPH_NODE_SPECS.map((spec) => [spec.type, spec]));

export function specByType(type: string): GraphNodeSpec | undefined {
  return SPECS_BY_TYPE.get(type);
}

export function paletteSpecs(): GraphNodeSpec[] {
  return GRAPH_NODE_SPECS.filter((spec) => spec.inPalette);
}

/** Id from type suffix (`control:handoff` → `handoff`, then `handoff-2`). */
export function nextNodeId(type: string, existingIds: Iterable<string>): string {
  const colon = type.lastIndexOf(':');
  const base = colon >= 0 ? type.slice(colon + 1) : type;
  const used = new Set(existingIds);
  if (!used.has(base)) {
    return base;
  }
  let n = 2;
  while (used.has(`${base}-${n}`)) {
    n += 1;
  }
  return `${base}-${n}`;
}

export const GRAPH_GROUP_LABELS: Record<GraphNodeGroup, string> = {
  core: 'Core',
  llm: 'LLM',
  tool: 'Tool',
  control: 'Control',
};

export const GRAPH_GROUP_ORDER: GraphNodeGroup[] = ['core', 'llm', 'tool', 'control'];
