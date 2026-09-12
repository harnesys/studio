import type { ModeOpPermissions, ModePreset } from '@harnesys/studio-shared';
import type { ModePresetInsert, ModePresetRepository } from '../../domain/mode-preset.port.ts';
import { ConflictError } from '../../domain/studio.error.ts';

export type CreateModePresetRequest = {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  skills?: string[];
  packs?: string[];
  permissions?: ModeOpPermissions;
  installedByDefault?: boolean;
};

export type CreateModePresetInput = {
  execute(request: CreateModePresetRequest): Promise<ModePreset>;
};

export class CreateModePresetUseCase implements CreateModePresetInput {
  constructor(private readonly presets: ModePresetRepository) {}

  execute(request: CreateModePresetRequest): Promise<ModePreset> {
    if (this.presets.findById(request.id)) {
      return Promise.reject(new ConflictError('mode preset id taken'));
    }
    const now = new Date().toISOString();
    const rec: ModePresetInsert = {
      id: request.id,
      name: request.name,
      description: request.description ?? '',
      instructions: request.instructions ?? '',
      skills: request.skills ?? [],
      packs: request.packs ?? [],
      permissions: request.permissions ?? {},
      builtin: false,
      installedByDefault: request.installedByDefault ?? false,
      createdAt: now,
      updatedAt: now,
    };
    return Promise.resolve(this.presets.insert(rec));
  }
}
