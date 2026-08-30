export const UI_SCALES = ['small', 'middle', 'large', 'extra'] as const;
export type UiScale = (typeof UI_SCALES)[number];
export const DEFAULT_UI_SCALE: UiScale = 'middle';

export const UI_SCALE_LABELS: Record<UiScale, string> = {
  small: 'Small',
  middle: 'Middle',
  large: 'Large',
  extra: 'Extra',
};

export const UI_ACCENTS = ['red', 'orange', 'yellow', 'green', 'iris', 'indigo', 'violet'] as const;
export type UiAccent = (typeof UI_ACCENTS)[number];
export const DEFAULT_UI_ACCENT: UiAccent = 'orange';

export const UI_ACCENT_SWATCHES: Record<
  UiAccent,
  { label: string; swatch: string; onSwatch: string }
> = {
  red: { label: 'Red', swatch: '#e5484d', onSwatch: '#fff' },
  orange: { label: 'Orange', swatch: '#c4622d', onSwatch: '#fff' },
  yellow: { label: 'Yellow', swatch: '#e2b00b', onSwatch: '#1a1d22' },
  green: { label: 'Green', swatch: '#2f9e6a', onSwatch: '#fff' },
  iris: { label: 'Iris', swatch: '#5b5bd6', onSwatch: '#fff' },
  indigo: { label: 'Indigo', swatch: '#3e63dd', onSwatch: '#fff' },
  violet: { label: 'Violet', swatch: '#7c3aed', onSwatch: '#fff' },
};

export function isUiScale(value: string | null): value is UiScale {
  return value !== null && (UI_SCALES as readonly string[]).includes(value);
}

export function isUiAccent(value: string | null): value is UiAccent {
  return value !== null && (UI_ACCENTS as readonly string[]).includes(value);
}
