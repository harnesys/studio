import { GitBranchIcon } from 'lucide-react';

import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/shared/ui/dropdown-menu';

export function BranchRow({
  name,
  current,
  onCheckout,
  onNewBranch,
}: {
  name: string;
  current: boolean;
  onCheckout: () => void;
  onNewBranch: () => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="flex items-center gap-1.5">
          <GitBranchIcon className="size-3.5" />
          <span className="truncate">{name}</span>
          {current ? <span className="text-muted-foreground text-xs">(current)</span> : null}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-56">
        {!current ? (
          <DropdownMenuItem onClick={onCheckout}>Checkout</DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>Current branch</DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onNewBranch}>
          New Branch from &apos;{name}&apos;...
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
