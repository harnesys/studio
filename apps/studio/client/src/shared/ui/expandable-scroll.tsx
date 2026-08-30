import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';

import { cn } from '@/shared/lib/utils';

const PREVIEW = 'max-h-32';
const FULL = 'max-h-[min(70vh,28rem)]';

export function ExpandableScroll({
  children,
  className,
  previewClassName = PREVIEW,
  fullClassName = FULL,
  fadeClassName = 'from-background',
  defaultExpanded = false,
}: {
  children: ReactNode;
  className?: string;
  previewClassName?: string;
  fullClassName?: string;
  fadeClassName?: string | false;
  defaultExpanded?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [canExpand, setCanExpand] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
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
    observer.observe(el);
    return () => observer.disconnect();
  }, [children, expanded]);

  return (
    <div className={cn('relative', className)}>
      <div
        ref={ref}
        className={cn('select-text overflow-auto', expanded ? fullClassName : previewClassName)}
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
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Less' : 'More'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
