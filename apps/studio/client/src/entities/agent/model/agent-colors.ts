/**
 * CC card palette. Tailwind does not compile dynamic `bg-<name>-500` names,
 * so the class strings live here as a static dictionary; `magenta` maps to
 * the fuchsia scale (the CC name, Tailwind's class).
 */
export const AGENT_COLOR_CLASSES: Record<string, string> = {
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

const NEUTRAL_COLOR_CLASS = 'bg-muted-foreground/40';

/** Dot class for an agent color; neutral fallback when unset or unknown. */
export function agentColorClass(color: string | null): string {
  if (color === null) {
    return NEUTRAL_COLOR_CLASS;
  }
  return AGENT_COLOR_CLASSES[color] ?? NEUTRAL_COLOR_CLASS;
}
