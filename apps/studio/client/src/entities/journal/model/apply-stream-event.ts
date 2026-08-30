import {
  type AgentEntry,
  type AgentStep,
  isAgentEntry,
  isBuiltinStep,
  type Journal,
  type JournalEntry,
  type StreamEvent,
} from '@studio/shared';

export function applyStreamEvent(journal: Journal, event: StreamEvent): Journal {
  if (event.type === 'entry') {
    return upsertEntry(journal, event.entry);
  }
  if (event.type === 'step') {
    return upsertStep(journal, event.entryId, event.step);
  }
  return applyDelta(journal, event);
}

function upsertEntry(journal: Journal, entry: JournalEntry): Journal {
  const index = journal.entries.findIndex((item: any) => item.id === entry.id);
  if (index < 0) {
    return { ...journal, entries: [...journal.entries, entry] };
  }
  const entries = journal.entries.slice();
  entries[index] = entry;
  return { ...journal, entries };
}

function upsertStep(journal: Journal, entryId: string, step: AgentStep): Journal {
  const index = journal.entries.findIndex((item: any) => item.id === entryId);
  if (index < 0) {
    return journal;
  }
  const entry = journal.entries[index];
  if (!entry || !isAgentEntry(entry)) {
    return journal;
  }

  const steps = entry.steps.slice();
  const stepIndex = steps.findIndex((item: any) => item.id === step.id);
  if (stepIndex < 0) {
    steps.push(step);
  } else {
    steps[stepIndex] = step;
  }

  const next: AgentEntry = {
    ...entry,
    steps,
    lastStepSeq: Math.max(entry.lastStepSeq, step.seq),
  };
  const entries = journal.entries.slice();
  entries[index] = next;
  return { ...journal, entries };
}

function applyDelta(journal: Journal, event: Extract<StreamEvent, { type: 'delta' }>): Journal {
  const index = journal.entries.findIndex((item: any) => item.id === event.entryId);
  if (index < 0) {
    return journal;
  }
  const entry = journal.entries[index];
  if (!entry || !isAgentEntry(entry)) {
    return journal;
  }

  const stepIndex = entry.steps.findIndex((item: any) => item.id === event.stepId);
  if (stepIndex < 0) {
    return journal;
  }
  const step = entry.steps[stepIndex];
  if (!step || !isBuiltinStep(step)) {
    return journal;
  }
  if (step.type === 'tool_call') {
    const raw = typeof step.payload.input === 'string' ? step.payload.input : '';
    const nextInput = raw + event.text;
    const nextStep: AgentStep = { ...step, payload: { ...step.payload, input: nextInput } };
    const steps = entry.steps.slice();
    steps[stepIndex] = nextStep;
    const entries = journal.entries.slice();
    entries[index] = { ...entry, steps };
    return { ...journal, entries };
  }
  if (step.type !== 'text' && step.type !== 'reasoning') {
    return journal;
  }
  const text = event.checkpoint ? event.checkpoint.text : `${step.payload.text}${event.text}`;
  const nextStep: AgentStep = {
    ...step,
    payload: { ...step.payload, text },
  };
  const steps = entry.steps.slice();
  steps[stepIndex] = nextStep;
  const entries = journal.entries.slice();
  entries[index] = { ...entry, steps };
  return { ...journal, entries };
}
