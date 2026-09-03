import type { PendingSessionEvent } from './run-event-store.ts';

export type RunLifecycleStatus =
  | 'queued'
  | 'running'
  | 'needs_input'
  | 'completed'
  | 'failed'
  | 'cancelled';

export const RUN_NON_TERMINAL: RunLifecycleStatus[] = ['queued', 'running', 'needs_input'];

export type RunRecord = {
  runId: string;
  threadId: string;
  status: RunLifecycleStatus;
  interruptId?: string;
  parentRunId?: string;
  attempt: number;
  leaseInstanceId?: string;
  leaseExpiresAt?: number;
  leaseEpoch: number;
  lastSeq: number;
  createdAt: string;
  updatedAt: string;
};

export type RunCreateInput = {
  runId: string;
  threadId: string;
  parentRunId?: string;
};

export type RunTransitionPatch = {
  from: RunLifecycleStatus;
  to: RunLifecycleStatus;
  interruptId?: string | null;
  advanceAttempt?: boolean;
  events?: PendingSessionEvent[];
};

// biome-ignore lint/style/useConsistentTypeDefinitions: brief specifies interface for RunLifecycleStore
export interface RunLifecycleStore {
  /** Создает ран queued; initial-события (user) той же транзакцией.
   *  Повторный clientEventId в events возвращает существующий ран (идемпотентный send). */
  create(run: RunCreateInput, events?: PendingSessionEvent[]): Promise<RunRecord>;
  get(runId: string): Promise<RunRecord | null>;
  /** Не-терминальный корневой ран потока (parentRunId IS NULL). */
  activeByThread(threadId: string): Promise<RunRecord | null>;
  /** Саб-раны родителя (0.6.0, barrier). */
  childrenByParent(parentRunId: string): Promise<RunRecord[]>;
  /** CAS queued → running + lease + epoch+1. null = гонку проиграли. */
  claim(runId: string, instanceId: string, ttlMs: number): Promise<RunRecord | null>;
  /** Атомарный CAS from → to; epoch+1 на каждом успешном переходе; events той же транзакцией.
   *  Coded: 'run_terminal' | 'already_resumed' | 'unknown_interrupt' | 'lease_stale' | 'already_queued'.
   *  Порядок проверки: run_terminal, already_queued, lease_stale, from-mismatch, unknown_interrupt. */
  transition(runId: string, expectedEpoch: number, patch: RunTransitionPatch): Promise<RunRecord>;
  /** Продление: только владелец с текущим epoch; иначе false. */
  renewLease(runId: string, instanceId: string, ttlMs: number): Promise<boolean>;
  /** Клеймер: queued-раны, limit + курсор createdAt. */
  listClaimable(opts?: { limit?: number; before?: string }): Promise<RunRecord[]>;
  /** GC: needs_input старше TTL (сравнение делает стор). */
  listExpiredAsks(opts?: {
    limit?: number;
    before?: string;
    olderThanMs?: number;
  }): Promise<RunRecord[]>;
}
