import type { ModePresetRepository } from '../../domain/mode-preset.port.ts';
import { ConflictError, NotFoundError } from '../../domain/studio.error.ts';

export type DeleteModePresetRequest = {
  id: string;
};

export type DeleteModePresetInput = {
  execute(request: DeleteModePresetRequest): Promise<void>;
};

export class DeleteModePresetUseCase implements DeleteModePresetInput {
  constructor(private readonly presets: ModePresetRepository) {}

  execute(request: DeleteModePresetRequest): Promise<void> {
    const current = this.presets.findById(request.id);
    if (!current) {
      return Promise.reject(new NotFoundError('mode preset not found'));
    }
    if (current.builtin) {
      return Promise.reject(new ConflictError('builtin mode preset cannot be deleted'));
    }
    this.presets.delete(request.id);
    return Promise.resolve();
  }
}
