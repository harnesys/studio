import { type LucideIcon, MessageSquareIcon, ServerIcon, SunIcon, UserIcon } from 'lucide-react';
import { WINDOW_SETTINGS_GROUPS, type WindowSettingsCategory } from '@/shared/config/settings-nav';
import { cn } from '@/shared/lib/utils';

const NAV_ICONS: Record<WindowSettingsCategory, LucideIcon> = {
  profile: UserIcon,
  appearance: SunIcon,
  chat: MessageSquareIcon,
  hosts: ServerIcon,
};

type SettingsNavProps = {
  active: WindowSettingsCategory;
  onSelect: (category: WindowSettingsCategory) => void;
};

export function SettingsNav({ active, onSelect }: SettingsNavProps) {
  return (
    <nav
      className="flex flex-row gap-4 overflow-x-auto px-2 py-2 md:flex-col md:gap-5 md:overflow-visible"
      data-testid="settings-nav"
    >
      {WINDOW_SETTINGS_GROUPS.map((group) => (
        <div key={group.id} className="flex min-w-36 flex-col gap-0.5 md:min-w-0">
          <p className="px-2 pb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
            {group.label}
          </p>
          {group.items.map((item) => {
            const selected = item.id === active;
            const Icon = NAV_ICONS[item.id];
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`settings-nav-${item.id}`}
                data-active={selected ? 'true' : 'false'}
                className={cn(
                  'flex h-7 items-center gap-2 rounded-md px-2.5 text-left text-sm transition-colors',
                  selected
                    ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                    : 'text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground',
                )}
                onClick={() => onSelect(item.id)}
              >
                <Icon className="size-3.5 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
