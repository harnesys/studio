import {
  isAgentEntry,
  isBuiltinStep,
  isHumanEntry,
  isSystemEntry,
  type JournalEntry,
} from 'harnesys';
import { visibleScheduledText } from '../../../shared/schedule-prompt.ts';

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

export function compactScheduleRun(entries: JournalEntry[]): SchedulePeekFire {
  const fire: SchedulePeekFire = {
    human: '',
    status: '',
    texts: [],
    tools: [],
    errors: [],
  };
  for (const entry of entries) {
    if (isHumanEntry(entry)) {
      fire.human = visibleScheduledText(entry.text ?? '');
      continue;
    }
    if (isSystemEntry(entry)) {
      fire.errors.push(entry.payload.message);
      continue;
    }
    if (!isAgentEntry(entry)) {
      continue;
    }
    fire.status = entry.status;
    if (entry.error) {
      fire.errors.push(entry.error.message);
    }
    let lastToolName = 'tool';
    for (const step of entry.steps) {
      if (!isBuiltinStep(step)) {
        continue;
      }
      if (step.type === 'text' && step.payload.text.trim()) {
        fire.texts.push(clip(step.payload.text));
      }
      if (step.type === 'tool_call') {
        lastToolName = step.payload.name;
      }
      if (step.type === 'tool_result') {
        fire.tools.push({
          name: step.payload.name ?? lastToolName,
          output: clip(step.payload.output),
        });
      }
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
