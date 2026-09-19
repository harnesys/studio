import type { ReactNode } from 'react';
import { InputGroup } from '@/shared/ui/input-group';

export function HitlShell({ children }: { children: ReactNode }) {
  return (
    <InputGroup className="h-auto rounded-2xl has-disabled:bg-transparent has-disabled:opacity-100 dark:has-disabled:bg-transparent">
      {children}
    </InputGroup>
  );
}
