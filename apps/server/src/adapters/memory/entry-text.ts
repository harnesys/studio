import type { SessionEvent } from 'harnesys';

/** Flatten a session event into indexable text for episodic chunks. */
export function eventIndexText(event: SessionEvent): string {
  if (event.type === 'text-delta') {
    return event.text?.trim() ?? '';
  }
  if (event.type === 'tool') {
    const parts: string[] = [];
    if (event.name) {
      parts.push(event.name);
    }
    if (event.input) {
      parts.push(JSON.stringify(event.input));
    }
    if (event.output) {
      parts.push(JSON.stringify(event.output));
    }
    return parts.join(': ');
  }
  if (event.type === 'ask') {
    return event.prompt?.trim() ?? '';
  }
  if (event.type === 'done') {
    return event.text?.trim() ?? '';
  }
  return '';
}
