import type { ModePreset } from '@harnesys/studio-shared';
import { readModePresets } from '../adapters/mode-presets-fs.adapter.ts';

/**
 * Bootstrap seed: mode presets read from `apps/server/assets/presets/modes/*.json`
 * (home presets shadow by id). Sync file read on every call, no cache.
 */
export function builtinModePresetSeed(): Omit<
  ModePreset,
  'workspaceId' | 'createdAt' | 'updatedAt'
>[] {
  return readModePresets();
}
