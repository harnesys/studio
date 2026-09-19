import { sql } from 'drizzle-orm';
import { builtinModePresetSeed } from '../../../config/mode-preset-seed.ts';
import type { StudioDb } from './connection.ts';
export function seedLegacyModePresetsIfUnscoped(db: StudioDb): void {
  const cols = db.all<{
    name: string;
  }>(sql.raw('PRAGMA table_info(mode_presets)'));
  const hasWorkspaceId = cols.some((col) => col.name === 'workspace_id');
  if (hasWorkspaceId) {
    const unscoped = db.all<{
      n: number;
    }>(sql`SELECT COUNT(*) AS n FROM mode_presets WHERE workspace_id IS NULL OR workspace_id = ''`);
    const scoped = db.all<{
      n: number;
    }>(
      sql`SELECT COUNT(*) AS n FROM mode_presets WHERE workspace_id IS NOT NULL AND workspace_id != ''`,
    );
    if ((unscoped[0]?.n ?? 0) === 0 || (scoped[0]?.n ?? 0) > 0) {
      return;
    }
  }
  const now = new Date().toISOString();
  for (const seed of builtinModePresetSeed()) {
    try {
      if (hasWorkspaceId) {
        db.run(sql`INSERT OR IGNORE INTO mode_presets (
            id, name, description, instructions, skills_json, packs_json, permissions_json,
            builtin, installed_by_default, created_at, updated_at, workspace_id
          ) VALUES (
            ${seed.id}, ${seed.name}, ${seed.description ?? ''}, ${seed.instructions ?? ''},
            ${JSON.stringify(seed.skills ?? [])}, ${JSON.stringify(seed.packs ?? {})},
            ${JSON.stringify(seed.permissions ?? {})}, ${seed.builtin ? 1 : 0},
            ${seed.installedByDefault ? 1 : 0}, ${now}, ${now}, NULL
          )`);
      } else {
        db.run(sql`INSERT OR IGNORE INTO mode_presets (
            id, name, description, instructions, skills_json, packs_json, permissions_json,
            builtin, installed_by_default, created_at, updated_at
          ) VALUES (
            ${seed.id}, ${seed.name}, ${seed.description ?? ''}, ${seed.instructions ?? ''},
            ${JSON.stringify(seed.skills ?? [])}, ${JSON.stringify(seed.packs ?? {})},
            ${JSON.stringify(seed.permissions ?? {})}, ${seed.builtin ? 1 : 0},
            ${seed.installedByDefault ? 1 : 0}, ${now}, ${now}
          )`);
      }
    } catch {}
  }
}
