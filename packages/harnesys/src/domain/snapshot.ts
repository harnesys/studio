import type { JsonSchema } from './json-schema.ts';

export type CommitKind = 'intent' | 'recorded';

export type CursorPhase = 'scheduled' | 'intent' | 'executing' | 'recorded' | 'unknown' | 'failed';

export type Cursor = {
  nodes: Record<string, { phase: CursorPhase; nodeExecutionId: string; attempt?: number }>;
  pending?: unknown;
  interrupt?: {
    interruptId: string;
    reason: string;
    resumeSchema: JsonSchema;
    nodeId: string;
    source?: string;
    output?: unknown;
    /** control:wait mode; used by timer ticker. */
    waitMode?: 'sleep' | 'gate';
    /** control:wait onTimeout; used by timer ticker for gate. */
    onTimeout?: 'fail' | 'continue' | 'interrupt';
  };
  cancellation?: unknown;
  budget?: { steps: number; tokens: number; startedAt: number };
  barriers?: Record<string, unknown>;
  timers?: { id: string; fireAt: number }[];
};

export type Snapshot = {
  sessionId: string;
  runId: string;
  definitionHash: string;
  planHash: string;
  sequence: number;
  status: string;
  runtimeVersion: string;
  initialInput: unknown;
  state: Record<string, unknown>;
  cursor: Cursor;
  artifacts: unknown;
};

export type Event = {
  eventId: string;
  type: string;
  timestamp: number;
  sessionId: string;
  runId: string;
  agentId: string;
  sequence: number;
  causationId?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
};
