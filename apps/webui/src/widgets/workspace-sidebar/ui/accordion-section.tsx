import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { useSidebar } from '@/shared/ui/sidebar';
import { useAccordionStore } from '../model/accordion.store';

type AccordionSectionProps = {
  id: string;
  icon: ReactNode;
  title: ReactNode;
  count?: number;
  actions?: ReactNode;
  size: number;
  children: ReactNode;
  headerDragProps?: HTMLAttributes<HTMLButtonElement>;
  dragging?: boolean;
  dropHint?: 'before' | 'after' | null;
};
export function AccordionSection({
  id,
  icon,
  title,
  count,
  actions,
  size,
  children,
  headerDragProps,
  dragging = false,
  dropHint = null,
}: AccordionSectionProps) {
  const collapsed = useAccordionStore((state) => state.collapsed[id] ?? false);
  const toggle = useAccordionStore((state) => state.toggle);
  const { state, isMobile } = useSidebar();
  const iconMode = state === 'collapsed' && !isMobile;
  const shown = iconMode || !collapsed;
  const hasTrailing = count !== undefined || Boolean(actions);
  return (
    <>
      <div
        className={cn(
          'group/head flex h-7 shrink-0 items-center gap-0.5 rounded-md px-1 transition-colors group-data-[collapsible=icon]:hidden',
          'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          'opacity-70 hover:opacity-100',
          dragging && 'cursor-grabbing opacity-50!',
          dropHint === 'before' && 'shadow-[inset_0_2px_0_0_var(--color-live)]',
          dropHint === 'after' && 'shadow-[inset_0_-2px_0_0_var(--color-live)]',
        )}
      >
        <button
          type="button"
          {...headerDragProps}
          onClick={() => toggle(id)}
          aria-expanded={shown}
          className={cn(
            'flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 text-left font-semibold text-sm outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
            headerDragProps && 'cursor-grab select-none',
          )}
        >
          <span className="flex size-3.5 shrink-0 items-center justify-center">{icon}</span>
          <span className="truncate">{title}</span>
        </button>
        {hasTrailing ? (
          <span
            className={cn(
              'relative ml-auto flex h-7 shrink-0 items-center justify-end',
              actions &&
                'group-hover/head:[&_[data-section-count]]:opacity-0 has-data-open:[&_[data-section-count]]:opacity-0',
            )}
          >
            {count !== undefined ? (
              <Badge
                data-section-count=""
                variant="secondary"
                className="h-4 px-1.5 font-normal text-[10px] tabular-nums leading-none transition-opacity"
              >
                {count}
              </Badge>
            ) : null}
            {actions ? (
              <span
                className={cn(
                  'pointer-events-none flex items-center opacity-0 transition-opacity',
                  'group-hover/head:pointer-events-auto group-hover/head:opacity-100',
                  'has-data-open:pointer-events-auto has-data-open:opacity-100',
                  count !== undefined && 'absolute inset-y-0 right-0',
                )}
              >
                {actions}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
      {shown ? (
        <ScrollArea
          data-accordion-content={id}
          style={iconMode ? { flexGrow: 0, flexBasis: 'auto' } : { flexGrow: size, flexBasis: 0 }}
          className="min-h-0"
        >
          {children}
        </ScrollArea>
      ) : null}
    </>
  );
}
