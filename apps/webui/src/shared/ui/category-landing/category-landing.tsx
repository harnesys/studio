import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

type CategoryLandingProps = {
  children: ReactNode;
  className?: string;
  'data-testid'?: string;
};
export function CategoryLanding({
  children,
  className,
  'data-testid': testId,
}: CategoryLandingProps) {
  return (
    <div
      className={cn(
        'relative flex h-full min-h-0 w-full items-center justify-center overflow-y-auto px-6 py-10',
        className,
      )}
      data-testid={testId}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,color-mix(in_oklab,var(--live)_11%,transparent),transparent_58%)]"
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:radial-gradient(circle_at_1px_1px,var(--foreground)_1px,transparent_0)] [background-size:16px_16px]"
        aria-hidden
      />
      <div className="relative w-full max-w-160">{children}</div>
    </div>
  );
}
export function CategoryLandingEyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="live-dot size-1.5 shrink-0 rounded-full bg-live" />
      <p className="font-medium font-mono text-[11px] text-live uppercase tracking-[0.2em]">
        {children}
      </p>
      <span className="ml-1 hidden h-px flex-1 bg-border/50 sm:block" aria-hidden />
      <span className="hidden font-mono text-[10px] text-muted-foreground/60 uppercase tracking-[0.14em] sm:block">
        Harnesys Desk
      </span>
    </div>
  );
}
export function CategoryLandingTitle({ children }: { children: ReactNode }) {
  return (
    <>
      <h1 className="mt-4 font-medium text-[1.7rem] leading-none tracking-tight">{children}</h1>
      <div className="mt-3 h-px w-16 bg-live/70" aria-hidden />
    </>
  );
}
export function CategoryLandingDescription({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'mt-3 line-clamp-4 max-w-md text-muted-foreground text-sm leading-relaxed',
        className,
      )}
    >
      {children}
    </p>
  );
}
export function CategoryLandingActions({ children }: { children: ReactNode }) {
  return <div className="grid gap-2 sm:grid-cols-2">{children}</div>;
}
export function CategoryLandingSectionLabel({
  children,
  icon,
}: {
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <p className="mb-2.5 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
      {icon ? <span className="size-3 [&_svg]:size-3">{icon}</span> : null}
      {children}
    </p>
  );
}
export function CategoryLandingSection({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-7">
      <CategoryLandingSectionLabel icon={icon}>{label}</CategoryLandingSectionLabel>
      {children}
    </section>
  );
}
type ActionCardProps = {
  icon: ReactNode;
  title: string;
  description: string;
  meta?: string;
  onClick: () => void;
};
export function CategoryLandingActionCard({
  icon,
  title,
  description,
  meta,
  onClick,
}: ActionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-start gap-3 rounded-xl border border-border/70 bg-background/65 px-3 py-3 text-left',
        'shadow-[inset_0_1px_0_color-mix(in_oklab,white_6%,transparent)] backdrop-blur-[2px]',
        'transition-colors hover:border-live/35 hover:bg-[color-mix(in_oklab,var(--live)_6%,var(--background))]',
        'focus-visible:border-live/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live/20',
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted text-muted-foreground transition-colors group-hover:border-live/20 group-hover:bg-[color-mix(in_oklab,var(--live)_14%,transparent)] group-hover:text-live">
        <span className="[&_svg]:size-4">{icon}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-sm leading-4">{title}</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground leading-snug">
          {description}
        </span>
        {meta ? (
          <span className="mt-1.5 inline-flex rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/80 tracking-wide">
            {meta}
          </span>
        ) : null}
      </span>
    </button>
  );
}
export function CategoryLandingList({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-0.5">{children}</ul>;
}
type ListItemProps = {
  icon: ReactNode;
  title: string;
  subtitle: string;
  status?: ReactNode;
  onClick: () => void;
};
export function CategoryLandingListItem({ icon, title, subtitle, status, onClick }: ListItemProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2 py-2 text-left transition-colors hover:border-border/70 hover:bg-background/60 focus-visible:border-live/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live/15"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground [&_svg]:size-3.5">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm leading-4">{title}</span>
          <span className="block truncate font-mono text-[11px] text-muted-foreground leading-4">
            {subtitle}
          </span>
        </span>
        {status ? (
          <span className="shrink-0 font-mono text-[10px] leading-none">{status}</span>
        ) : null}
      </button>
    </li>
  );
}
export function CategoryLandingStarterList({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1.5">{children}</div>;
}
export function CategoryLandingStarter({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border border-transparent bg-background/45 px-3 py-2.5 text-left text-sm leading-snug backdrop-blur-[1px] transition-colors hover:border-border/70 hover:bg-background/70 focus-visible:border-live/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live/15"
    >
      {children}
    </button>
  );
}
