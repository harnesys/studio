import type { ModeOpPermissions, ModePreset, PackAssignment } from '@harnesys/studio-shared';

export type ModePresetInsert = ModePreset;

export type ModePresetPatch = Partial<{
  name: string;
  description: string;
  instructions: string;
  skills: string[];
  packs: Record<string, PackAssignment | null>;
  permissions: ModeOpPermissions;
  installedByDefault: boolean;
  updatedAt: string;
}>;

export type ModePresetRepository = {
  list(workspaceId: string): ModePreset[];
  findById(workspaceId: string, id: string): ModePreset | undefined;
  insert(rec: ModePresetInsert): ModePreset;
  update(workspaceId: string, id: string, patch: ModePresetPatch): ModePreset;
  delete(workspaceId: string, id: string): void;
};
