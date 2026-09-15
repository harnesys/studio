import type { ModeOpPermissions, ModePreset, PackAssignment } from '@harnesys/studio-shared';
import { eq } from 'drizzle-orm';
import type {
  ModePresetInsert,
  ModePresetPatch,
  ModePresetRepository,
} from '../../../../domain/mode-preset.port.ts';
import { NotFoundError } from '../../../../domain/studio.error.ts';
import type { StudioDb } from '../connection.ts';
import { mapSqliteError } from '../errors.ts';
import { type ModePresetRow, modePresetsTable } from '../schema';

export class SqliteModePresetRepo implements ModePresetRepository {
  constructor(private readonly db: StudioDb) {}

  list(): ModePreset[] {
    return this.db.select().from(modePresetsTable).all().map(toPreset);
  }

  findById(id: string): ModePreset | undefined {
    const row = this.db.select().from(modePresetsTable).where(eq(modePresetsTable.id, id)).get();
    return row ? toPreset(row) : undefined;
  }

  insert(rec: ModePresetInsert): ModePreset {
    try {
      const { skills, packs, permissions, ...rest } = rec;
      const row = this.db
        .insert(modePresetsTable)
        .values({
          ...rest,
          skillsJson: JSON.stringify(skills ?? []),
          packsJson: JSON.stringify(packs ?? {}),
          permissionsJson: JSON.stringify(permissions ?? {}),
        })
        .returning()
        .get();
      return toPreset(row);
    } catch (err) {
      return mapSqliteError(err, { conflict: 'mode preset id taken' });
    }
  }

  update(id: string, patch: ModePresetPatch): ModePreset {
    try {
      const { skills, packs, permissions, ...rest } = patch;
      const row = this.db
        .update(modePresetsTable)
        .set({
          ...rest,
          ...(skills !== undefined ? { skillsJson: JSON.stringify(skills) } : {}),
          ...(packs !== undefined ? { packsJson: JSON.stringify(packs) } : {}),
          ...(permissions !== undefined ? { permissionsJson: JSON.stringify(permissions) } : {}),
        })
        .where(eq(modePresetsTable.id, id))
        .returning()
        .get();
      if (!row) {
        throw new NotFoundError('mode preset not found');
      }
      return toPreset(row);
    } catch (err) {
      return mapSqliteError(err);
    }
  }

  delete(id: string): void {
    this.db.delete(modePresetsTable).where(eq(modePresetsTable.id, id)).run();
  }
}

function toPreset(row: ModePresetRow): ModePreset {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    skills: parseStringList(row.skillsJson),
    packs: parsePackMap(row.packsJson),
    permissions: parsePermissions(row.permissionsJson),
    builtin: row.builtin,
    installedByDefault: row.installedByDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Map-форма (`capability_set_v1`); legacy-массив или мусор → пустая карта. */
function parsePackMap(raw: string): Record<string, PackAssignment | null> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, PackAssignment | null>;
  } catch {
    return {};
  }
}

function parseStringList(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function parsePermissions(raw: string): ModeOpPermissions {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as ModeOpPermissions;
  } catch {
    return {};
  }
}
