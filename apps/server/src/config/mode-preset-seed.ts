import type { ModePreset } from '@harnesys/studio-shared';
import { readModePresets } from '../adapters/mode-presets-fs.adapter.ts';
export function builtinModePresetSeed(): Omit<
  ModePreset,
  'workspaceId' | 'createdAt' | 'updatedAt'
>[] {
  return readModePresets();
}
