import { callModel, type StreamChunk } from '../../adapters/ai-llm-adapter.ts';
import { SUMMARY_SYSTEM_PROMPT, SUMMARY_USER_PROMPT } from '../../constants.ts';
import type { ModelBinding } from '../../ports/models.ts';

export { SUMMARY_SYSTEM_PROMPT, SUMMARY_USER_PROMPT };

export function priorSummaryBlock(text: string): string {
  return `

<prior-summary>
${text}
</prior-summary>

Merge rules: the conversation that follows is newer and wins conflicts; carry forward goals, constraints, and decisions; move finished work into Completed; anything not carried forward is lost.`;
}

export type SummaryStreamEvent = { type: string; data?: unknown; result?: StreamChunk };

/** Проход саммари: без инструментов, события стрима наружу, финал — summary.completed. */
export async function* streamSummary(opts: {
  binding: ModelBinding;
  system: string;
  head: unknown[];
  signal: AbortSignal;
}): AsyncGenerator<SummaryStreamEvent> {
  const messages = [...opts.head, { role: 'user', content: SUMMARY_USER_PROMPT }];
  const stream = callModel(opts.binding, opts.system, messages, [], new Map(), opts.signal);
  let completed: StreamChunk | undefined;
  for await (const chunk of stream) {
    if (chunk.type === 'completed') {
      completed = chunk;
      continue;
    }
    if (chunk.type === 'delta') {
      yield { type: 'model.delta', data: chunk };
    } else if (chunk.type === 'reasoning-delta') {
      yield { type: 'model.reasoning', data: chunk };
    } else if (chunk.type === 'reasoning-start') {
      yield { type: 'model.reasoning-start', data: chunk };
    } else if (chunk.type === 'reasoning-end') {
      yield { type: 'model.reasoning-end', data: chunk };
    }
  }
  if (completed) {
    yield { type: 'summary.completed', result: completed };
  }
}
