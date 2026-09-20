import { ChevronRightIcon, type LucideIcon } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { useScrollAnchor } from '@/shared/lib/scroll-anchor';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
export type ActivityBadge = {
  text: string;
  tone?: 'default' | 'live' | 'destructive';
};
export function ActivityLine({
  icon: Icon,
  label,
  hint,
  badges,
  tail,
  active = false,
  failed = false,
  defaultOpen,
  hasContent = false,
  indentContent = true,
  children,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string | null;
  badges?: ActivityBadge[];
  tail?: ReactNode;
  active?: boolean;
  failed?: boolean;
  defaultOpen?: boolean;
  hasContent?: boolean;
  indentContent?: boolean;
  children?: ReactNode;
}) {
  const [manual, setManual] = useState<boolean | undefined>(undefined);
  const open = manual ?? defaultOpen;
  const collapsible = hasContent && Boolean(children);
  const headerRef = useRef<HTMLDivElement>(null);
  useScrollAnchor(headerRef, Boolean(open));
  return (
    <Collapsible open={collapsible ? open : false} onOpenChange={setManual}>
      <div
        ref={headerRef}
        className="flex min-h-6 w-full min-w-0 items-center gap-2 text-[13px] leading-none opacity-60"
      >
        <CollapsibleTrigger
          disabled={!collapsible}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 overflow-hidden text-left transition-opacity hover:opacity-80 disabled:cursor-default disabled:hover:opacity-100 data-[state=open]:opacity-100"
        >
          <Icon
            className={cn(
              'relative z-10 size-3.5 shrink-0 bg-background',
              failed ? 'text-destructive' : 'text-muted-foreground',
              active && 'thinking-icon-pulse text-live',
            )}
          />
          <span
            className={cn('shrink-0 font-medium text-foreground/90', active && 'thinking-shimmer')}
          >
            {label}
          </span>
          {hint ? (
            <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground/80">
              {hint}
            </span>
          ) : null}
          {badges?.map((badge) => (
            <Badge
              key={badge.text}
              variant={badge.tone === 'destructive' ? 'destructive' : 'outline'}
              className={cn(
                'h-4 shrink-0 px-1 font-normal text-[10px] text-muted-foreground',
                badge.tone === 'live' && 'border-live/40 bg-live/10 text-live',
              )}
            >
              {badge.text}
            </Badge>
          ))}
        </CollapsibleTrigger>
        {tail}
        {collapsible ? (
          <ChevronRightIcon
            className={cn(
              'size-3 shrink-0 text-muted-foreground/40 transition-transform',
              open && 'rotate-90',
            )}
          />
        ) : null}
      </div>
      {collapsible ? (
        <CollapsibleContent>
          <div className={cn('pt-1.5 pb-0.5', indentContent && 'pl-[26px]')}>{children}</div>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}
