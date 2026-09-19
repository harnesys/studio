import type { ModeOpPermissions, PackAssignment } from '@harnesys/studio-shared';
export type ModePresetDraft = {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  skills?: string[];
  packs?: Record<string, PackAssignment | null>;
  permissions: ModeOpPermissions;
  installedByDefault: boolean;
};
