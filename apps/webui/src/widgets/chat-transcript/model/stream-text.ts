import { useEffect, useRef, useState } from 'react';

const STREAM_FRAME_MS = 100;

export function useStreamText(target: string, throttled: boolean): string {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const latestRef = useRef(target);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastFlushRef = useRef(0);
  useEffect(() => {
    latestRef.current = target;
    if (!throttled) {
      if (timer.current !== undefined) {
        clearTimeout(timer.current);
        timer.current = undefined;
      }
      if (shownRef.current !== target) {
        shownRef.current = target;
        setShown(target);
      }
      return;
    }
    if (shownRef.current === target) {
      return;
    }
    const elapsed = Date.now() - lastFlushRef.current;
    if (elapsed >= STREAM_FRAME_MS) {
      lastFlushRef.current = Date.now();
      shownRef.current = target;
      setShown(target);
      return;
    }
    if (timer.current === undefined) {
      timer.current = setTimeout(() => {
        timer.current = undefined;
        lastFlushRef.current = Date.now();
        const latest = latestRef.current;
        shownRef.current = latest;
        setShown(latest);
      }, STREAM_FRAME_MS - elapsed);
    }
  }, [target, throttled]);
  useEffect(
    () => () => {
      if (timer.current !== undefined) {
        clearTimeout(timer.current);
      }
    },
    [],
  );
  return throttled ? shown : target;
}
