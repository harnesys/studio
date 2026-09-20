import { useIsFetching } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { ensureHostCredential } from '@/shared/api/host-credential';

const SPLASH_MIN_MS = 1000;
const SPLASH_IDLE_MS = 500;
const SPLASH_FADE_MS = 400;
const splashShownAt = performance.now();

export function HostAuthBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetching = useIsFetching();
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
    if (!error && fetching > 0) {
      return;
    }
    const minLeft = SPLASH_MIN_MS - (performance.now() - splashShownAt);
    const delay = Math.max(minLeft, SPLASH_IDLE_MS);
    const timer = window.setTimeout(() => {
      splash.classList.add('is-done');
      window.setTimeout(() => splash.remove(), SPLASH_FADE_MS);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [ready, error, fetching]);
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
