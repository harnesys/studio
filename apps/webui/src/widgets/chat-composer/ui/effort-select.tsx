import type { Effort } from '@harnesys/studio-shared';
import { BrainIcon, ChevronDownIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { effortLabel } from '../model/agent-effort';
export function EffortSelect({
  levels,
  value,
  disabled,
  onChange,
}: {
  levels: Effort[];
  value: Effort;
  disabled?: boolean;
  onChange: (next: Effort) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        title="Reasoning effort"
        className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-sm outline-none hover:bg-muted disabled:opacity-50"
        data-testid="effort-select"
      >
        <BrainIcon className="size-3.5 shrink-0" />
        <span>{effortLabel(value)}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="min-w-32 p-1">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            if (levels.some((item) => item === next)) {
              onChange(next as Effort);
            }
          }}
        >
          {levels.map((item) => (
            <DropdownMenuRadioItem
              key={item}
              value={item}
              className={cn(item === value && 'bg-muted')}
            >
              {effortLabel(item)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
