import type { ModeOpPermissions } from '@harnesys/studio-shared';

/** ModePresetDialog output; absent optional fields stay out of the API body. */
export type ModePresetDraft = {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  skills?: string[];
  packs?: string[];
  permissions: ModeOpPermissions;
  installedByDefault: boolean;
};
