import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
export function ActivityRail({ children, live = false }: { children: ReactNode; live?: boolean }) {
  return (
    <div className="relative flex flex-col gap-2 pl-1">
      <div
        aria-hidden
        className={cn(
          'absolute top-1.5 bottom-1.5 left-[11px] w-px rounded-full bg-border/60',
          live && 'activity-rail-live',
        )}
      />
      {children}
    </div>
  );
}
