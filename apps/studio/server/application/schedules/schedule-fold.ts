import { isAgentEntry, isHumanEntry, type Journal, type JournalEntry } from 'harnesys';
import {
  isScheduledHumanText,
  SCHEDULE_HUMAN_ORIGIN,
  type ScheduleHistory,
} from '../../../shared/types.ts';

export function scheduleFoldHistory(
  journal: Journal,
  history: ScheduleHistory,
  historyLast: number,
  untilHumanId?: string,
): JournalEntry[] {
  const runs = collectScheduleRuns(journal, untilHumanId);
  if (history === 'none') {
    return [];
  }
  const picked = history === 'all' ? runs : runs.slice(-Math.max(1, historyLast));
  return picked.flat();
}

export function lastScheduleRuns(
  journal: Journal,
  last: number,
  untilHumanId?: string,
): JournalEntry[][] {
  const runs = collectScheduleRuns(journal, untilHumanId);
  return runs.slice(-Math.max(1, last));
}

function collectScheduleRuns(journal: Journal, untilHumanId?: string): JournalEntry[][] {
  const runs: JournalEntry[][] = [];
  let current: JournalEntry[] | undefined;
  for (const entry of journal.entries) {
    if (untilHumanId && entry.id === untilHumanId) {
      break;
    }
    if (isHumanEntry(entry)) {
      if (current) {
        runs.push(current);
      }
      current = isScheduleHuman(entry) ? [entry] : undefined;
      continue;
    }
    if (current && (isAgentEntry(entry) || entry.role === 'system')) {
      current.push(entry);
    }
  }
  if (current) {
    runs.push(current);
  }
  return runs;
}

export function isScheduleHuman(entry: JournalEntry): boolean {
  if (!isHumanEntry(entry)) {
    return false;
  }
  return entry.origin === SCHEDULE_HUMAN_ORIGIN || isScheduledHumanText(entry.text);
}
