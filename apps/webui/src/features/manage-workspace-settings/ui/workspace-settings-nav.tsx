import { cn } from '@/shared/lib/utils';

import {
  WORKSPACE_SETTINGS_GROUPS,
  type WorkspaceSettingsCategory,
} from '../model/workspace-settings-nav';

export type WorkspaceSettingsNavProps = {
  category: WorkspaceSettingsCategory;
  onSelect: (category: WorkspaceSettingsCategory) => void;
  className?: string;
};

export function WorkspaceSettingsNav({ category, onSelect, className }: WorkspaceSettingsNavProps) {
  return (
    <nav
      className={cn('flex w-40 shrink-0 flex-col gap-4', className)}
      data-testid="workspace-settings-nav"
    >
      {WORKSPACE_SETTINGS_GROUPS.map((group) => (
        <div key={group.id} className="flex flex-col gap-0.5">
          <p className="px-2 pb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
            {group.label}
          </p>
          {group.items.map((item) => {
            const selected = item.id === category;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`workspace-settings-nav-${item.id}`}
                data-active={selected ? 'true' : 'false'}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm',
                  selected
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-muted-foreground hover:bg-sidebar-accent/50',
                )}
                onClick={() => onSelect(item.id)}
              >
                <item.icon className="size-3.5 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
