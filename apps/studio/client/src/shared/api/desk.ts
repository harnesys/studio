import type { DeskEvent } from '@harnesys/studio-shared';

import { watchEventSource } from './sse';

export function watchDesk(onEvent: (event: DeskEvent) => void): () => void {
  return watchEventSource('/api/desk/watch', 'desk', (data) => {
    try {
      onEvent(JSON.parse(data) as DeskEvent);
    } catch {
      // ignore malformed frames
    }
  });
}
