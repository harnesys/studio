import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';

type ConfigEntityCardProps = {
  title: string;
  badge?: string;
  /** Accent badge next to `badge` (e.g. "Default Mode"). */
  statusBadge?: string;
  description?: string;
  initials: string;
  monoTitle?: boolean;
  trailing?: ReactNode;
  expanded?: boolean;
  onClick?: () => void;
  children?: ReactNode;
};

export function ConfigEntityCard({
  title,
  badge,
  statusBadge,
  description,
  initials,
  monoTitle = false,
  trailing,
  expanded = false,
  onClick,
  children,
}: ConfigEntityCardProps) {
  const body = (
    <>
      <Avatar size="sm" className="mt-0.5 size-8 shrink-0 after:hidden">
        <AvatarFallback className="bg-[color-mix(in_oklab,var(--live)_12%,transparent)] text-[11px]">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span
            className={cn(
              'truncate font-medium text-sm leading-5',
              monoTitle && 'font-mono text-[13px]',
            )}
          >
            {title}
          </span>
          {badge ? (
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
              {badge}
            </span>
          ) : null}
          {statusBadge ? (
            <span className="shrink-0 rounded bg-primary/15 px-1 font-medium text-[9px] text-primary uppercase leading-4 tracking-wide">
              {statusBadge}
            </span>
          ) : null}
        </div>
        {description ? (
          <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs leading-4">
            {description}
          </p>
        ) : null}
      </div>
    </>
  );

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-lg border border-muted bg-card/30',
        'transition-colors hover:border-border hover:bg-muted/40',
        expanded && 'border-border bg-muted/40',
      )}
    >
      <div className="flex items-start gap-3 px-3 py-2.5">
        {onClick ? (
          <button
            type="button"
            className="flex min-w-0 flex-1 items-start gap-3 text-left"
            onClick={onClick}
          >
            {body}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-start gap-3">{body}</div>
        )}
        {trailing ? <div className="flex shrink-0 items-center gap-1">{trailing}</div> : null}
      </div>
      {expanded && children ? (
        <div className="border-border/60 border-t px-3 py-2.5">{children}</div>
      ) : null}
    </div>
  );
}

export function initialsFromLabel(label: string): string {
  const cleaned = label.replace(/[_-]+/g, ' ').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '??';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}
