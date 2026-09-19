import type { ModePreset } from '@harnesys/studio-shared';
import type { ModePresetRepository } from '../../domain/mode-preset.port.ts';

export type ListModePresetsRequest = {
  workspaceId: string;
};

export type ListModePresetsInput = {
  execute(request: ListModePresetsRequest): Promise<ModePreset[]>;
};

export class ListModePresetsUseCase implements ListModePresetsInput {
  constructor(private readonly presets: ModePresetRepository) {}

  execute(request: ListModePresetsRequest): Promise<ModePreset[]> {
    return Promise.resolve(this.presets.list(request.workspaceId));
  }
}
