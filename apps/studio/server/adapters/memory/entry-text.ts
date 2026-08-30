import {
  type AgentStep,
  isAgentEntry,
  isCompactionEntry,
  isHumanEntry,
  type JournalEntry,
} from 'harnesys';

/** Flatten a journal entry into indexable text for episodic chunks. */
export function entryIndexText(entry: JournalEntry): string {
  if (isHumanEntry(entry)) {
    return entry.text?.trim() ?? '';
  }
  if (isCompactionEntry(entry)) {
    return entry.payload.summary?.trim() ?? '';
  }
  if (isAgentEntry(entry)) {
    return entry.steps.map(stepIndexText).filter(Boolean).join('\n');
  }
  return '';
}

function stepIndexText(step: AgentStep): string {
  const payload = step.payload as Record<string, unknown> | undefined;
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  if (step.type === 'text' || step.type === 'reasoning') {
    return typeof payload.text === 'string' ? payload.text : '';
  }
  if (step.type === 'tool_result') {
    return typeof payload.output === 'string' ? payload.output : '';
  }
  if (step.type === 'ask') {
    const prompt = typeof payload.prompt === 'string' ? payload.prompt : '';
    const answer = payload.answer;
    if (answer && typeof answer === 'object') {
      return `${prompt}\n${JSON.stringify(answer)}`;
    }
    return prompt;
  }
  if (step.type === 'tool_call') {
    const name = typeof payload.name === 'string' ? payload.name : 'tool';
    return `${name}: ${JSON.stringify(payload.input ?? {})}`;
  }
  return '';
}
