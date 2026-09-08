import { useEffect, useState } from 'react';

/**
 * Текущее время с тиком. Неположительный интервал — статичный `Date.now()`
 * без таймера, для завершённых карточек.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (intervalMs <= 0) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
