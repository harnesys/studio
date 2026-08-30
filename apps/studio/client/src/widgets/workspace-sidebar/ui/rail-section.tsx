import { ChevronDownIcon, PlusIcon } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { SIDEBAR_SECTION_STORAGE_PREFIX } from '@/shared/config/constants';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Collapsible, CollapsibleContent } from '@/shared/ui/collapsible';
import { SidebarGroup, useSidebar } from '@/shared/ui/sidebar';

function readSectionOpen(id: string): boolean {
  try {
    const raw = localStorage.getItem(`${SIDEBAR_SECTION_STORAGE_PREFIX}${id}`);
    if (raw === null) {
      return true;
    }
    return raw === '1';
  } catch {
    return true;
  }
}

function writeSectionOpen(id: string, open: boolean): void {
  try {
    localStorage.setItem(`${SIDEBAR_SECTION_STORAGE_PREFIX}${id}`, open ? '1' : '0');
  } catch {
    // Ignore storage errors (e.g. quota, private browsing)
  }
}

export function RailSection({
  id,
  icon,
  openIcon,
  title,
  addLabel,
  onAdd,
  actions,
  children,
  testId,
  selected = false,
  onHeaderClick,
}: {
  id: string;
  icon: ReactNode;
  openIcon?: ReactNode;
  title: ReactNode;
  addLabel?: string;
  onAdd?: () => void;
  actions?: ReactNode;
  children: ReactNode;
  testId?: string;
  selected?: boolean;
  onHeaderClick?: () => void;
}) {
  const { state, isMobile } = useSidebar();
  const iconMode = state === 'collapsed' && !isMobile;
  const [open, setOpen] = useState(() => readSectionOpen(id));
  const shown = iconMode || open;

  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggle = () => {
    if (iconMode) {
      return;
    }
    const next = !open;
    setOpen(next);
    writeSectionOpen(id, next);
  };

  const handleChevronClick = (event: MouseEvent) => {
    event.stopPropagation();
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    toggle();
  };

  const handleTitleClick = () => {
    if (!onHeaderClick) {
      return;
    }
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      onHeaderClick();
    }, 220);
  };

  const handleDoubleClick = (event: MouseEvent) => {
    event.preventDefault();
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    toggle();
  };

  const headerClickable = Boolean(onHeaderClick);

  return (
    <Collapsible
      open={shown}
      onOpenChange={(next) => {
        if (!iconMode) {
          setOpen(next);
          writeSectionOpen(id, next);
        }
      }}
    >
      <SidebarGroup data-testid={testId}>
        {/* biome-ignore lint/a11y/useSemanticElements: header contains nested chevron button, needs div with role button */}
        <div
          className={cn(
            'mb-1 flex h-7 items-center gap-0.5 rounded-md px-1 transition-colors group-data-[collapsible=icon]:hidden',
            selected
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            headerClickable && 'cursor-pointer select-none',
            !selected && 'opacity-70 hover:opacity-100',
          )}
          onClick={headerClickable ? handleTitleClick : undefined}
          onDoubleClick={handleDoubleClick}
          role="button"
          tabIndex={0}
          aria-current={selected ? 'page' : undefined}
          data-selected={selected ? 'true' : 'false'}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              if (headerClickable) {
                handleTitleClick();
              } else {
                toggle();
              }
            }
          }}
        >
          <div
            className={cn(
              'flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 text-left font-semibold text-sm outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
              selected ? 'text-sidebar-accent-foreground' : 'text-sidebar-foreground/70',
            )}
          >
            <span className="flex size-3.5 shrink-0 items-center justify-center [&>svg]:size-3.5">
              {open && openIcon ? openIcon : icon}
            </span>
            <span className="truncate">{title}</span>
          </div>
          <button
            type="button"
            aria-label={open ? 'Collapse section' : 'Expand section'}
            aria-expanded={open}
            onClick={handleChevronClick}
            className="flex size-5 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/50 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <ChevronDownIcon
              className={cn('size-3.5 shrink-0 transition-transform', !open && '-rotate-90')}
            />
          </button>
          {(() => {
            if (actions) {
              return (
                // biome-ignore lint/a11y/noStaticElementInteractions: wrapper only stops propagation to keep header click separate
                // biome-ignore lint/a11y/useKeyWithClickEvents: wrapper only stops propagation
                <span
                  onClick={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                  className="flex shrink-0 items-center"
                >
                  {actions}
                </span>
              );
            }
            if (addLabel && onAdd) {
              return (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title={addLabel}
                  onClick={(event) => {
                    event.stopPropagation();
                    onAdd();
                  }}
                  onDoubleClick={(event) => event.stopPropagation()}
                  aria-label={addLabel}
                >
                  <PlusIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
                  <span className="sr-only">{addLabel}</span>
                </Button>
              );
            }
            return null;
          })()}
        </div>
        <CollapsibleContent className="pb-2">{children}</CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
