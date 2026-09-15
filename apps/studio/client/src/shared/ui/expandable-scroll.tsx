import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';

import { cn } from '@/shared/lib/utils';

const PREVIEW = 'max-h-28';
const FULL = 'max-h-[min(70vh,28rem)]';

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
  /** Живой стрим: окно держит хвост, без More и без внутреннего скроллбара. */
  follow?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [canExpand, setCanExpand] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }

    // Watch the content node: the viewport has a fixed max-height, so
    // observing `el` alone never sees scrollHeight grow during a stream.
    const content = el.firstElementChild ?? el;

    if (follow) {
      const stick = () => {
        el.scrollTop = el.scrollHeight;
      };
      stick();
      const observer = new ResizeObserver(stick);
      observer.observe(content);
      return () => observer.disconnect();
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

  return (
    <div className={cn('relative', className)}>
      <div
        ref={ref}
        className={cn(
          'select-text overscroll-contain',
          follow ? 'overflow-hidden' : 'overflow-auto',
          expanded && !follow ? fullClassName : previewClassName,
        )}
      >
        {children}
      </div>
      {canExpand && !follow ? (
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
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Less' : 'More'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
