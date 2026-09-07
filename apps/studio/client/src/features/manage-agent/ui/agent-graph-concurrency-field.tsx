import { Field, FieldLabel } from '@/shared/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

export function ConcurrencyField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: 'parallel' | 'sequential') => void;
}) {
  return (
    <Field>
      <FieldLabel>Concurrency</FieldLabel>
      <ToggleGroup
        variant="outline"
        spacing={0}
        size="sm"
        value={[value === 'sequential' ? 'sequential' : 'parallel']}
        onValueChange={(next) => {
          const item = next[0];
          if (item === 'parallel' || item === 'sequential') {
            onChange(item);
          }
        }}
      >
        <ToggleGroupItem value="parallel">Parallel</ToggleGroupItem>
        <ToggleGroupItem value="sequential">Sequential</ToggleGroupItem>
      </ToggleGroup>
    </Field>
  );
}

export function concurrencyString(value: unknown): string {
  return typeof value === 'string' ? value : 'parallel';
}
