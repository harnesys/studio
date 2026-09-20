export const ENTITY_COLOR_CLASSES: Record<string, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  yellow: 'bg-yellow-500',
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  magenta: 'bg-fuchsia-500',
  cyan: 'bg-cyan-500',
  pink: 'bg-pink-500',
};
export const ENTITY_COLOR_NAMES = Object.keys(ENTITY_COLOR_CLASSES);
const NEUTRAL_COLOR_CLASS = 'bg-muted-foreground/40';
export function entityColorClass(color: string | null): string {
  if (color === null) {
    return NEUTRAL_COLOR_CLASS;
  }
  return ENTITY_COLOR_CLASSES[color] ?? NEUTRAL_COLOR_CLASS;
}
