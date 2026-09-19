import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
export function FactRow({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12px] leading-5">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          'min-w-0 truncate text-right',
          mono ? 'font-mono text-[11px]' : 'font-medium',
        )}
      >
        {children}
      </span>
    </div>
  );
}
