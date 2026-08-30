import {
  type AgentEntryError,
  type AgentEntryMeta,
  type AgentRunStatus,
  type AgentStep,
  type CompactionPayload,
  isAgentEntry,
  isCompactionEntry,
  isHumanEntry,
  isSystemEntry,
  type JournalAttachment,
  type JournalEntry,
  type RunConfigSnapshot,
  type SystemEntryPayload,
} from 'harnesys';
import type { JournalEntryRow } from '../schema/journal-entries.ts';
import type { JournalStepRow } from '../schema/journal-steps.ts';

export type EntryBody = {
  agentName?: string;
  status?: AgentRunStatus;
  lastStepSeq?: number;
  config?: RunConfigSnapshot;
  error?: AgentEntryError;
  meta?: AgentEntryMeta;
  completedAt?: string;
  text?: string;
  attachments?: JournalAttachment[];
  origin?: string;
  payload?: SystemEntryPayload | CompactionPayload | unknown;
};

type AgentStepMeta = {
  model?: string;
  generationId?: string;
  usage?: unknown;
  providerCursor?: unknown;
};

export function entryBodyJson(entry: JournalEntry): string {
  if (isAgentEntry(entry)) {
    return JSON.stringify({
      agentName: entry.agentName,
      status: entry.status,
      lastStepSeq: entry.lastStepSeq,
      config: entry.config,
      error: entry.error,
      meta: entry.meta,
      completedAt: entry.completedAt,
    } satisfies EntryBody);
  }
  if (isHumanEntry(entry)) {
    return JSON.stringify({
      text: entry.text,
      attachments: entry.attachments,
      origin: entry.origin,
    });
  }
  if (isSystemEntry(entry) || isCompactionEntry(entry)) {
    return JSON.stringify({ payload: entry.payload });
  }
  return JSON.stringify({ payload: entry.payload });
}

export function stepBodyJson(step: AgentStep): string {
  return JSON.stringify({
    payload: step.payload,
    meta: step.meta,
    error: step.error,
  });
}

export function rowToEntry(row: JournalEntryRow, steps: AgentStep[]): JournalEntry {
  const body = parseJsonObject(row.body) as EntryBody;
  if (row.role === 'agent') {
    let max = 0;
    for (const s of steps) {
      if (s.seq > max) {
        max = s.seq;
      }
    }
    const lastStepSeq = Math.max(body.lastStepSeq ?? 0, max);
    return {
      id: row.id,
      seq: row.seq,
      createdAt: row.createdAt,
      role: 'agent',
      agentName: body.agentName,
      status: body.status ?? 'completed',
      steps,
      lastStepSeq,
      config: body.config,
      error: body.error,
      meta: body.meta,
      completedAt: body.completedAt,
    };
  }
  if (row.role === 'human') {
    return {
      id: row.id,
      seq: row.seq,
      createdAt: row.createdAt,
      role: 'human',
      text: typeof body.text === 'string' ? body.text : undefined,
      attachments: body.attachments,
      origin: typeof body.origin === 'string' ? body.origin : undefined,
    };
  }
  if (row.role === 'system') {
    return {
      id: row.id,
      seq: row.seq,
      createdAt: row.createdAt,
      role: 'system',
      payload: body.payload as SystemEntryPayload,
    };
  }
  if (row.role === 'compaction') {
    return {
      id: row.id,
      seq: row.seq,
      createdAt: row.createdAt,
      role: 'compaction',
      payload: (body.payload ?? body) as CompactionPayload,
    };
  }
  return {
    id: row.id,
    seq: row.seq,
    createdAt: row.createdAt,
    role: row.role,
    payload: body.payload ?? body,
  };
}

export function rowToStep(row: JournalStepRow): AgentStep {
  const body = parseJsonObject(row.body);
  return {
    id: row.id,
    seq: row.seq,
    createdAt: row.createdAt,
    type: row.type,
    status: row.status,
    startedAt: row.startedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    payload: body.payload ?? {},
    meta: body.meta as AgentStepMeta | undefined,
    error: body.error as AgentEntryError | undefined,
  } as AgentStep;
}

export function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
