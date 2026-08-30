import type { Event } from 'harnesys';
import { EVENT_TYPES } from 'harnesys';

const OUTPUT_LIMIT = 2000;

export type SchedulePeekTool = {
  name: string;
  output: string;
};

export type SchedulePeekFire = {
  human: string;
  status: string;
  texts: string[];
  tools: SchedulePeekTool[];
  errors: string[];
};

export function compactScheduleRun(events: Event[]): SchedulePeekFire {
  const fire: SchedulePeekFire = {
    human: '',
    status: '',
    texts: [],
    tools: [],
    errors: [],
  };

  for (const event of events) {
    const meta = event.metadata as Record<string, unknown> | undefined;

    if (event.type === EVENT_TYPES.RUN_STARTED) {
      fire.status = 'running';
      continue;
    }

    if (event.type === EVENT_TYPES.RUN_COMPLETED) {
      fire.status = 'completed';
      continue;
    }

    if (event.type === EVENT_TYPES.RUN_FAILED) {
      fire.status = 'failed';
      const message = (meta?.message as string) ?? 'Run failed';
      fire.errors.push(message);
      continue;
    }

    if (event.type === EVENT_TYPES.MODEL_COMPLETED) {
      const text = meta?.text as string | undefined;
      if (text?.trim()) {
        fire.texts.push(clip(text));
      }
      continue;
    }

    if (event.type === EVENT_TYPES.TOOL_COMPLETED) {
      const name = (meta?.name as string) ?? 'tool';
      const output = meta?.output ? JSON.stringify(meta.output) : '';
      fire.tools.push({ name, output: clip(output) });
      continue;
    }

    if (event.type === EVENT_TYPES.TOOL_REQUESTED) {
      continue;
    }

    if (event.type === EVENT_TYPES.CONTROL_INTERRUPT) {
      const reason = (meta?.reason as string) ?? 'interrupt';
      fire.texts.push(`[interrupt: ${reason}]`);
      continue;
    }
  }

  return fire;
}

function clip(text: string): string {
  if (text.length <= OUTPUT_LIMIT) {
    return text;
  }
  return `${text.slice(0, OUTPUT_LIMIT)}…`;
}
