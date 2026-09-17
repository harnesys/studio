import type { DeskEvent } from '@harnesys/studio-shared';

import { watchEventSource } from './sse';

/** One host-global watch is fine in Phase 1 (single process). Fan-out per host: Phase 6. */
export function watchDesk(onEvent: (event: DeskEvent) => void): () => void {
  return watchEventSource('/api/desk/watch', 'desk', (data) => {
    try {
      onEvent(JSON.parse(data) as DeskEvent);
    } catch {
      // ignore malformed frames
    }
  });
}
