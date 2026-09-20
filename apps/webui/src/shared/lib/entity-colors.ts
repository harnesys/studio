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
export const ENTITY_COLOR_TILE_CLASSES: Record<string, string> = {
  red: 'bg-red-500/15',
  orange: 'bg-orange-500/15',
  yellow: 'bg-yellow-500/15',
  green: 'bg-green-500/15',
  blue: 'bg-blue-500/15',
  purple: 'bg-purple-500/15',
  magenta: 'bg-fuchsia-500/15',
  cyan: 'bg-cyan-500/15',
  pink: 'bg-pink-500/15',
};
export const ENTITY_COLOR_RING_CLASSES: Record<string, string> = {
  red: 'ring-red-500/60',
  orange: 'ring-orange-500/60',
  yellow: 'ring-yellow-500/60',
  green: 'ring-green-500/60',
  blue: 'ring-blue-500/60',
  purple: 'ring-purple-500/60',
  magenta: 'ring-fuchsia-500/60',
  cyan: 'ring-cyan-500/60',
  pink: 'ring-pink-500/60',
};
export const ENTITY_COLOR_NAMES = Object.keys(ENTITY_COLOR_CLASSES);
const NEUTRAL_COLOR_CLASS = 'bg-muted-foreground/40';
export function entityColorClass(color: string | null): string {
  if (color === null) {
    return NEUTRAL_COLOR_CLASS;
  }
  return ENTITY_COLOR_CLASSES[color] ?? NEUTRAL_COLOR_CLASS;
}
