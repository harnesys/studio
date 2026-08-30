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
      origin?: string;
    };

export type SessionEvent =
  | { type: 'text-delta'; text: string }
  | {
      type: 'tool';
      phase: 'requested' | 'completed' | 'failed' | 'skipped';
      toolCallId: string;
      name: string;
      input?: unknown;
      output?: unknown;
    }
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

export type AgentRun = {
  id: string;
  status: 'running' | 'needs_input' | 'completed' | 'failed' | 'cancelled';
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
