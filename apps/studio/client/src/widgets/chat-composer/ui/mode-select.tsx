import { ChevronDownIcon, ShieldIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

import type { ComposerMode, ComposerModeItem } from '../model/composer-mode';

export function ModeSelect({
  modes,
  value,
  disabled,
  onChange,
}: {
  modes: ComposerModeItem[];
  value: ComposerMode;
  disabled?: boolean;
  onChange: (mode: ComposerMode) => void;
}) {
  const current = modes.find((item) => item.value === value) ?? { value, label: value, detail: '' };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className="inline-flex h-7 max-w-52 items-center gap-1.5 rounded-md px-1.5 text-sm outline-none hover:bg-muted disabled:opacity-50"
        data-testid="mode-select"
      >
        <ShieldIcon className="size-3.5 shrink-0" />
        <span className="truncate">{current.label}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="min-w-64 p-1">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {modes.map((item) => {
            const selected = item.value === value;
            return (
              <DropdownMenuRadioItem
                key={item.value}
                value={item.value}
                className={cn('items-start gap-2 py-2 pr-8', selected && 'bg-muted')}
              >
                <ShieldIcon className="mt-0.5 size-4" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm">{item.label}</span>
                  <span className="text-muted-foreground text-xs">{item.detail}</span>
                </span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
