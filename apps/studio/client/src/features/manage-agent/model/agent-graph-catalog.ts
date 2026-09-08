import type { InterruptReason, Node } from 'harnesys';

export type GraphNodeGroup = 'core' | 'llm' | 'tool' | 'control';

export type GraphNodePorts = { in: boolean; out: boolean };

export type GraphNodeSpec = {
  type: string;
  group: GraphNodeGroup;
  label: string;
  /** One line under the palette card. */
  summary: string;
  /** Full copy in the palette info popover. */
  description: string;
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
    summary: 'Run enters here.',
    description:
      'Single entry of the graph. No incoming edges. The interpreter starts at this node on every run and after a handoff onto a new agent.',
    inPalette: true,
    ports: { in: false, out: true },
    defaults: () => ({ type: 'core:start' }),
  },
  {
    type: 'core:end',
    group: 'core',
    label: 'End',
    summary: 'Run stops here.',
    description:
      'Terminal node. Optional output expr is the run result. No outgoing edges. Use a default edge into End when no when-condition matched.',
    inPalette: true,
    ports: { in: true, out: false },
    defaults: () => ({ type: 'core:end' }),
  },
  {
    type: 'llm:generate',
    group: 'llm',
    label: 'Generate',
    summary: 'Model step.',
    description:
      'Calls the model with a prompt id and optional messages expr. finishReason "tool-calls" vs "stop" is what ReAct edges typically switch on. Optional tools allowlist on the node.',
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
    summary: 'Execute tools.',
    description:
      'Runs tool calls from an expr (usually $output.toolCalls) in parallel or sequential. After tools, edge back to Generate to close the ReAct loop.',
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
    summary: 'Patch state.',
    description:
      'Writes keys into run state via a patch map. Values may be exprs. Use after spawn or tools when the next node needs named slots.',
    inPalette: true,
    ports: { in: true, out: true },
    defaults: () => ({ type: 'control:assign', patch: {} }),
  },
  {
    type: 'control:spawn',
    group: 'control',
    label: 'Spawn',
    summary: 'Subcontract agents.',
    description:
      'Starts child runs. calls evals to [{ agentId, input }]. From Tool call after agents_spawn: exists($state.spawns) && length($state.spawns) > 0, calls $state.spawns. Parent waits (barrier all). Results land in $output and a Spawn results message.',
    inPalette: true,
    ports: { in: true, out: true },
    defaults: () => ({
      type: 'control:spawn',
      calls: '$state.spawns',
      concurrency: 'parallel',
    }),
  },
  {
    type: 'control:handoff',
    group: 'control',
    label: 'Handoff',
    summary: 'Switch current agent.',
    description:
      'Rebinds this thread to another agent. From Tool call after agents_handoff: exists($state.handoffAgentId) && $state.handoffAgentId, agentId $state.handoffAgentId. Emits agent.handoff. Origin stays. Interpreter continues on the target graph from its start.',
    inPalette: true,
    ports: { in: true, out: true },
    defaults: () => ({
      type: 'control:handoff',
      agentId: '$state.handoffAgentId',
      input: '$state.messages',
    }),
  },
  {
    type: 'control:goto',
    group: 'control',
    label: 'Goto',
    summary: 'Jump to a node.',
    description:
      'Jumps to target (node id or expr). No implicit outgoing needed beyond the jump. Use for loops that are not a ReAct act→think edge.',
    inPalette: true,
    ports: { in: true, out: true },
    defaults: () => ({ type: 'control:goto', target: '' }),
  },
  {
    type: 'control:interrupt',
    group: 'control',
    label: 'Interrupt',
    summary: 'Pause for a human.',
    description:
      'Stops the run for HITL. reason is a known interrupt code; resumeSchema is JSON Schema for the resume payload. Outgoing edges run after resume.',
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
