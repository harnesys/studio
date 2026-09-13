import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
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
};

export function AccordionSection({
  id,
  icon,
  title,
  count,
  actions,
  size,
  children,
}: AccordionSectionProps) {
  const collapsed = useAccordionStore((state) => state.collapsed[id] ?? false);
  const toggle = useAccordionStore((state) => state.toggle);
  const { state, isMobile } = useSidebar();
  const iconMode = state === 'collapsed' && !isMobile;
  const shown = iconMode || !collapsed;

  return (
    <>
      <div
        className={cn(
          'group/head flex h-7 shrink-0 items-center gap-0.5 rounded-md px-1 transition-colors group-data-[collapsible=icon]:hidden',
          'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          'opacity-70 hover:opacity-100',
        )}
      >
        <button
          type="button"
          onClick={() => toggle(id)}
          aria-expanded={shown}
          className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 text-left font-semibold text-sm outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <span className="flex size-3.5 shrink-0 items-center justify-center">{icon}</span>
          <span className="truncate">{title}</span>

          {count !== undefined ? (
            <span className="shrink-0 font-normal text-muted-foreground/80 text-xs">{count}</span>
          ) : null}
        </button>
        {actions ? (
          <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/head:opacity-100 has-data-open:opacity-100">
            {actions}
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
