import type { ModeOpPermissions, ModePreset } from '@harnesys/studio-shared';

export type ModePresetInsert = ModePreset;

export type ModePresetPatch = Partial<{
  name: string;
  description: string;
  instructions: string;
  skills: string[];
  packs: string[];
  permissions: ModeOpPermissions;
  installedByDefault: boolean;
  updatedAt: string;
}>;

export type ModePresetRepository = {
  list(): ModePreset[];
  findById(id: string): ModePreset | undefined;
  insert(rec: ModePresetInsert): ModePreset;
  update(id: string, patch: ModePresetPatch): ModePreset;
  delete(id: string): void;
};
