import type { DeskEvent } from '@harnesys/studio-shared';
import { getWindowHosts } from './host-credential';
import { setHostOnlineStatus, urlForHost } from './host-router';
import { watchEventSource } from './sse';
export function watchDesk(onEvent: (event: DeskEvent) => void): () => void {
  const hosts = getWindowHosts();
  if (hosts.length === 0) {
    return watchEventSource('/api/desk/watch', 'desk', (data) => {
      try {
        onEvent(JSON.parse(data) as DeskEvent);
      } catch {}
    });
  }
  const unsubs = hosts.map((host) => {
    const url = urlForHost(host, '/api/desk/watch');
    return watchEventSource(
      url,
      'desk',
      (data) => {
        setHostOnlineStatus(host.id, 'online');
        try {
          onEvent(JSON.parse(data) as DeskEvent);
        } catch {}
      },
      {
        credential: host.credential,
        onError: () => setHostOnlineStatus(host.id, 'offline'),
      },
    );
  });
  return () => {
    for (const unsub of unsubs) {
      unsub();
    }
  };
}
