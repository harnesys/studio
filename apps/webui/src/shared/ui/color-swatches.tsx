import { ENTITY_COLOR_CLASSES, ENTITY_COLOR_NAMES } from '@/shared/lib/entity-colors';
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
    <div className="flex items-center gap-1.5 pt-0.5" data-testid={`${testIdPrefix}-picker`}>
      {ENTITY_COLOR_NAMES.map((color) => {
        const selected = value === color;
        return (
          <button
            key={color}
            type="button"
            aria-pressed={selected}
            aria-label={`Color ${color}`}
            data-testid={`${testIdPrefix}-${color}`}
            onClick={() => onChange(selected ? null : color)}
            className={cn(
              'size-4 rounded-full transition-opacity',
              ENTITY_COLOR_CLASSES[color],
              selected
                ? 'opacity-100 ring-2 ring-foreground/60 ring-offset-2 ring-offset-background'
                : 'opacity-50 hover:opacity-100',
            )}
          />
        );
      })}
    </div>
  );
}
