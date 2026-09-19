import { builtinModePresetSeed } from '../../../config/mode-preset-seed.ts';
import type { StudioDb } from './connection.ts';
import { modePresetsTable } from './schema/mode-presets.ts';
export function seedWorkspaceModePresets(db: StudioDb, workspaceId: string): void {
  const now = new Date().toISOString();
  for (const seed of builtinModePresetSeed()) {
    db.insert(modePresetsTable)
      .values({
        workspaceId,
        ...seed,
        skillsJson: JSON.stringify(seed.skills ?? []),
        packsJson: JSON.stringify(seed.packs ?? {}),
        permissionsJson: JSON.stringify(seed.permissions ?? {}),
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .run();
  }
}
