import type { RunMode } from '@studio/shared';
import {
  BanIcon,
  ClipboardListIcon,
  HandIcon,
  type LucideIcon,
  ShieldAlertIcon,
  ShieldIcon,
} from 'lucide-react';

export type ComposerMode = RunMode;

/** Modes accepted by POST /runs, including UI-owned `plan`. */
export type RunnableComposerMode = RunMode;

export type ComposerModeItem = {
  value: ComposerMode;
  label: string;
  detail: string;
  icon: LucideIcon;
  disabled?: boolean;
};

export const COMPOSER_MODES: readonly ComposerModeItem[] = [
  {
    value: 'ask',
    label: 'Ask before changes',
    detail: 'Ask before file changes.',
    icon: HandIcon,
  },
  {
    value: 'auto',
    label: 'Edit automatically',
    detail: 'Edit files automatically.',
    icon: ShieldIcon,
  },
  {
    value: 'plan',
    label: 'Plan mode',
    detail: 'Research → propose → Approve/Revise → Apply (Edit automatically). No writes or shell.',
    icon: ClipboardListIcon,
  },
  {
    value: 'dont_ask',
    label: "Don't ask",
    detail: 'Auto-deny instead of pausing.',
    icon: BanIcon,
  },
  {
    value: 'bypass',
    label: 'Bypass',
    detail: 'Run without confirmations.',
    icon: ShieldAlertIcon,
  },
] as const;

export function isComposerMode(value: string): value is ComposerMode {
  return COMPOSER_MODES.some((item) => item.value === value);
}

export function runnableMode(mode: ComposerMode): RunnableComposerMode {
  return mode;
}
