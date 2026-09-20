import { useEffect, useRef, useState } from 'react';

const VIEWED_PREFIX = 'harnesys.viewed.';

export function loadViewedCount(threadId: string): number | null {
  try {
    const raw = localStorage.getItem(VIEWED_PREFIX + threadId);
    if (raw === null) {
      return null;
    }
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

export function saveViewedCount(threadId: string, count: number): void {
  try {
    localStorage.setItem(VIEWED_PREFIX + threadId, String(count));
  } catch {}
}

export function useUnseenBoundary(
  threadId: string,
  active: boolean,
  unread: boolean,
  total: number,
): number | null {
  const [boundary, setBoundary] = useState<number | null>(null);
  const captured = useRef<string | null>(null);
  useEffect(() => {
    if (!active) {
      captured.current = null;
      setBoundary(null);
      return;
    }
    if (total === 0 || captured.current === threadId) {
      return;
    }
    captured.current = threadId;
    const stored = loadViewedCount(threadId);
    setBoundary(unread && stored !== null && stored < total ? stored : null);
  }, [active, threadId, unread, total]);
  return boundary;
}
