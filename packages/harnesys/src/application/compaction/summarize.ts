import { callModel, type StreamChunk } from '../../adapters/ai-llm-adapter.ts';
import type { ModelBinding } from '../../ports/models.ts';

export const SUMMARY_SYSTEM_PROMPT = `Output exactly the Markdown structure shown inside <template> and keep the section order unchanged. Do not include the <template> tags in your response.
<template>
## Objective
- [one or two brief sentences describing what the user is trying to accomplish]

## Important Details
- [constraints/preferences, decisions and why, important facts/assumptions, exact context needed to continue, or "(none)"]

## Work State
### Completed
- [finished work, verified facts, or changes made; otherwise "(none)"]

### Active
- [current work, partial changes, or investigation state; otherwise "(none)"]

### Blocked
- [blockers, failing commands, or unknowns; otherwise "(none)"]

## Next Move
1. [immediate concrete action, or "(none)"]
2. [next action if known, or "(none)"]

## Relevant Files
- [file or directory path: why it matters, or "(none)"]
</template>

Rules:
- Tools are not available in this pass. Respond with the summary text only; never call tools.
- Keep every section, even when empty.
- Use terse bullets, not prose paragraphs.
- Preserve exact file paths, symbols, commands, error strings, URLs, and identifiers when known.
- Do not mention the summary process or that context was compacted.
- Use only facts from the source.`;

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
  const stream = callModel(opts.binding, opts.system, opts.head, [], new Map(), opts.signal);
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
