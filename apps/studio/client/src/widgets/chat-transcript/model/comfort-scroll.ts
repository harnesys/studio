import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

export type ComfortScrollOptions = {
  enabled: boolean;
  /** Якорь: где паркуется живой край после отката, % от верха вьюпорта. */
  anchorPercent: number;
  /** Откат, когда живой край подходит к низу ближе этого, px. */
  thresholdPx: number;
  /** Длительность плавного отката, мс. 0 — мгновенно. */
  durationMs: number;
};

const PIN_SLACK_PX = 64;
const AT_BOTTOM_PX = 24;
const MIN_FILL_PX = 24;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function distanceToBottom(viewport: HTMLDivElement): number {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
}

/**
 * Comfort-follow: держит запас под живым краем и доливает одним прыжком.
 * Контент получает нижний отступ (резерв), поэтому обычный scrollToEnd ставит
 * живой край на якорную линию. Хук доливает до конца только когда край
 * подходит к низу ближе thresholdPx; ручной скролл вверх отцепляет следование.
 */
export function useComfortFollow(
  viewportRef: RefObject<HTMLDivElement | null>,
  options: ComfortScrollOptions,
): boolean {
  const { enabled } = options;
  const [pinned, setPinned] = useState(true);
  const pinnedRef = useRef(true);
  const animationRef = useRef<number | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const setPinnedBoth = useCallback((next: boolean) => {
    if (pinnedRef.current !== next) {
      pinnedRef.current = next;
      setPinned(next);
    }
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !enabled) {
      return;
    }

    const cancelAnimation = () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };

    const scrollToEnd = (instant = false) => {
      const target = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      if (Math.abs(target - viewport.scrollTop) < 1) {
        return;
      }
      cancelAnimation();
      const duration = instant ? 0 : optionsRef.current.durationMs;
      if (duration <= 0 || prefersReducedMotion()) {
        viewport.scrollTop = target;
        return;
      }
      const from = viewport.scrollTop;
      const startedAt = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / Math.max(1, duration));
        viewport.scrollTop = from + (target - from) * easeOutCubic(progress);
        if (progress < 1) {
          animationRef.current = requestAnimationFrame(step);
        } else {
          animationRef.current = null;
        }
      };
      animationRef.current = requestAnimationFrame(step);
    };

    const reserveFor = (height: number): number =>
      Math.max(0, height * (1 - optionsRef.current.anchorPercent / 100));

    const onScroll = () => {
      const dist = distanceToBottom(viewport);
      if (dist <= AT_BOTTOM_PX) {
        setPinnedBoth(true);
        return;
      }
      const opts = optionsRef.current;
      const reserve = reserveFor(viewport.clientHeight);
      if (dist > reserve + opts.thresholdPx + PIN_SLACK_PX) {
        setPinnedBoth(false);
      }
    };

    const onContentGrew = () => {
      if (!pinnedRef.current) {
        return;
      }
      const opts = optionsRef.current;
      const reserve = reserveFor(viewport.clientHeight);
      const triggerAt = Math.max(MIN_FILL_PX, reserve - opts.thresholdPx);
      if (distanceToBottom(viewport) >= triggerAt) {
        scrollToEnd();
      }
    };

    // Пользовательский жест прерывает анимацию; программный скролл — нет.
    const onUserGesture = () => cancelAnimation();

    // Монтирование: сначала паркуемся на живой край, только потом слушаем скролл.
    // Обратный порядок даёт ложный unpin на setup — «не у нижнего края» ещё не
    // значит « пользователь ушёл вверх».
    const content = viewport.firstElementChild ?? viewport;
    const observer = new ResizeObserver(onContentGrew);
    observer.observe(content);
    const parkRaf = requestAnimationFrame(() => {
      scrollToEnd(true);
      viewport.addEventListener('scroll', onScroll, { passive: true });
      viewport.addEventListener('wheel', onUserGesture, { passive: true });
      viewport.addEventListener('touchmove', onUserGesture, { passive: true });
      onScroll();
    });

    return () => {
      cancelAnimation();
      cancelAnimationFrame(parkRaf);
      observer.disconnect();
      viewport.removeEventListener('scroll', onScroll);
      viewport.removeEventListener('wheel', onUserGesture);
      viewport.removeEventListener('touchmove', onUserGesture);
    };
  }, [enabled, viewportRef, setPinnedBoth]);

  useEffect(() => {
    if (!enabled) {
      setPinnedBoth(true);
    }
  }, [enabled, setPinnedBoth]);

  return pinned;
}
