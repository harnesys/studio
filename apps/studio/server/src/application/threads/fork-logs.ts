import type { SessionEvent } from 'harnesys';

export type SeedMessage = {
  role: 'user' | 'assistant';
  content: string;
  attachments?: unknown[];
  origin?: string;
};

function eventIdOf(event: SessionEvent): string | undefined {
  return 'id' in event ? event.id : undefined;
}

function clientEventIdOf(event: SessionEvent): string | undefined {
  return 'clientEventId' in event ? event.clientEventId : undefined;
}

/** События родителя до forkAt включительно. forkAt — id события, clientEventId или runId. */
export function cutParentEvents(events: SessionEvent[], forkAt: string): SessionEvent[] {
  let runEnd = -1;
  for (let i = 0; i < events.length; i += 1) {
    if (events[i].runId === forkAt) {
      runEnd = i;
    }
  }
  if (runEnd !== -1) {
    return events.slice(0, runEnd + 1);
  }
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (eventIdOf(event) === forkAt || clientEventIdOf(event) === forkAt) {
      return events.slice(0, i + 1);
    }
  }
  return [];
}

/** История до forkAt → messages для seed snapshot'а ветки. */
export function seedMessagesFromEvents(events: SessionEvent[]): SeedMessage[] {
  const messages: SeedMessage[] = [];
  let run: { runId: string; text: string } | null = null;

  const flushRun = () => {
    if (run && run.text.length > 0) {
      messages.push({ role: 'assistant', content: run.text });
    }
    run = null;
  };

  for (const event of events) {
    if (event.type === 'user') {
      flushRun();
      const message: SeedMessage = { role: 'user', content: event.text };
      if (event.attachments) {
        message.attachments = event.attachments;
      }
      if (event.origin) {
        message.origin = event.origin;
      }
      messages.push(message);
      continue;
    }
    if (event.type !== 'text-delta') {
      continue;
    }
    const runId = event.runId ?? '';
    if (!run || run.runId !== runId) {
      flushRun();
      run = { runId, text: event.text };
      continue;
    }
    run.text += event.text;
  }
  flushRun();
  return messages;
}
