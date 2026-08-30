import {
  type AgentEntry,
  type AgentStep,
  type CompactionEntry,
  type HumanEntry,
  isAgentEntry,
  isBuiltinStep,
  isCompactionEntry,
  isHumanEntry,
  isSystemEntry,
  type Journal,
  type SystemEntry,
} from 'harnesys';

export type TranscriptActivity =
  | { type: 'reasoning'; step: AgentStep }
  | { type: 'tool'; call: AgentStep; result?: AgentStep }
  | { type: 'ask'; step: AgentStep };

export type TranscriptEntry =
  | { type: 'reasoning'; step: AgentStep }
  | { type: 'tool'; call: AgentStep; result?: AgentStep }
  | { type: 'text'; step: AgentStep }
  | { type: 'ask'; step: AgentStep };

export type TranscriptFailure = {
  id: string;
  text: string;
};

export type TranscriptItem =
  | { type: 'user'; entry: HumanEntry }
  | { type: 'system'; entry: SystemEntry }
  | { type: 'compaction'; entry: CompactionEntry }
  | { type: 'assistant'; entry: AgentEntry; entries: TranscriptEntry[] }
  | { type: 'activity'; items: TranscriptActivity[] }
  | { type: 'failed'; id: string; text: string };

export function stepText(step: AgentStep): string {
  if (!isBuiltinStep(step)) {
    return '';
  }
  if (step.type === 'text' || step.type === 'reasoning') {
    return step.payload.text;
  }
  if (step.type === 'tool_result') {
    return step.payload.output;
  }
  if (step.type === 'ask') {
    return step.payload.answer?.text ?? step.payload.prompt;
  }
  return '';
}

export function stepInputText(step: AgentStep): string {
  if (!isBuiltinStep(step) || step.type !== 'tool_call') {
    return '';
  }
  const input = step.payload.input;
  if (input == null) {
    return '';
  }
  return typeof input === 'string' ? input : JSON.stringify(input);
}

export function isLiveActivity(items: TranscriptActivity[]): boolean {
  return items.some((item) => {
    if (item.type === 'reasoning' || item.type === 'ask') {
      return isLiveStatus(item.step.status) || !stepText(item.step);
    }
    return (
      isLiveStatus(item.call.status) || (item.result ? isLiveStatus(item.result.status) : true)
    );
  });
}

export function toTranscript(
  journal: Journal,
  options: { streaming?: boolean; failures?: TranscriptFailure[] } = {},
): TranscriptItem[] {
  const out: TranscriptItem[] = [];

  for (const entry of journal.entries) {
    if (isHumanEntry(entry)) {
      out.push({ type: 'user', entry });
      continue;
    }
    if (isSystemEntry(entry)) {
      out.push({ type: 'system', entry });
      continue;
    }
    if (isCompactionEntry(entry)) {
      out.push({ type: 'compaction', entry });
      continue;
    }
    if (isAgentEntry(entry)) {
      out.push({
        type: 'assistant',
        entry,
        entries: entriesFromSteps(entry.steps),
      });
    }
  }

  for (const failure of options.failures ?? []) {
    out.push({ type: 'failed', id: failure.id, text: failure.text });
  }

  if (options.streaming && (out.length === 0 || out.at(-1)?.type === 'user')) {
    out.push({ type: 'activity', items: [] });
  }

  return out;
}

function entriesFromSteps(steps: AgentStep[]): TranscriptEntry[] {
  const ordered = [...steps].sort((a, b) => a.seq - b.seq);
  const results = new Map<string, AgentStep>();
  for (const step of ordered) {
    if (!isBuiltinStep(step) || step.type !== 'tool_result') {
      continue;
    }
    results.set(step.payload.toolCallId, step);
  }

  const out: TranscriptEntry[] = [];
  for (const step of ordered) {
    if (!isBuiltinStep(step)) {
      continue;
    }
    if (step.type === 'reasoning') {
      out.push({ type: 'reasoning', step });
      continue;
    }
    if (step.type === 'text') {
      out.push({ type: 'text', step });
      continue;
    }
    if (step.type === 'ask') {
      out.push({ type: 'ask', step });
      continue;
    }
    if (step.type === 'tool_call') {
      // ask_user is shown as the ask step / HitlPrompt, not a tool card
      if (step.payload.name === 'ask_user') {
        continue;
      }
      out.push({
        type: 'tool',
        call: step,
        result: results.get(step.id),
      });
    }
  }
  return out;
}

function isLiveStatus(status: string): boolean {
  return (
    status === 'pending' ||
    status === 'streaming' ||
    status === 'awaiting_confirm' ||
    status === 'awaiting_input'
  );
}
