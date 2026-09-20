import {
  ENTITY_COLOR_CLASSES,
  ENTITY_COLOR_NAMES,
  ENTITY_COLOR_RING_CLASSES,
  ENTITY_COLOR_TILE_CLASSES,
} from '@/shared/lib/entity-colors';
import { cn } from '@/shared/lib/utils';

export function ColorSwatches({
  value,
  onChange,
  testIdPrefix,
}: {
  value: string | null;
  onChange: (color: string | null) => void;
  testIdPrefix: string;
}) {
  return (
    <div
      className="flex w-full items-center gap-1 rounded-lg border px-3 py-2"
      data-testid={`${testIdPrefix}-picker`}
    >
      <SwatchTile
        label="Color default"
        selected={value === null}
        testId={`${testIdPrefix}-default`}
        onClick={() => onChange(null)}
        className="bg-muted ring-foreground/60"
      >
        <span className="size-3.5 rounded-full bg-muted-foreground/40" />
      </SwatchTile>
      {ENTITY_COLOR_NAMES.map((color) => (
        <SwatchTile
          key={color}
          label={`Color ${color}`}
          selected={value === color}
          testId={`${testIdPrefix}-${color}`}
          onClick={() => onChange(value === color ? null : color)}
          className={cn(ENTITY_COLOR_TILE_CLASSES[color], ENTITY_COLOR_RING_CLASSES[color])}
        >
          <span className={cn('size-3.5 rounded-full', ENTITY_COLOR_CLASSES[color])} />
        </SwatchTile>
      ))}
    </div>
  );
}
function SwatchTile({
  label,
  selected,
  testId,
  onClick,
  className,
  children,
}: {
  label: string;
  selected: boolean;
  testId: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'flex h-7 flex-1 items-center justify-center rounded-md outline-none transition-colors',
        'hover:ring-1 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring/50',
        selected ? 'ring-2' : '',
        className,
      )}
    >
      {children}
    </button>
  );
}
