import type { ReactNode } from 'react';

export function Section({
  label,
  hint,
  action,
  children,
}: {
  label: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex h-6 items-center justify-between gap-2">
        <h2 className="font-medium text-[11px] text-muted-foreground">{label}</h2>
        <div className="flex min-w-0 items-center gap-1">
          {hint ? (
            <span className="font-mono text-[10px] text-muted-foreground/80">{hint}</span>
          ) : null}
          {action}
        </div>
      </div>
      {children}
    </section>
  );
}
