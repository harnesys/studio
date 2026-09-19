import { type ReactNode, useEffect, useState } from 'react';

import { ensureHostCredential } from '@/shared/api/host-credential';

/** Load window.hosts[0].credential via loopback bootstrap before API calls. */
export function HostAuthBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void ensureHostCredential()
      .then(() => {
        if (!cancelled) {
          setReady(true);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'host bootstrap failed');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui' }}>
        Host auth bootstrap failed: {error}
      </div>
    );
  }
  if (!ready) {
    return null;
  }
  return children;
}
