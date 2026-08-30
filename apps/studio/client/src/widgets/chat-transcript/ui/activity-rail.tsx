import type { ReactNode } from 'react';

export function ActivityRail({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex flex-col gap-1 pl-1">
      <div aria-hidden className="absolute top-1.5 bottom-1.5 left-[11px] w-px bg-border/60" />
      {children}
    </div>
  );
}
