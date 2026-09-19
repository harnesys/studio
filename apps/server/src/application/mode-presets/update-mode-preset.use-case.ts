import type { ModeOpPermissions, ModePreset, PackAssignment } from '@harnesys/studio-shared';
import type { ModePresetPatch, ModePresetRepository } from '../../domain/mode-preset.port.ts';
import { ConflictError, NotFoundError } from '../../domain/studio.error.ts';
export type UpdateModePresetRequest = {
  workspaceId: string;
  id: string;
  name?: string;
  description?: string;
  instructions?: string;
  skills?: string[];
  packs?: Record<string, PackAssignment | null>;
  permissions?: ModeOpPermissions;
  installedByDefault?: boolean;
};
export type UpdateModePresetInput = {
  execute(request: UpdateModePresetRequest): Promise<ModePreset>;
};
export class UpdateModePresetUseCase implements UpdateModePresetInput {
  constructor(private readonly presets: ModePresetRepository) {}
  execute(request: UpdateModePresetRequest): Promise<ModePreset> {
    const current = this.presets.findById(request.workspaceId, request.id);
    if (!current) {
      return Promise.reject(new NotFoundError('mode preset not found'));
    }
    const hasContentEdits =
      request.name !== undefined ||
      request.description !== undefined ||
      request.instructions !== undefined ||
      request.skills !== undefined ||
      request.packs !== undefined ||
      request.permissions !== undefined;
    if (current.builtin && hasContentEdits) {
      return Promise.reject(
        new ConflictError('builtin mode preset: only installedByDefault can change'),
      );
    }
    const patch: ModePresetPatch = { updatedAt: new Date().toISOString() };
    if (request.name !== undefined) {
      patch.name = request.name;
    }
    if (request.description !== undefined) {
      patch.description = request.description;
    }
    if (request.instructions !== undefined) {
      patch.instructions = request.instructions;
    }
    if (request.skills !== undefined) {
      patch.skills = request.skills;
    }
    if (request.packs !== undefined) {
      patch.packs = request.packs;
    }
    if (request.permissions !== undefined) {
      patch.permissions = request.permissions;
    }
    if (request.installedByDefault !== undefined) {
      patch.installedByDefault = request.installedByDefault;
    }
    return Promise.resolve(this.presets.update(request.workspaceId, request.id, patch));
  }
}
