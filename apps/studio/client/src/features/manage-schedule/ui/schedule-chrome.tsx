import { cn } from '@/shared/lib/utils';

export function SectionLabel({ children }: { children: string }) {
  return (
    <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
      {children}
    </p>
  );
}

export function MetaChip({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-background/70 px-2 py-1">
      <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-[0.12em]">
        {label}
      </span>
      <span
        className={cn('truncate text-[11px] text-foreground/90 leading-none', mono && 'font-mono')}
      >
        {value}
      </span>
    </span>
  );
}
