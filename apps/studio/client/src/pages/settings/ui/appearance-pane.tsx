import {
  UI_ACCENT_SWATCHES,
  UI_ACCENTS,
  UI_SCALE_LABELS,
  UI_SCALES,
} from '@/shared/lib/appearance';
import { cn } from '@/shared/lib/utils';
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { useTheme } from '@/shared/ui/theme-provider';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

export function AppearancePane() {
  const { theme, setTheme, scale, setScale, accent, setAccent } = useTheme();

  return (
    <FieldGroup className="gap-6">
      <Field>
        <FieldLabel id="theme-label">Theme</FieldLabel>
        <ToggleGroup
          aria-labelledby="theme-label"
          variant="outline"
          spacing={0}
          value={[theme]}
          onValueChange={(value) => {
            const next = value[0];
            if (next === 'dark' || next === 'light' || next === 'system') {
              setTheme(next);
            }
          }}
        >
          <ToggleGroupItem value="dark" className="min-w-[72px]">
            Dark
          </ToggleGroupItem>
          <ToggleGroupItem value="light" className="min-w-[72px]">
            Light
          </ToggleGroupItem>
          <ToggleGroupItem value="system" className="min-w-[72px]">
            System
          </ToggleGroupItem>
        </ToggleGroup>
      </Field>
      <Field>
        <FieldLabel id="accent-label">
          Accent{' '}
          <span className="font-normal text-muted-foreground">
            <span className="mr-2">·</span>
            {UI_ACCENT_SWATCHES[accent].label}
          </span>
        </FieldLabel>
        <div className="flex flex-wrap items-center gap-2.5 py-1" data-testid="accent-select">
          {UI_ACCENTS.map((id) => {
            const option = UI_ACCENT_SWATCHES[id];
            const selected = accent === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                aria-label={option.label}
                title={option.label}
                data-testid={`accent-${id}`}
                className={cn(
                  'group relative flex size-5.5 items-center justify-center rounded-full border-2 bg-transparent outline-none transition-all',
                  'ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring',
                  selected ? 'border-current' : 'opacity-70 hover:opacity-100',
                )}
                style={{ borderColor: option.swatch }}
                onClick={() => setAccent(id)}
              >
                {selected ? (
                  <span
                    className="size-2.5 rounded-full transition-all"
                    style={{ backgroundColor: option.swatch }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </Field>
      <Field>
        <FieldLabel id="scale-label">Scale</FieldLabel>
        <ToggleGroup
          aria-labelledby="scale-label"
          variant="outline"
          spacing={0}
          value={[scale]}
          data-testid="scale-select"
          onValueChange={(value) => {
            const next = value[0];
            if (next === 'small' || next === 'middle' || next === 'large' || next === 'extra') {
              setScale(next);
            }
          }}
        >
          {UI_SCALES.map((item) => (
            <ToggleGroupItem key={item} value={item} className="min-w-[72px]">
              {UI_SCALE_LABELS[item]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
    </FieldGroup>
  );
}
