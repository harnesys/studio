import type { ReactNode } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';

export function StatusIcon({
  label,
  detail,
  testId,
  children,
}: {
  label: string;
  detail?: ReactNode;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            data-testid={testId}
            role="img"
            className="inline-flex size-6 items-center justify-center"
            aria-label={label}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent className={detail ? 'flex-col items-start py-2' : undefined}>
        {detail ?? label}
      </TooltipContent>
    </Tooltip>
  );
}
