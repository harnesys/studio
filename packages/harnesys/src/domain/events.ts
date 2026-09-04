import type { Attachment } from './attachment.ts';

export const EVENT_TYPES = {
  RUN_STARTED: 'run.started',
  RUN_COMPLETED: 'run.completed',
  RUN_FAILED: 'run.failed',
  RUN_NEEDS_INPUT: 'run.needs_input',
  CANCELLED: 'run.cancelled',
  RUN_TIMED_OUT: 'run.timed_out',
  RUN_BUDGET_EXCEEDED: 'run.budget_exceeded',
  RUN_DEAD_LETTERED: 'run.dead_lettered',
  NODE_SCHEDULED: 'node.scheduled',
  NODE_STARTED: 'node.started',
  NODE_COMPLETED: 'node.completed',
  NODE_FAILED: 'node.failed',
  STATE_COMMITTED: 'state.committed',
  USER_MESSAGE: 'user.message',
  MODEL_REQUESTED: 'model.requested',
  MODEL_DELTA: 'model.delta',
  MODEL_REASONING: 'model.reasoning',
  MODEL_REASONING_START: 'model.reasoning-start',
  MODEL_REASONING_END: 'model.reasoning-end',
  MODEL_TOOL_INPUT_START: 'model.tool-input-start',
  MODEL_TOOL_INPUT_DELTA: 'model.tool-input-delta',
  MODEL_TOOL_INPUT_END: 'model.tool-input-end',
  MODEL_TOOL_CALL: 'model.tool-call',
  MODEL_SOURCE: 'model.source',
  MODEL_FILE: 'model.file',
  MODEL_CHUNK: 'model.chunk',
  MODEL_COMPLETED: 'model.completed',
  MODEL_FAILED: 'model.failed',
  TOOL_REQUESTED: 'tool.requested',
  TOOL_COMPLETED: 'tool.completed',
  TOOL_FAILED: 'tool.failed',
  CONTROL_INTERRUPT: 'control.interrupt',
  CONTROL_APPROVAL: 'control.approval',
  CONTROL_POLICY: 'control.policy',
  CONTROL_BUDGET: 'control.budget',
  CONTROL_CANCELLATION: 'control.cancellation',
  CONTROL_REPAIR: 'control.repair',
  AGENT_SPAWNED: 'agent.spawned',
  AGENT_COMPLETED: 'agent.completed',
  AGENT_FAILED: 'agent.failed',
  WORK_ISSUED: 'work.issued',
  WORK_COMPLETED: 'work.completed',
  WORK_FAILED: 'work.failed',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export type RunEventMeta = {
  status: string;
  usage?: { steps: number; tokens: number };
};

export type NodeEventMeta = {
  nodeId: string;
  phase: string;
  nodeExecutionId: string;
};

export type UserEventMeta = {
  text?: string;
  attachments?: Attachment[];
  origin?: string;
};

export type ModelEventMeta = {
  text?: string;
  reasoning?: string;
  finishReason?: string;
  usage?: unknown;
  toolCalls?: unknown[];
  sources?: unknown[];
  files?: unknown[];
  delta?: string;
  toolName?: string;
  id?: string;
  source?: unknown;
  file?: unknown;
};

export type ToolEventMeta = {
  toolCallId: string;
  name: string;
  input?: unknown;
  output?: unknown;
};

export type ControlEventMeta = {
  interruptId?: string;
  reason?: string;
  resumeSchema?: unknown;
};

export type AgentEventMeta = {
  agentId: string;
  spawnId?: string;
};
