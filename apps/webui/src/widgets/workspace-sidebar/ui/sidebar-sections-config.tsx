import { CogIcon, EllipsisVerticalIcon } from 'lucide-react';
import { useStudioNavigation } from '@/shared/config/navigation';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { SidebarMenuButton, useSidebar } from '@/shared/ui/sidebar';
import { useAccordionStore } from '../model/accordion.store';
import { SECTION_META, type SidebarSectionId } from './sections-meta';

export function SidebarSectionsConfig() {
  const order = useAccordionStore((state) => state.order);
  const hidden = useAccordionStore((state) => state.hidden);
  const setVisibility = useAccordionStore((state) => state.setVisibility);
  const { openSettings } = useStudioNavigation();
  const { setOpenMobile } = useSidebar();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="text-muted-foreground"
        render={
          <SidebarMenuButton
            tooltip="Sections"
            aria-label="Toggle sections"
            data-testid="nav-sections"
            className="w-auto"
          />
        }
      >
        <EllipsisVerticalIcon />
        <span className="sr-only">Sections</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Sections</DropdownMenuLabel>
          {order.map((id) => {
            const meta = SECTION_META[id as SidebarSectionId];
            if (!meta) {
              return null;
            }
            const Icon = meta.icon;
            return (
              <DropdownMenuCheckboxItem
                key={id}
                checked={!hidden[id]}
                onCheckedChange={(checked) => setVisibility(id, Boolean(checked))}
              >
                <Icon className="size-3" />
                {meta.label}
            </DropdownMenuCheckboxItem>
          );
        })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => {
              openSettings();
              setOpenMobile(false);
            }}
            data-testid="nav-settings"
          >
            <CogIcon className="size-3" />
            Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
