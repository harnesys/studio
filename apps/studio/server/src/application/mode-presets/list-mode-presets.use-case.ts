import type { ModePreset } from '@harnesys/studio-shared';
import type { ModePresetRepository } from '../../domain/mode-preset.port.ts';

export type ListModePresetsInput = {
  execute(): Promise<ModePreset[]>;
};

export class ListModePresetsUseCase implements ListModePresetsInput {
  constructor(private readonly presets: ModePresetRepository) {}

  execute(): Promise<ModePreset[]> {
    return Promise.resolve(this.presets.list());
  }
}
