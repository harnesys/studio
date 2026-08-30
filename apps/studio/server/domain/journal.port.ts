import type { AgentStep, Journal, JournalEntry, StreamEvent } from 'harnesys';

export type JournalRepository = {
  load(threadId: string): Journal;
  upsertEntry(threadId: string, entry: JournalEntry): void;
  upsertStep(entryId: string, step: AgentStep): void;
  applyCheckpoint(entryId: string, stepId: string, text: string): void;
  /** Persist from a live stream event (entry/step/delta+checkpoint). */
  applyEvent(threadId: string, event: StreamEvent): void;
  /** Replace full journal snapshot for a thread (cold checkpoint). */
  saveSnapshot(threadId: string, journal: Journal): void;
};
