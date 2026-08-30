import type { DeskEvent } from '@studio/shared';
import { useJournalStore } from '@/entities/journal';
import { usePlanStore } from '@/entities/plan';
import { toClientSchedule, useScheduleStore } from '@/entities/schedule';
import { toClientThread, useThreadStore } from '@/entities/thread';

export function applyDeskEvent(event: DeskEvent): void {
  switch (event.type) {
    case 'thread': {
      useThreadStore.getState().upsert(toClientThread(event.thread));
      if (!useJournalStore.getState().activeRuns[event.thread.id]) {
        useJournalStore.getState().replaceJournal(event.thread.id, event.thread.journal);
      }
      return;
    }
    case 'plan': {
      usePlanStore.getState().upsert(event.plan);
      return;
    }
    case 'schedule-deleted': {
      dropSchedule(event.id);
      return;
    }
    case 'schedule': {
      const previous = useScheduleStore.getState().byId(event.schedule.id);
      if (previous && previous.threadId !== event.schedule.threadId) {
        dropOwnedThread(previous.threadId);
      }
      useScheduleStore.getState().upsert(toClientSchedule(event.schedule));
      return;
    }
    default: {
      const _exhaustive: never = event;
      void _exhaustive;
      return;
    }
  }
}

function dropSchedule(id: string): void {
  const current = useScheduleStore.getState().byId(id);
  useScheduleStore.getState().remove(id);
  if (current) {
    dropOwnedThread(current.threadId);
  }
}

function dropOwnedThread(threadId: string): void {
  const thread = useThreadStore.getState().byId(threadId);
  if (thread?.kind !== 'schedule') {
    return;
  }
  useJournalStore.getState().removeForThreads([threadId]);
  usePlanStore.getState().removeForThread(threadId);
  useThreadStore.getState().remove(threadId);
}
