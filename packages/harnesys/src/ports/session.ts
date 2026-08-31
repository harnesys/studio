import type { Attachment } from '../domain/attachment.ts';
import type { JsonSchema } from '../domain/json-schema.ts';
import type { SendFile } from './artifacts.ts';
import type { PathsConfig } from './paths.ts';
import type { PermissionMap } from './permissions.ts';

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
  | { type: 'user'; text: string; attachments?: Attachment[]; origin?: string; id?: string }
  | { type: 'text-delta'; text: string; id?: string }
  | { type: 'reasoning-delta'; text: string; id?: string }
  | { type: 'reasoning-start'; id: string }
  | { type: 'reasoning-end'; id: string }
  | {
      type: 'tool';
      phase: 'streaming' | 'requested' | 'completed' | 'failed' | 'skipped';
      toolCallId: string;
      name: string;
      input?: unknown;
      output?: unknown;
      delta?: string;
    }
  | { type: 'source'; source: unknown }
  | { type: 'file'; file: unknown }
  | {
      type: 'ask';
      askId: string;
      schema: JsonSchema;
      source: 'permission' | 'approve' | 'middleware' | 'interrupt' | 'ask_user';
      prompt?: string;
      tool?: { name: string; input: unknown; toolCallId: string };
    }
  | { type: 'done'; text?: string }
  | { type: 'error'; code: string; message: string };

export type AgentRunStatus = 'running' | 'needs_input' | 'completed' | 'failed' | 'cancelled';

export type AgentRun = {
  id: string;
  status: AgentRunStatus;
  stream(): AsyncIterable<SessionEvent>;
  output: Promise<{ text: string }>;
  respond(askId: string, payload: unknown): Promise<void>;
  reject(askId: string, opts?: { note?: string }): Promise<void>;
  cancel(): void;
};

export type SessionHandle = {
  send(
    input: SendInput,
    opts?: { signal?: AbortSignal; permissions?: PermissionMap; paths?: PathsConfig },
  ): AgentRun;
  resume(opts?: {
    signal?: AbortSignal;
    permissions?: PermissionMap;
    paths?: PathsConfig;
  }): AgentRun;
};
