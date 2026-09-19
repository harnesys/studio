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

/** Avatar tint (soft bg + colored initials) per agent color. */
export const AGENT_COLOR_TINT_CLASSES: Record<string, string> = {
  red: 'bg-red-500/12 text-red-600 dark:text-red-400',
  orange: 'bg-orange-500/12 text-orange-600 dark:text-orange-400',
  yellow: 'bg-yellow-500/12 text-yellow-600 dark:text-yellow-400',
  green: 'bg-green-500/12 text-green-600 dark:text-green-400',
  blue: 'bg-blue-500/12 text-blue-600 dark:text-blue-400',
  purple: 'bg-purple-500/12 text-purple-600 dark:text-purple-400',
  magenta: 'bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-400',
  cyan: 'bg-cyan-500/12 text-cyan-600 dark:text-cyan-400',
  pink: 'bg-pink-500/12 text-pink-600 dark:text-pink-400',
};

const NEUTRAL_TINT_CLASS = 'bg-[color-mix(in_oklab,var(--live)_10%,transparent)]';

/** Avatar tint class; keeps the live-accent fallback when color is unset or unknown. */
export function agentColorTintClass(color: string | null): string {
  if (color === null) {
    return NEUTRAL_TINT_CLASS;
  }
  return AGENT_COLOR_TINT_CLASSES[color] ?? NEUTRAL_TINT_CLASS;
}
