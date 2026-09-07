import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

export type FeedNoticeTone = 'neutral' | 'live' | 'accent' | 'danger';

const TONE_RAIL: Record<FeedNoticeTone, string> = {
  neutral: 'bg-muted-foreground/35',
  live: 'bg-live',
  accent: 'bg-foreground/25',
  danger: 'bg-destructive',
};

const TONE_SURFACE: Record<FeedNoticeTone, string> = {
  neutral: 'bg-muted/25',
  live: 'bg-[color-mix(in_oklab,var(--live)_7%,transparent)]',
  accent: 'bg-muted/20',
  danger: 'bg-destructive/8',
};

const TONE_LABEL: Record<FeedNoticeTone, string> = {
  neutral: 'text-muted-foreground',
  live: 'text-live',
  accent: 'text-foreground/80',
  danger: 'text-destructive',
};

/**
 * Единый каркас meta-элементов ленты: system, schedule, compaction, error.
 * Слева тонкая tone-рейка, сверху строка метки, ниже тело. Новые типы
 * добавляют tone + icon + meta, не новый layout.
 */
export function FeedNotice({
  tone = 'neutral',
  icon: Icon,
  label,
  meta,
  pending = false,
  actions,
  children,
  className,
  testId,
}: {
  tone?: FeedNoticeTone;
  icon: LucideIcon;
  label: string;
  meta?: ReactNode;
  pending?: boolean;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'relative overflow-hidden rounded-lg border border-border/70',
        TONE_SURFACE[tone],
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-0 w-[3px]',
          TONE_RAIL[tone],
          pending && 'opacity-70',
        )}
      />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 pr-3 pl-3.5">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 font-medium text-[11px]',
            TONE_LABEL[tone],
          )}
        >
          <Icon className={cn('size-3.5 shrink-0 opacity-80', pending && 'thinking-icon-pulse')} />
          <span className={cn(pending && 'thinking-shimmer')}>{label}</span>
        </span>
        {meta ? (
          <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {meta}
          </span>
        ) : null}
        {actions ? (
          <span className="ml-auto flex shrink-0 items-center gap-1">{actions}</span>
        ) : null}
      </div>
      {children ? (
        <div className="border-border/50 border-t px-3.5 py-2.5 text-sm leading-relaxed">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function FeedNoticeMetaSep() {
  return <span className="text-border">·</span>;
}
