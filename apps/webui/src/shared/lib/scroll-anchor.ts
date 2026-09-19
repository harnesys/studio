import { type RefObject, useLayoutEffect, useRef } from 'react';

const SETTLE_FRAMES = 2;
const STABLE_PX = 1;
const VIEWPORT_SELECTOR = '[data-slot="message-scroller-viewport"]';
export function useScrollAnchor(targetRef: RefObject<HTMLElement | null>, key: boolean): void {
  const prevKey = useRef(key);
  const anchor = useRef<number | null>(null);
  if (prevKey.current !== key) {
    prevKey.current = key;
    const target = targetRef.current;
    anchor.current = target ? target.getBoundingClientRect().top : null;
  }
  useLayoutEffect(() => {
    const saved = anchor.current;
    anchor.current = null;
    if (saved === null) {
      return;
    }
    const target = targetRef.current;
    const viewport = target?.closest(VIEWPORT_SELECTOR);
    if (!target || !(viewport instanceof HTMLElement)) {
      return;
    }
    let frame = 0;
    let raf = 0;
    const settle = () => {
      raf = 0;
      const delta = target.getBoundingClientRect().top - saved;
      if (Math.abs(delta) > STABLE_PX) {
        viewport.scrollTop += delta;
      }
      frame += 1;
      if (frame < SETTLE_FRAMES) {
        raf = requestAnimationFrame(settle);
      }
    };
    raf = requestAnimationFrame(settle);
    return () => {
      if (raf) {
        cancelAnimationFrame(raf);
      }
    };
  });
}
