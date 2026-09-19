import { TriangleAlertIcon, WrenchIcon, ZapIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/shared/ui/hover-card';
export function UnverifiedModelCard({
  modelName,
  children,
}: {
  modelName?: string;
  children: ReactNode;
}) {
  return (
    <HoverCard>
      <HoverCardTrigger render={children as React.ReactElement} />
      <HoverCardContent side="top" align="end" className="w-80 space-y-2.5 p-3">
        <div className="flex items-start gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-500">
            <TriangleAlertIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
              <span>Unverified Model</span>
              {modelName ? (
                <span className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {modelName}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
              This model was discovered dynamically or added manually and is not yet in the verified
              Harnesys catalog.
            </p>
          </div>
        </div>

        <div className="space-y-1.5 rounded-md bg-muted/50 p-2 text-[11px]">
          <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
            <WrenchIcon className="size-3 text-amber-500" />
            <span>Potential limitations:</span>
          </div>
          <ul className="list-inside list-disc space-y-0.5 pl-1 text-muted-foreground/80">
            <li>Tool / function calling stability</li>
            <li>Reasoning token extraction</li>
            <li>Context window boundaries</li>
          </ul>
        </div>

        <div className="flex items-center justify-between pt-0.5 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <ZapIcon className="size-3 text-muted-foreground/70" />
            Runs in standard compatibility mode
          </span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
