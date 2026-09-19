import { type ReactNode, useEffect, useState } from 'react';
import { ensureHostCredential } from '@/shared/api/host-credential';
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
  useEffect(() => {
    if (!ready && !error) {
      return;
    }
    const splash = document.getElementById('app-splash');
    if (!splash) {
      return;
    }
    splash.classList.add('is-done');
    const timer = window.setTimeout(() => splash.remove(), 260);
    return () => window.clearTimeout(timer);
  }, [ready, error]);
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
