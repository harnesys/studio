import { MoreHorizontalIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/shared/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';

type SectionMenuProps = {
  label: string;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  contentClassName?: string;
};

export function SectionMenu({
  label,
  children,
  align = 'end',
  contentClassName,
}: SectionMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-xs" title={label} aria-label={label} />}
      >
        <MoreHorizontalIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
        <span className="sr-only">{label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={contentClassName}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
