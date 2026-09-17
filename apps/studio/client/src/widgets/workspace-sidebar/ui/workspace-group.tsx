import { EllipsisIcon, SettingsIcon } from 'lucide-react';

import { openWorkspaceSettingsDialog } from '@/features/manage-workspace-settings';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

export function WorkspaceGroupLabel({
  workspaceId,
  name,
  count,
}: {
  workspaceId: string;
  name: string;
  count: number;
}) {
  return (
    <div
      className="flex items-center gap-1.5 px-1.5 pt-1.5 pb-0.5 text-[11px] text-muted-foreground uppercase tracking-[0.04em] group-data-[collapsible=icon]:hidden"
      data-testid={`workspace-group-${name}`}
    >
      <span className="truncate">{name}</span>
      <span className="shrink-0">{count}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={`${name} settings`}
              data-testid={`workspace-group-menu-${workspaceId}`}
              className="ml-auto flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground"
            />
          }
        >
          <EllipsisIcon className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom" className="min-w-40">
          <DropdownMenuItem
            onClick={() => {
              void openWorkspaceSettingsDialog(workspaceId);
            }}
          >
            <SettingsIcon />
            Settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
