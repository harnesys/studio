import { eq } from 'drizzle-orm';
import type { Event } from 'harnesys';
import { EVENT_TYPES } from 'harnesys';
import type { StudioDb } from '../../adapters/store/sqlite/connection.ts';
import { eventsTable } from '../../adapters/store/sqlite/schema/events.ts';
import type { ScheduleHistory } from '../../../shared/types.ts';

export function loadThreadEvents(db: StudioDb, threadId: string): Event[] {
  const rows = db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.threadId, threadId))
    .orderBy(eventsTable.sequence)
    .all();
  return rows.map((row) => ({
    eventId: row.eventId,
    type: row.type,
    timestamp: row.timestamp,
    sessionId: row.sessionId,
    runId: row.runId,
    agentId: '',
    sequence: row.sequence,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  })) as Event[];
}

export function groupEventsByRun(events: Event[]): Map<string, Event[]> {
  const groups = new Map<string, Event[]>();
  for (const event of events) {
    const runId = event.runId || 'unknown';
    let group = groups.get(runId);
    if (!group) {
      group = [];
      groups.set(runId, group);
    }
    group.push(event);
  }
  return groups;
}

export function scheduleFoldHistory(
  events: Event[],
  history: ScheduleHistory,
  historyLast: number,
): Event[][] {
  const groups = groupEventsByRun(events);
  const runs = Array.from(groups.values());
  if (history === 'none') {
    return [];
  }
  const picked = history === 'all' ? runs : runs.slice(-Math.max(1, historyLast));
  return picked;
}

export function lastScheduleRuns(events: Event[], last: number): Event[][] {
  const groups = groupEventsByRun(events);
  const runs = Array.from(groups.values());
  return runs.slice(-Math.max(1, last));
}
