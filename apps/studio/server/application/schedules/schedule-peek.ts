import type { SessionEvent } from 'harnesys';
import { isScheduledHumanText } from '../../../shared/schedule-prompt.ts';

import { SCHEDULE_PEEK_OUTPUT_LIMIT } from '../../config/constants.ts';

export type SchedulePeekTool = {
  name: string;
  output: string;
};

export type SchedulePeekFire = {
  at: string;
  detail: string;
};

type CompactFire = {
  human: string;
  status: string;
  texts: string[];
  tools: SchedulePeekTool[];
  errors: string[];
};

export function peekScheduleFires(
  events: SessionEvent[],
  last: number,
  lastFiredAt: string | null,
): SchedulePeekFire[] {
  const limit = Math.min(99, Math.max(1, last));
  const fires = groupByRun(events).filter(isFireRun).slice(-limit);
  return fires.map((run, index) => {
    const compact = compactScheduleRun(run);
    const at = index === fires.length - 1 ? (lastFiredAt ?? '') : '';
    return { at, detail: formatPeekDetail(compact) };
  });
}

export function compactScheduleRun(events: SessionEvent[]): CompactFire {
  const fire: CompactFire = {
    human: '',
    status: '',
    texts: [],
    tools: [],
    errors: [],
  };
  const deltas: string[] = [];

  for (const event of events) {
    if (event.type === 'user') {
      if (!fire.human && isFireUser(event.origin, event.text)) {
        fire.human = clip(event.text);
      }
      continue;
    }
    if (event.type === 'run.started') {
      fire.status = 'running';
      continue;
    }
    if (event.type === 'run.completed') {
      fire.status = 'completed';
      if (event.text?.trim()) {
        fire.texts.push(clip(event.text));
      }
      continue;
    }
    if (event.type === 'done') {
      if (event.text?.trim()) {
        fire.texts.push(clip(event.text));
      }
      continue;
    }
    if (event.type === 'run.failed') {
      fire.status = 'failed';
      fire.errors.push(event.message);
      continue;
    }
    if (event.type === 'run.cancelled') {
      fire.status = 'cancelled';
      fire.errors.push(event.reason);
      continue;
    }
    if (event.type === 'error') {
      fire.errors.push(event.message);
      continue;
    }
    if (event.type === 'text-delta' && event.text) {
      deltas.push(event.text);
      continue;
    }
    if (event.type === 'tool' && (event.phase === 'completed' || event.phase === 'failed')) {
      const output = event.output !== undefined ? JSON.stringify(event.output) : '';
      fire.tools.push({ name: event.name, output: clip(output) });
      if (event.phase === 'failed') {
        fire.errors.push(`${event.name} failed`);
      }
    }
  }

  if (fire.texts.length === 0 && deltas.length > 0) {
    fire.texts.push(clip(deltas.join('')));
  }
  return fire;
}

function isFireRun(events: SessionEvent[]): boolean {
  return events.some((event) => event.type === 'user' && isFireUser(event.origin, event.text));
}

function isFireUser(origin: string | undefined, text: string): boolean {
  return origin === 'schedule' || isScheduledHumanText(text);
}

function groupByRun(events: SessionEvent[]): SessionEvent[][] {
  const order: string[] = [];
  const byRun = new Map<string, SessionEvent[]>();
  for (const event of events) {
    const runId = event.runId;
    if (!runId) {
      continue;
    }
    let bucket = byRun.get(runId);
    if (!bucket) {
      bucket = [];
      byRun.set(runId, bucket);
      order.push(runId);
    }
    bucket.push(event);
  }
  return order.map((id) => byRun.get(id) ?? []);
}

function formatPeekDetail(fire: CompactFire): string {
  const lines: string[] = [];
  if (fire.status) {
    lines.push(`status: ${fire.status}`);
  }
  if (fire.human) {
    lines.push(`human: ${fire.human}`);
  }
  for (const text of fire.texts) {
    lines.push(`text: ${text}`);
  }
  for (const tool of fire.tools) {
    lines.push(`tool ${tool.name}: ${tool.output}`);
  }
  for (const err of fire.errors) {
    lines.push(`error: ${err}`);
  }
  return lines.join('\n');
}

function clip(text: string): string {
  if (text.length <= SCHEDULE_PEEK_OUTPUT_LIMIT) {
    return text;
  }
  return `${text.slice(0, SCHEDULE_PEEK_OUTPUT_LIMIT)}…`;
}
