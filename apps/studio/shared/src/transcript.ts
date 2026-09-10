import type { Attachment, SessionEvent } from 'harnesys';

export type TranscriptItem =
  | { type: 'user'; text: string; attachments?: Attachment[]; origin?: string }
  | { type: 'assistant'; text: string }
  | {
      type: 'tool';
      name: string;
      toolCallId: string;
      input?: unknown;
      output?: unknown;
      phase: string;
    }
  | { type: 'ask'; askId: string; source: string; prompt?: string }
  | { type: 'done'; text?: string }
  | { type: 'error'; code: string; message: string };

export function toTranscript(events: SessionEvent[]): TranscriptItem[] {
  const out: TranscriptItem[] = [];
  for (const ev of events) {
    if (ev.type === 'user') {
      out.push({ type: 'user', text: ev.text, attachments: ev.attachments, origin: ev.origin });
    } else if (ev.type === 'text-delta') {
      if (ev.text) {
        out.push({ type: 'assistant', text: ev.text });
      }
    } else if (ev.type === 'reasoning-delta') {
      if (ev.text) {
        out.push({ type: 'assistant', text: `[reasoning] ${ev.text}` });
      }
    } else if (ev.type === 'tool') {
      out.push({
        type: 'tool',
        name: ev.name,
        toolCallId: ev.toolCallId,
        input: ev.input,
        output: ev.output,
        phase: ev.phase,
      });
    } else if (ev.type === 'ask') {
      out.push({ type: 'ask', askId: ev.askId, source: ev.source, prompt: ev.prompt });
    } else if (ev.type === 'done') {
      out.push({ type: 'done', text: ev.text });
    } else if (ev.type === 'error') {
      out.push({ type: 'error', code: ev.code, message: ev.message });
    }
  }
  return out;
}
