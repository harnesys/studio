import type { DeskEvent } from '@studio/shared';

export function watchDesk(workspaceId: string, onEvent: (event: DeskEvent) => void): () => void {
  const source = new EventSource(`/api/workspaces/${workspaceId}/desk/watch`);
  source.addEventListener('desk', (message: MessageEvent<string>) => {
    try {
      onEvent(JSON.parse(message.data) as DeskEvent);
    } catch {
      // ignore malformed frames
    }
  });
  return () => {
    source.close();
  };
}
