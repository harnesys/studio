import type { ReactNode } from 'react';
import { HostAuthBootstrap } from '@/app/host-auth-bootstrap';
import { ThemeProvider } from '@/shared/ui/theme-provider';
import { Toaster } from '@/shared/ui/toast';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { QueryProvider } from './query-provider';
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider defaultTheme="dark">
      <QueryProvider>
        <HostAuthBootstrap>
          <TooltipProvider>
            <Toaster>{children}</Toaster>
          </TooltipProvider>
        </HostAuthBootstrap>
      </QueryProvider>
    </ThemeProvider>
  );
}
