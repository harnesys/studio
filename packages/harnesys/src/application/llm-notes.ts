export type BudgetLeft = {
  stepsLeft?: number;
  stepsTotal?: number;
  tokensLeft?: number;
  tokensTotal?: number;
  msLeft?: number;
};

export type LlmNote = { tag: string; text: string };

export type LlmNoteContext = {
  agentId: string;
  runId: string;
  sessionId: string;
  nodeId: string;
  steps: number;
  state: Readonly<Record<string, unknown>>;
};

export type LlmNoteProvider = (ctx: LlmNoteContext) => LlmNote[] | Promise<LlmNote[]>;

export function assembleNotes(notes: LlmNote[]): string {
  if (notes.length === 0) {
    return '';
  }
  const blocks = notes.map((n) => `<${n.tag}>\n${n.text}\n</${n.tag}>`).join('\n');
  return `Runtime notes (refreshed before this step):\n${blocks}`;
}

export function budgetNote(left: BudgetLeft, closing = false): LlmNote {
  const parts: string[] = [];
  if (left.stepsLeft !== undefined) {
    parts.push(
      `steps remaining: ${left.stepsLeft}${left.stepsTotal !== undefined ? `/${left.stepsTotal}` : ''}`,
    );
  }
  if (left.tokensLeft !== undefined) {
    parts.push(`tokens remaining: ~${left.tokensLeft}`);
  }
  if (left.msLeft !== undefined) {
    parts.push(`time remaining: ~${Math.max(1, Math.ceil(left.msLeft / 60_000))} min`);
  }
  if (closing) {
    const counter = parts.length > 0 ? `${parts.join(' · ')}. ` : '';
    return {
      tag: 'budget',
      text:
        `${counter}This is your last step and no tools are available. ` +
        'Do not attempt tool calls. Write your final report now: what you did, ' +
        'what you found, and what is left unfinished.',
    };
  }
  return {
    tag: 'budget',
    text: `${parts.join(' · ')} (per run; resets on new user message). Wrap up the task within the remaining budget.`,
  };
}
