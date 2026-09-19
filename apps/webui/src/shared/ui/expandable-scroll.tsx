import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';

import { prefersReducedMotion } from '@/shared/lib/motion';
import { useScrollAnchor } from '@/shared/lib/scroll-anchor';
import { cn } from '@/shared/lib/utils';

const PREVIEW = 'max-h-28';
const FULL = 'max-h-[min(70vh,28rem)]';
const PIN_THRESHOLD = 32;

export function ExpandableScroll({
  children,
  className,
  previewClassName = PREVIEW,
  fullClassName = FULL,
  fadeClassName = 'from-background',
  defaultExpanded = false,
  follow = false,
}: {
  children: ReactNode;
  className?: string;
  previewClassName?: string;
  fullClassName?: string;
  fadeClassName?: string | false;
  defaultExpanded?: boolean;
  /** Живой стрим: окно держит хвост плавным скроллом, More раскрывает выше. */
  follow?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const frameRef = useRef(0);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [canExpand, setCanExpand] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // More/Less держит верх бокса на месте, ленту к низу не прибивает.
  useScrollAnchor(boxRef, expanded);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }

    // Watch the content node: the viewport has a fixed max-height, so
    // observing `el` alone never sees scrollHeight grow during a stream.
    const content = el.firstElementChild ?? el;

    const stick = () => {
      frameRef.current = 0;
      if (!pinnedRef.current) {
        return;
      }
      const target = el.scrollHeight;
      if (prefersReducedMotion()) {
        el.scrollTop = target;
        return;
      }
      el.scrollTo({ top: target, behavior: 'smooth' });
    };
    const scheduleStick = () => {
      if (frameRef.current) {
        return;
      }
      frameRef.current = requestAnimationFrame(stick);
    };

    if (follow) {
      pinnedRef.current = true;
      scheduleStick();
      const observer = new ResizeObserver(() => {
        setCanExpand(el.scrollHeight > el.clientHeight + 1);
        scheduleStick();
      });
      observer.observe(content);
      observer.observe(el);
      return () => {
        observer.disconnect();
        if (frameRef.current) {
          cancelAnimationFrame(frameRef.current);
          frameRef.current = 0;
        }
      };
    }

    const measure = () => {
      if (expanded) {
        setCanExpand(true);
        return;
      }
      setCanExpand(el.scrollHeight > el.clientHeight + 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    if (content !== el) {
      observer.observe(el);
    }
    return () => observer.disconnect();
  }, [expanded, follow]);

  // Живой режим: ручной скролл вверх открепляет хвост, возврат вниз — цепляет обратно.
  const handleScroll = follow
    ? () => {
        const el = ref.current;
        if (!el) {
          return;
        }
        pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= PIN_THRESHOLD;
      }
    : undefined;

  // Раскрытие во время стрима сразу показывает свежий хвост.
  const toggle = () => {
    pinnedRef.current = true;
    setExpanded((value) => !value);
  };

  return (
    <div ref={boxRef} className={cn('relative', className)}>
      <div
        ref={ref}
        onScroll={handleScroll}
        className={cn(
          'select-text overflow-auto overscroll-contain scroll-smooth transition-[max-height] duration-300 ease-out motion-reduce:scroll-auto',
          expanded ? fullClassName : previewClassName,
        )}
      >
        {children}
      </div>
      {canExpand ? (
        <div className="relative">
          {!expanded && fadeClassName ? (
            <div
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-x-0 -top-7 h-7 bg-gradient-to-t to-transparent',
                fadeClassName,
              )}
            />
          ) : null}
          <button
            type="button"
            className="relative z-[1] flex w-full cursor-pointer items-center justify-center py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            onClick={toggle}
          >
            {expanded ? 'Less' : 'More'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
