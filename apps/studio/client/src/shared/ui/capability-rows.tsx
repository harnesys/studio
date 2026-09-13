import { ChevronRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import { StatusDot, type StatusDotTone } from '@/shared/ui/status-dot';

/**
 * Borderless row vocabulary for the Capabilities settings panes (Skills, MCP,
 * Plugins, Packages, Mode Presets) — the same idiom the Providers pane already
 * uses: quiet rows, hairline dividers instead of boxes, mono identifiers,
 * uppercase micro-meta, actions that surface on hover. Local to settings so
 * shared primitives and ConfigEntityCard stay untouched.
 */

export function RowList({
  children,
  className,
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div className={cn('flex flex-col divide-y divide-border/20', className)} data-testid={testId}>
      {children}
    </div>
  );
}

/** Header pinned to the top of a settings-pane scroll area while its rows scroll under it. */
export const STICKY_PANE_HEADER = 'sticky top-0 z-10 bg-popover pt-2 pb-1';

/**
 * Pane layer every settings tab shares: a RowHeader (name + description, actions
 * as `extra`) and the rows below it at gap-2. `sticky` pins the header while the
 * pane scrolls; panes with their own scroll region pass sticky={false}.
 */
export function Pane({
  label,
  count,
  description,
  extra,
  sticky = true,
  className,
  testId,
  children,
}: {
  label: string;
  count?: number;
  description?: ReactNode;
  extra?: ReactNode;
  sticky?: boolean;
  className?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)} data-testid={testId}>
      <RowHeader
        className={sticky ? STICKY_PANE_HEADER : undefined}
        label={label}
        count={count}
        description={description}
      >
        {extra}
      </RowHeader>
      {children}
    </div>
  );
}

/** Section header above a RowList: name + optional count/description + right-aligned actions. */
export function RowHeader({
  label,
  count,
  description,
  className,
  children,
}: {
  label: string;
  count?: number;
  description?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn('flex gap-2', description ? 'py-1.5' : 'h-8', className)}>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <p className="flex min-w-0 items-baseline gap-2 font-medium text-sm">
          {label}
          {typeof count === 'number' ? (
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {count}
            </span>
          ) : null}
        </p>
        {description ? (
          <p className="text-muted-foreground text-xs leading-4">{description}</p>
        ) : null}
      </div>
      {children ? <div className="flex shrink-0 gap-1">{children}</div> : null}
    </div>
  );
}

const CHIP_TONES = {
  neutral: 'bg-muted text-muted-foreground',
  accent: 'bg-primary/15 text-primary',
  danger: 'bg-destructive/15 text-destructive',
} as const;

/** Tiny tinted chip for non-identifier qualifiers: origin plugin, "built-in", status. */
export function RowChip({
  children,
  tone = 'neutral',
  testId,
}: {
  children: ReactNode;
  tone?: keyof typeof CHIP_TONES;
  testId?: string;
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-1 rounded px-1 font-mono text-[9px] uppercase leading-4 tracking-wide',
        CHIP_TONES[tone],
      )}
      data-testid={testId}
    >
      {children}
    </span>
  );
}

type RowProps = {
  title: string;
  /** Mono is the identifier look; pass mono={false} for human-readable names. */
  mono?: boolean;
  /** Dim the title — disabled/off entries. */
  muted?: boolean;
  /** Small uppercase mono text right after the title: transport, kind, counts. */
  meta?: ReactNode;
  /** Chips after the meta: origin plugin, built-in, blocked status. */
  chips?: ReactNode;
  status?: { tone: StatusDotTone; label: string };
  /** Always-visible second line, truncated — the full text lives in the expand area. */
  summary?: ReactNode;
  /** Click toggles expansion; a chevron is drawn only when provided. */
  onToggle?: () => void;
  expanded?: boolean;
  /** 'expand' (default): chevron rotates when open. 'open': static chevron — the click navigates. */
  chevron?: 'expand' | 'open';
  /** Row actions (edit/delete/…). Revealed on hover/focus; kept visible when expanded. */
  actions?: ReactNode;
  /** Keep actions visible instead of revealing them on hover/focus. */
  alwaysShowActions?: boolean;
  testId?: string;
  /** Expanded content, aligned under the title. */
  children?: ReactNode;
};

export function Row({
  title,
  mono = true,
  muted = false,
  meta,
  chips,
  status,
  summary,
  onToggle,
  expanded = false,
  chevron = 'expand',
  actions,
  alwaysShowActions = false,
  testId,
  children,
}: RowProps) {
  const head = (
    <div className="flex min-w-0 flex-1 items-start gap-2">
      <ChevronRightIcon
        className={cn(
          'mt-[3px] size-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
          !onToggle && 'opacity-0',
          onToggle && chevron === 'expand' && expanded && 'rotate-90',
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          {status ? (
            <StatusDot tone={status.tone} label={status.label} className="mb-px shrink-0" />
          ) : null}
          <span
            className={cn(
              'truncate text-sm leading-5',
              muted && 'text-muted-foreground',
              mono ? 'font-mono text-[13px]' : 'font-medium',
            )}
          >
            {title}
          </span>
          {meta ? (
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
              {meta}
            </span>
          ) : null}
          {chips}
        </div>
        {summary ? (
          <p className="truncate text-muted-foreground text-xs leading-4">{summary}</p>
        ) : null}
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        'group/row -mx-2 rounded-md px-2 transition-colors',
        expanded ? 'bg-muted/30' : 'hover:bg-muted/40',
      )}
      data-testid={testId}
    >
      <div className="flex items-center gap-2 py-2">
        {onToggle ? (
          <button
            type="button"
            className="flex min-w-0 flex-1 items-start gap-2 text-left"
            aria-expanded={expanded}
            onClick={onToggle}
          >
            {head}
          </button>
        ) : (
          head
        )}
        <div
          className={cn(
            'flex shrink-0 items-center gap-1 transition-opacity duration-150',
            expanded || !actions || alwaysShowActions
              ? ''
              : 'opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100',
          )}
        >
          {actions}
        </div>
      </div>
      {onToggle && expanded && children ? <div className="pb-2 pl-7">{children}</div> : null}
    </div>
  );
}

/** Labelled block inside a row's expand area (Tools, Resources, Connection…). */
export function RowSection({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <div className="mt-2 flex flex-col gap-1 border-border/40 border-t pt-2 first-of-type:mt-0 first-of-type:border-t-0 first-of-type:pt-1">
      <p className="flex items-baseline gap-1.5 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
        {typeof count === 'number' ? (
          <span className="font-mono font-normal normal-case tabular-nums">{count}</span>
        ) : null}
      </p>
      {children}
    </div>
  );
}

export function RowItem({
  title,
  description,
  testId,
}: {
  title: string;
  description?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="min-w-0 px-1 py-0.5" data-testid={testId}>
      <p className="truncate font-mono text-[12px] leading-snug">{title}</p>
      {description ? (
        <p className="line-clamp-2 text-[11px] text-muted-foreground leading-snug">{description}</p>
      ) : null}
    </div>
  );
}

/** Label/value line inside the expand area — how an entry is wired (command, URL, path…). */
export function RowField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-2 px-1 py-0.5">
      <span className="w-16 shrink-0 pt-px font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span className="wrap-anywhere min-w-0 font-mono text-[12px] leading-snug">{value}</span>
    </div>
  );
}
