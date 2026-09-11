import { eq } from 'drizzle-orm';
import type { PluginName } from 'harnesys';
import type { PluginInstallRecord, PluginRepository } from '../../../../domain/plugin.port.ts';
import { NotFoundError } from '../../../../domain/studio.error.ts';
import type { StudioDb } from '../connection.ts';
import { mapSqliteError } from '../errors.ts';
import { type PluginRow, pluginsTable } from '../schema';

export class SqlitePluginsAdapter implements PluginRepository {
  constructor(private readonly db: StudioDb) {}

  list(): PluginInstallRecord[] {
    return this.db.select().from(pluginsTable).orderBy(pluginsTable.name).all().map(toRecord);
  }

  findByName(name: PluginName): PluginInstallRecord | undefined {
    const row = this.db.select().from(pluginsTable).where(eq(pluginsTable.name, name)).get();
    return row ? toRecord(row) : undefined;
  }

  upsert(rec: PluginInstallRecord): PluginInstallRecord {
    try {
      const enabledWorkspaceIds = JSON.stringify(rec.enabledWorkspaceIds);
      const row = this.db
        .insert(pluginsTable)
        .values({
          id: rec.name,
          name: rec.name,
          source: rec.source,
          revision: rec.revision,
          path: rec.path,
          dataPath: rec.dataPath,
          trusted: rec.trusted,
          enabledWorkspaceIds,
          registryId: rec.registryId ?? null,
          catalogPluginName: rec.catalogPluginName ?? null,
          installedAt: rec.installedAt,
          updatedAt: rec.updatedAt,
        })
        .onConflictDoUpdate({
          target: pluginsTable.id,
          set: {
            source: rec.source,
            revision: rec.revision,
            path: rec.path,
            dataPath: rec.dataPath,
            trusted: rec.trusted,
            enabledWorkspaceIds,
            registryId: rec.registryId ?? null,
            catalogPluginName: rec.catalogPluginName ?? null,
            updatedAt: rec.updatedAt,
          },
        })
        .returning()
        .get();
      return toRecord(row);
    } catch (err) {
      return mapSqliteError(err, { conflict: 'plugin exists' });
    }
  }

  delete(name: PluginName): void {
    this.db.delete(pluginsTable).where(eq(pluginsTable.name, name)).run();
  }

  setTrusted(name: PluginName, trusted: boolean): PluginInstallRecord {
    try {
      const row = this.db
        .update(pluginsTable)
        .set({ trusted, updatedAt: new Date().toISOString() })
        .where(eq(pluginsTable.name, name))
        .returning()
        .get();
      if (!row) {
        throw new NotFoundError('plugin not found');
      }
      return toRecord(row);
    } catch (err) {
      return mapSqliteError(err, { notFound: 'plugin not found' });
    }
  }

  setWorkspaceEnabled(
    name: PluginName,
    workspaceId: string,
    enabled: boolean,
  ): PluginInstallRecord {
    const current = this.findByName(name);
    if (!current) {
      throw new NotFoundError('plugin not found');
    }
    const enabledWorkspaceIds = nextEnabledWorkspaceIds(
      current.enabledWorkspaceIds,
      workspaceId,
      enabled,
    );
    try {
      const row = this.db
        .update(pluginsTable)
        .set({
          enabledWorkspaceIds: JSON.stringify(enabledWorkspaceIds),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(pluginsTable.name, name))
        .returning()
        .get();
      if (!row) {
        throw new NotFoundError('plugin not found');
      }
      return toRecord(row);
    } catch (err) {
      return mapSqliteError(err, { notFound: 'plugin not found' });
    }
  }
}

function nextEnabledWorkspaceIds(ids: string[], workspaceId: string, enabled: boolean): string[] {
  if (enabled) {
    return ids.includes(workspaceId) ? ids : [...ids, workspaceId];
  }
  return ids.filter((id) => id !== workspaceId);
}

function parseEnabledWorkspaceIds(raw: string): string[] {
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

function toRecord(row: PluginRow): PluginInstallRecord {
  const record: PluginInstallRecord = {
    name: row.name,
    source: row.source,
    revision: row.revision,
    path: row.path,
    dataPath: row.dataPath,
    trusted: row.trusted,
    enabledWorkspaceIds: parseEnabledWorkspaceIds(row.enabledWorkspaceIds),
    installedAt: row.installedAt,
    updatedAt: row.updatedAt,
  };
  if (row.registryId) {
    record.registryId = row.registryId;
  }
  if (row.catalogPluginName) {
    record.catalogPluginName = row.catalogPluginName;
  }
  return record;
}
