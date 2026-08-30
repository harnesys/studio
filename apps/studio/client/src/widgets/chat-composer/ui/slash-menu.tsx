import type { SlashCommand } from '../model/slash-commands';

export type SlashMenuProps = {
  commands: SlashCommand[];
  activeIndex: number;
  onHover(index: number): void;
  onPick(command: SlashCommand): void;
};

export function SlashMenu(props: SlashMenuProps) {
  const { commands, activeIndex, onHover, onPick } = props;
  if (commands.length === 0) {
    return null;
  }

  return (
    <div
      className="absolute inset-x-0 bottom-full z-20 mx-4 mb-2 overflow-hidden rounded-xl border border-border bg-popover px-1 text-popover-foreground shadow-md"
      data-testid="slash-menu"
    >
      <ul className="max-h-56 overflow-y-auto py-1">
        {commands.map((command, index) => {
          const active = index === activeIndex;
          return (
            <li key={command.name}>
              <button
                type="button"
                className={`flex w-full items-start gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60'
                }`}
                onMouseEnter={() => onHover(index)}
                onClick={() => onPick(command)}
              >
                <span className="font-medium font-mono text-xs">/{command.name}</span>
                <span className="text-muted-foreground text-xs">{command.description}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
