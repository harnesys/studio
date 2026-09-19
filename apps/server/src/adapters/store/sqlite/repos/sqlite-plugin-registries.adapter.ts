import { and, eq, like, or } from 'drizzle-orm';
import type { CatalogEntry, RegistryKind } from 'harnesys/plugins-catalog';
import type {
  PluginRegistryRecord,
  PluginRegistryRepository,
} from '../../../../domain/plugin-registry.port.ts';
import type { StudioDb } from '../connection.ts';
import { mapSqliteError } from '../errors.ts';
import {
  type PluginCatalogEntryRow,
  type PluginRegistryRow,
  pluginCatalogEntriesTable,
  pluginRegistriesTable,
} from '../schema';
export class SqlitePluginRegistriesAdapter implements PluginRegistryRepository {
  constructor(private readonly db: StudioDb) {}
  list(): PluginRegistryRecord[] {
    return this.db
      .select()
      .from(pluginRegistriesTable)
      .orderBy(pluginRegistriesTable.name)
      .all()
      .map(toRegistryRecord);
  }
  findById(id: string): PluginRegistryRecord | undefined {
    const row = this.db
      .select()
      .from(pluginRegistriesTable)
      .where(eq(pluginRegistriesTable.id, id))
      .get();
    return row ? toRegistryRecord(row) : undefined;
  }
  findByName(name: string): PluginRegistryRecord | undefined {
    const row = this.db
      .select()
      .from(pluginRegistriesTable)
      .where(eq(pluginRegistriesTable.name, name))
      .get();
    return row ? toRegistryRecord(row) : undefined;
  }
  upsert(rec: PluginRegistryRecord): PluginRegistryRecord {
    try {
      const row = this.db
        .insert(pluginRegistriesTable)
        .values({
          id: rec.id,
          name: rec.name,
          kind: rec.kind,
          source: rec.source,
          path: rec.path,
          revision: rec.revision ?? null,
          lastSyncAt: rec.lastSyncAt ?? null,
          lastError: rec.lastError ?? null,
          createdAt: rec.createdAt,
          updatedAt: rec.updatedAt,
        })
        .onConflictDoUpdate({
          target: pluginRegistriesTable.id,
          set: {
            name: rec.name,
            kind: rec.kind,
            source: rec.source,
            path: rec.path,
            revision: rec.revision ?? null,
            lastSyncAt: rec.lastSyncAt ?? null,
            lastError: rec.lastError ?? null,
            updatedAt: rec.updatedAt,
          },
        })
        .returning()
        .get();
      return toRegistryRecord(row);
    } catch (err) {
      return mapSqliteError(err, { conflict: 'plugin registry exists' });
    }
  }
  delete(id: string): void {
    this.db
      .delete(pluginCatalogEntriesTable)
      .where(eq(pluginCatalogEntriesTable.registryId, id))
      .run();
    this.db.delete(pluginRegistriesTable).where(eq(pluginRegistriesTable.id, id)).run();
  }
  replaceCatalog(registryId: string, entries: CatalogEntry[]): void {
    const now = new Date().toISOString();
    this.db
      .delete(pluginCatalogEntriesTable)
      .where(eq(pluginCatalogEntriesTable.registryId, registryId))
      .run();
    for (const entry of entries) {
      this.db
        .insert(pluginCatalogEntriesTable)
        .values({
          id: `${registryId}:${entry.pluginName}`,
          registryId,
          pluginName: entry.pluginName,
          payload: JSON.stringify({ ...entry, registryId }),
          updatedAt: now,
        })
        .run();
    }
  }
  listCatalog(filter: { registryId?: string; q?: string } = {}): CatalogEntry[] {
    const conditions = [];
    if (filter.registryId) {
      conditions.push(eq(pluginCatalogEntriesTable.registryId, filter.registryId));
    }
    if (filter.q && filter.q.trim().length > 0) {
      const pattern = `%${filter.q.trim().toLowerCase()}%`;
      conditions.push(
        or(
          like(pluginCatalogEntriesTable.pluginName, pattern),
          like(pluginCatalogEntriesTable.payload, pattern),
        ),
      );
    }
    let rows: PluginCatalogEntryRow[];
    if (conditions.length === 0) {
      rows = this.db.select().from(pluginCatalogEntriesTable).all();
    } else if (conditions.length === 1) {
      const only = conditions[0];
      rows =
        only === undefined
          ? this.db.select().from(pluginCatalogEntriesTable).all()
          : this.db.select().from(pluginCatalogEntriesTable).where(only).all();
    } else {
      rows = this.db
        .select()
        .from(pluginCatalogEntriesTable)
        .where(and(...conditions))
        .all();
    }
    return rows
      .map(toCatalogEntry)
      .filter((entry): entry is CatalogEntry => entry !== undefined)
      .sort((a, b) => a.pluginName.localeCompare(b.pluginName));
  }
  findCatalogEntry(registryId: string, pluginName: string): CatalogEntry | undefined {
    const row = this.db
      .select()
      .from(pluginCatalogEntriesTable)
      .where(
        and(
          eq(pluginCatalogEntriesTable.registryId, registryId),
          eq(pluginCatalogEntriesTable.pluginName, pluginName),
        ),
      )
      .get();
    return row ? toCatalogEntry(row) : undefined;
  }
}
function toRegistryRecord(row: PluginRegistryRow): PluginRegistryRecord {
  const record: PluginRegistryRecord = {
    id: row.id,
    name: row.name,
    kind: row.kind as RegistryKind,
    source: row.source,
    path: row.path,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.revision) {
    record.revision = row.revision;
  }
  if (row.lastSyncAt) {
    record.lastSyncAt = row.lastSyncAt;
  }
  if (row.lastError) {
    record.lastError = row.lastError;
  }
  return record;
}
function toCatalogEntry(row: PluginCatalogEntryRow): CatalogEntry | undefined {
  try {
    const parsed: unknown = JSON.parse(row.payload);
    if (typeof parsed !== 'object' || parsed === null) {
      return undefined;
    }
    return parsed as CatalogEntry;
  } catch {
    return undefined;
  }
}
