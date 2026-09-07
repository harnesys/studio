import type * as React from 'react';

import { cn } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/input';

export function GraphInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <Input
      className={cn('h-7 rounded-md px-2 text-sm md:text-sm dark:bg-input/20', className)}
      {...props}
    />
  );
}
