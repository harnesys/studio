import type { Attachment } from '../domain/attachment.ts';
import type { JsonSchema } from '../domain/json-schema.ts';
import type { SendFile } from './artifacts.ts';
import type { PathsConfig } from './paths.ts';
import type { PermissionMap } from './permissions.ts';
import type { RunRecord } from './run-lifecycle-store.ts';

export type SendInput =
  | string
  | {
      text?: string;
      /** Per-message reasoning effort; overrides `agent.model.effort` for this run. */
      effort?: string;
      images?: SendFile[];
      audio?: SendFile[];
      video?: SendFile[];
      files?: SendFile[];
      attachments?: Attachment[];
      origin?: string;
    };

export type ModelUsage = {
  model: string;
  promptTokens: number;
  generatedTokens: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  durationMs?: number;
};

export type SessionEventType =
  | 'user'
  | 'text-delta'
  | 'reasoning-delta'
  | 'reasoning-start'
  | 'reasoning-end'
  | 'tool'
  | 'source'
  | 'file'
  | 'ask'
  | 'hitl.answer'
  | 'run.started'
  | 'model.usage'
  | 'model.stats'
  | 'compaction'
  | 'run.completed'
  | 'run.cancelled'
  | 'run.failed'
  | 'done'
  | 'error'
  | 'agent.handoff'
  | 'agent.spawned'
  | 'agent.completed'
  | 'agent.failed';

export type SessionEvent =
  | {
      type: 'user';
      text: string;
      attachments?: Attachment[];
      origin?: string;
      effort?: string;
      clientEventId?: string;
      seq?: number;
      runId?: string;
    }
  | { type: 'text-delta'; text: string; id?: string; seq?: number; runId?: string }
  | { type: 'reasoning-delta'; text: string; id?: string; seq?: number; runId?: string }
  | { type: 'reasoning-start'; id: string; seq?: number; runId?: string }
  | { type: 'reasoning-end'; id: string; seq?: number; runId?: string }
  | {
      type: 'tool';
      phase: 'streaming' | 'requested' | 'completed' | 'failed' | 'skipped';
      toolCallId: string;
      name: string;
      input?: unknown;
      output?: unknown;
      delta?: string;
      seq?: number;
      runId?: string;
    }
  | { type: 'source'; source: unknown; seq?: number; runId?: string }
  | { type: 'file'; file: unknown; seq?: number; runId?: string }
  | {
      type: 'ask';
      askId: string;
      schema: JsonSchema;
      source:
        | 'permission'
        | 'approve'
        | 'middleware'
        | 'interrupt'
        | 'ask_user'
        | 'budget'
        | 'plan_proposal';
      prompt?: string;
      tool?: { name: string; input: unknown; toolCallId: string };
      seq?: number;
      runId?: string;
    }
  | {
      type: 'hitl.answer';
      interruptId: string;
      payload?: unknown;
      rejected?: boolean;
      note?: string;
      clientEventId?: string;
      seq?: number;
      runId?: string;
    }
  | { type: 'run.started'; attempt: number; seq?: number; runId?: string }
  | { type: 'model.usage'; usage: ModelUsage; seq?: number; runId?: string }
  | {
      type: 'model.stats';
      tools: number;
      deferredPending: number;
      systemChars: number;
      notesChars: number;
      notesErrors: string[];
      seq?: number;
      runId?: string;
    }
  | {
      type: 'compaction';
      id: string;
      reason: 'threshold' | 'manual';
      coveredFrom: number;
      coveredUntil: number;
      tokensBefore: number;
      tokensAfter: number;
      seq?: number;
      runId?: string;
      clientEventId?: string;
    }
  | { type: 'run.completed'; text?: string; seq?: number; runId?: string }
  | { type: 'run.cancelled'; reason: string; seq?: number; runId?: string }
  | { type: 'run.failed'; message: string; seq?: number; runId?: string }
  | { type: 'done'; text?: string; seq?: number; runId?: string }
  | { type: 'error'; code: string; message: string; seq?: number; runId?: string }
  | { type: 'agent.handoff'; agentId: string; seq?: number; runId?: string }
  | {
      type: 'agent.spawned';
      agentId: string;
      spawnId: string;
      taskInput?: unknown;
      seq?: number;
      runId?: string;
    }
  | { type: 'agent.completed'; agentId: string; spawnId: string; seq?: number; runId?: string }
  | {
      type: 'agent.failed';
      agentId: string;
      spawnId: string;
      code?: string;
      message?: string;
      seq?: number;
      runId?: string;
    };

export type SendOpts = {
  signal?: AbortSignal;
  permissions?: PermissionMap;
  paths?: PathsConfig;
};

export type SessionHandle = {
  /** Creates a queued run with the user event; idempotent by clientEventId.
   *  Coded: 'thread_busy' (active root run), 'pending_ask' (needs_input). */
  send(input: SendInput, opts?: SendOpts & { clientEventId?: string }): Promise<{ runId: string }>;
  /** Validates payload against cursor.interrupt.resumeSchema, appends hitl.answer,
   *  moves the run to queued, kicks the claimer.
   *  Coded: 'unknown_run' | 'unknown_interrupt' | 'already_resumed' | 'run_terminal' | 'resume_validation_failed'. */
  respond(
    runId: string,
    askId: string,
    payload: unknown,
    opts?: { clientEventId?: string },
  ): Promise<void>;
  reject(
    runId: string,
    askId: string,
    opts?: { note?: string; clientEventId?: string },
  ): Promise<void>;
  /** Moves the run to cancelled; a running owner fences on the next append/renew. */
  cancel(runId: string): Promise<void>;
  /** Live run events (feed.subscribe). */
  subscribe(runId: string, fromSeq?: number): AsyncIterable<SessionEvent>;
  /** Run snapshot from the store. */
  runOf(runId: string): Promise<RunRecord | null>;
  /** Active root run of the thread. */
  activeRun(threadId: string): Promise<RunRecord | null>;
};
