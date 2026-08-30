import type { ReactNode } from 'react';

export function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-medium text-[11px] text-muted-foreground">{label}</h2>
        {hint ? (
          <span className="font-mono text-[10px] text-muted-foreground/80">{hint}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}
