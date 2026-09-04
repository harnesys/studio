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
      images?: SendFile[];
      audio?: SendFile[];
      video?: SendFile[];
      files?: SendFile[];
      attachments?: Attachment[];
      origin?: string;
    };

export type SessionEvent =
  | {
      type: 'user';
      text: string;
      attachments?: Attachment[];
      origin?: string;
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
      source: 'permission' | 'approve' | 'middleware' | 'interrupt' | 'ask_user';
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
  | { type: 'run.completed'; text?: string; seq?: number; runId?: string }
  | { type: 'run.cancelled'; reason: string; seq?: number; runId?: string }
  | { type: 'run.failed'; message: string; seq?: number; runId?: string }
  | { type: 'done'; text?: string; seq?: number; runId?: string }
  | { type: 'error'; code: string; message: string; seq?: number; runId?: string };

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
