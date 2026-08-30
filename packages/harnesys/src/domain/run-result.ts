import type { JsonSchema } from './json-schema.ts';

export type Usage = { steps: number; tokens: number; cost?: number };

export type RunSuccess = {
  status: 'completed';
  runId: string;
  output: unknown;
  state: Record<string, unknown>;
  usage: Usage;
};

export type RunInterrupted = {
  status: 'needs_input';
  runId: string;
  interrupt: {
    interruptId: string;
    reason: string;
    resumeSchema: JsonSchema;
    nodeId: string;
  };
  usage: Usage;
};

export type RunFailed = {
  status: 'failed' | 'budget_exceeded' | 'timed_out' | 'dead_lettered';
  runId: string;
  error: {
    code: string;
    message: string;
    nodeId?: string;
    retryable?: boolean;
    cause?: { code: string; message: string; nodeId?: string };
  };
  state: Record<string, unknown>;
  usage: Usage;
};

export type RunCancelled = {
  status: 'cancelled';
  runId: string;
  state: Record<string, unknown>;
  usage: Usage;
};

export type RunResult = RunSuccess | RunInterrupted | RunFailed | RunCancelled;

export type Command =
  | { type: 'resume'; interruptId: string; payload: unknown }
  | { type: 'reject'; interruptId: string; note?: string }
  | { type: 'cancel'; mode: 'graceful' | 'hard'; spawnId?: string };
