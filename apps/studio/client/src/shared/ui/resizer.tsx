import type { MouseEvent as ReactMouseEvent } from 'react';
import { cn } from '@/shared/lib/utils';

type ResizerProps = {
  label: string;
  testId: string;
  dragging: boolean;
  onResizeStart: (event: ReactMouseEvent) => void;
};

export function Resizer({ label, testId, dragging, onResizeStart }: ResizerProps) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      onMouseDown={onResizeStart}
      className={cn(
        'group relative z-10 w-px shrink-0 cursor-col-resize border-0 bg-border/35 p-0 transition-colors',
        'before:absolute before:inset-y-0 before:-left-1.5 before:w-3 before:content-[""]',
        'hover:bg-border/70',
        dragging && 'bg-border',
      )}
    >
      <span className="sr-only">Resize</span>
    </button>
  );
}
