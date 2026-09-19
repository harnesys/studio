import type { MouseEvent as ReactMouseEvent } from 'react';
import { cn } from '@/shared/lib/utils';

type ResizerProps = {
  label: string;
  testId: string;
  dragging: boolean;
  orientation?: 'horizontal' | 'vertical';
  onResizeStart: (event: ReactMouseEvent) => void;
};

export function Resizer({
  label,
  testId,
  dragging,
  orientation = 'horizontal',
  onResizeStart,
}: ResizerProps) {
  const vertical = orientation === 'vertical';
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      onMouseDown={onResizeStart}
      className={cn(
        'group relative z-10 shrink-0 border-0 p-0 transition-colors',
        vertical
          ? 'h-px w-full cursor-row-resize bg-border/35 before:absolute before:-top-1.5 before:right-0 before:left-0 before:h-3 before:content-[""]'
          : 'w-px cursor-col-resize bg-border/35 before:absolute before:inset-y-0 before:-left-1.5 before:w-3 before:content-[""]',
        'hover:bg-border/70',
        dragging && 'bg-border',
      )}
    >
      <span className="sr-only">Resize</span>
    </button>
  );
}
