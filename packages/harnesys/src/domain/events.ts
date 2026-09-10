import { EVENT_TYPES } from '../constants.ts';
import type { Attachment } from './attachment.ts';

export { EVENT_TYPES };
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
  handoff?: boolean;
};
