import type { GrantClass, PluginName } from '@harnesys/studio-shared';
import { and, eq } from 'drizzle-orm';
import type {
  PluginGrants,
  PluginInstallFormat,
  PluginInstallRecord,
  PluginOptionValue,
  PluginRepository,
  PluginServerDisable,
} from '../../../../domain/plugin.port.ts';
import { NotFoundError } from '../../../../domain/studio.error.ts';
import type { StudioDb } from '../connection.ts';
import { mapSqliteError } from '../errors.ts';
import {
  type PluginRow,
  pluginApprovalsTable,
  pluginServerStateTable,
  pluginsTable,
} from '../schema';

export class SqlitePluginsAdapter implements PluginRepository {
  constructor(private readonly db: StudioDb) {}

  list(workspaceId: string): PluginInstallRecord[] {
    return this.db
      .select()
      .from(pluginsTable)
      .where(eq(pluginsTable.workspaceId, workspaceId))
      .orderBy(pluginsTable.name)
      .all()
      .map(toRecord);
  }

  listAll(): PluginInstallRecord[] {
    return this.db.select().from(pluginsTable).orderBy(pluginsTable.name).all().map(toRecord);
  }

  findByName(workspaceId: string, name: PluginName): PluginInstallRecord | undefined {
    const row = this.db
      .select()
      .from(pluginsTable)
      .where(and(eq(pluginsTable.workspaceId, workspaceId), eq(pluginsTable.name, name)))
      .get();
    return row ? toRecord(row) : undefined;
  }

  findByNameAny(name: PluginName): PluginInstallRecord | undefined {
    const row = this.db.select().from(pluginsTable).where(eq(pluginsTable.name, name)).get();
    return row ? toRecord(row) : undefined;
  }

  upsert(rec: PluginInstallRecord): PluginInstallRecord {
    try {
      const id = pluginRowId(rec.workspaceId, rec.name);
      const values = {
        ...toRow(rec),
        id,
        workspaceId: rec.workspaceId,
        name: rec.name,
        installedAt: rec.installedAt,
      };
      const row = this.db
        .insert(pluginsTable)
        .values(values)
        .onConflictDoUpdate({
          target: pluginsTable.id,
          set: values,
        })
        .returning()
        .get();
      return toRecord(row);
    } catch (err) {
      return mapSqliteError(err, { conflict: 'plugin exists' });
    }
  }

  delete(workspaceId: string, name: PluginName): void {
    this.db
      .delete(pluginsTable)
      .where(and(eq(pluginsTable.workspaceId, workspaceId), eq(pluginsTable.name, name)))
      .run();
    this.db
      .delete(pluginApprovalsTable)
      .where(
        and(
          eq(pluginApprovalsTable.workspaceId, workspaceId),
          eq(pluginApprovalsTable.pluginName, name),
        ),
      )
      .run();
    this.db
      .delete(pluginServerStateTable)
      .where(
        and(
          eq(pluginServerStateTable.pluginName, name),
          eq(pluginServerStateTable.workspaceId, workspaceId),
        ),
      )
      .run();
  }

  setServerDisabled(
    name: PluginName,
    serverId: string,
    workspaceId: string,
    disabled: boolean,
  ): void {
    if (disabled) {
      this.db
        .insert(pluginServerStateTable)
        .values({
          pluginName: name,
          serverId,
          workspaceId,
          disabledAt: new Date().toISOString(),
        })
        .onConflictDoNothing()
        .run();
      return;
    }
    this.db
      .delete(pluginServerStateTable)
      .where(
        and(
          eq(pluginServerStateTable.pluginName, name),
          eq(pluginServerStateTable.serverId, serverId),
          eq(pluginServerStateTable.workspaceId, workspaceId),
        ),
      )
      .run();
  }

  isServerDisabled(name: PluginName, serverId: string, workspaceId: string): boolean {
    const row = this.db
      .select({ serverId: pluginServerStateTable.serverId })
      .from(pluginServerStateTable)
      .where(
        and(
          eq(pluginServerStateTable.pluginName, name),
          eq(pluginServerStateTable.serverId, serverId),
          eq(pluginServerStateTable.workspaceId, workspaceId),
        ),
      )
      .get();
    return row !== undefined;
  }

  listDisabledServers(workspaceId: string): PluginServerDisable[] {
    return this.db
      .select({
        pluginName: pluginServerStateTable.pluginName,
        serverId: pluginServerStateTable.serverId,
      })
      .from(pluginServerStateTable)
      .where(eq(pluginServerStateTable.workspaceId, workspaceId))
      .all();
  }

  setGrants(workspaceId: string, name: PluginName, classes: GrantClass[]): PluginInstallRecord {
    const current = this.findByName(workspaceId, name);
    if (!current) {
      throw new NotFoundError('plugin not found');
    }
    const grants: PluginGrants = {};
    for (const grantClass of classes) {
      grants[grantClass] = true;
    }
    return this.updateRow(workspaceId, name, { grants: JSON.stringify(grants) });
  }

  setOption(
    workspaceId: string,
    name: PluginName,
    key: string,
    value: PluginOptionValue,
  ): PluginInstallRecord {
    const current = this.findByName(workspaceId, name);
    if (!current) {
      throw new NotFoundError('plugin not found');
    }
    const options: Record<string, PluginOptionValue> = { ...current.options, [key]: value };
    return this.updateRow(workspaceId, name, { options: JSON.stringify(options) });
  }

  approveServer(workspaceId: string, name: PluginName, serverId: string): void {
    this.db
      .insert(pluginApprovalsTable)
      .values({
        workspaceId,
        pluginName: name,
        serverId,
        approvedAt: new Date().toISOString(),
      })
      .onConflictDoNothing()
      .run();
  }

  approvals(workspaceId: string, name: PluginName): string[] {
    return this.db
      .select({ serverId: pluginApprovalsTable.serverId })
      .from(pluginApprovalsTable)
      .where(
        and(
          eq(pluginApprovalsTable.workspaceId, workspaceId),
          eq(pluginApprovalsTable.pluginName, name),
        ),
      )
      .all()
      .map((row) => row.serverId);
  }

  private updateRow(
    workspaceId: string,
    name: PluginName,
    patch: Partial<typeof pluginsTable.$inferInsert>,
  ): PluginInstallRecord {
    try {
      const row = this.db
        .update(pluginsTable)
        .set({ ...patch, updatedAt: new Date().toISOString() })
        .where(and(eq(pluginsTable.workspaceId, workspaceId), eq(pluginsTable.name, name)))
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

export function pluginRowId(workspaceId: string, name: string): string {
  return `${workspaceId}::${name}`;
}

function toRow(rec: PluginInstallRecord) {
  return {
    source: rec.source,
    revision: rec.revision,
    path: rec.path,
    dataPath: rec.dataPath,
    format: rec.format,
    grants: JSON.stringify(rec.grants),
    options: JSON.stringify(rec.options),
    registryId: rec.registryId ?? null,
    catalogPluginName: rec.catalogPluginName ?? null,
    updatedAt: rec.updatedAt,
  };
}

function toMap(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function parseJsonMap(raw: string): Record<string, unknown> {
  try {
    return toMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

function parseFormat(raw: string | null): PluginInstallFormat {
  return raw === 'agent-plugins' || raw === 'claude-compat' ? raw : 'unknown';
}

function toRecord(row: PluginRow): PluginInstallRecord {
  const record: PluginInstallRecord = {
    workspaceId: row.workspaceId,
    name: row.name,
    source: row.source,
    revision: row.revision,
    path: row.path,
    dataPath: row.dataPath,
    format: parseFormat(row.format),
    grants: parseGrants(row.grants),
    options: parseOptions(row.options),
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

function parseGrants(raw: string): PluginGrants {
  const parsed = parseJsonMap(raw);
  const grants: PluginGrants = {};
  for (const [grantClass, enabled] of Object.entries(parsed)) {
    if (typeof enabled === 'boolean') {
      grants[grantClass as GrantClass] = enabled;
    }
  }
  return grants;
}

function parseOptions(raw: string): Record<string, PluginOptionValue> {
  const parsed = parseJsonMap(raw);
  const options: Record<string, PluginOptionValue> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      options[key] = value;
    }
  }
  return options;
}
