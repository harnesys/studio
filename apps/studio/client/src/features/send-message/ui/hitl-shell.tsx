import type { ReactNode } from 'react';
import { InputGroup } from '@/shared/ui/input-group';

export function HitlShell({ children }: { children: ReactNode }) {
  return <InputGroup className="h-auto rounded-2xl">{children}</InputGroup>;
}
