import type { ModeOpPermissions, PackAssignment } from '@harnesys/studio-shared';

/** ModePresetEditor output; absent optional fields stay out of the API body. */
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
