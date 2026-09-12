import type { GrantClass, PluginName } from '@harnesys/studio-shared';
import { eq } from 'drizzle-orm';
import type {
  PluginGrants,
  PluginInstallFormat,
  PluginInstallRecord,
  PluginOptionValue,
  PluginRepository,
} from '../../../../domain/plugin.port.ts';
import { NotFoundError } from '../../../../domain/studio.error.ts';
import type { StudioDb } from '../connection.ts';
import { mapSqliteError } from '../errors.ts';
import { type PluginRow, pluginApprovalsTable, pluginsTable } from '../schema';

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
      const values = {
        ...toRow(rec),
        id: rec.name,
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

  delete(name: PluginName): void {
    this.db.delete(pluginsTable).where(eq(pluginsTable.name, name)).run();
    this.db.delete(pluginApprovalsTable).where(eq(pluginApprovalsTable.pluginName, name)).run();
  }

  setGrants(workspaceId: string, name: PluginName, classes: GrantClass[]): PluginInstallRecord {
    const current = this.findByName(name);
    if (!current) {
      throw new NotFoundError('plugin not found');
    }
    const grants: PluginGrants = {};
    for (const grantClass of classes) {
      grants[grantClass] = true;
    }
    const next: Record<string, PluginGrants> = { ...current.grants, [workspaceId]: grants };
    return this.updateRow(name, { grants: JSON.stringify(next) });
  }

  setOption(name: PluginName, key: string, value: PluginOptionValue): PluginInstallRecord {
    const current = this.findByName(name);
    if (!current) {
      throw new NotFoundError('plugin not found');
    }
    const options: Record<string, PluginOptionValue> = { ...current.options, [key]: value };
    return this.updateRow(name, { options: JSON.stringify(options) });
  }

  approveServer(name: PluginName, serverId: string): void {
    this.db
      .insert(pluginApprovalsTable)
      .values({ pluginName: name, serverId, approvedAt: new Date().toISOString() })
      .onConflictDoNothing()
      .run();
  }

  approvals(name: PluginName): string[] {
    return this.db
      .select({ serverId: pluginApprovalsTable.serverId })
      .from(pluginApprovalsTable)
      .where(eq(pluginApprovalsTable.pluginName, name))
      .all()
      .map((row) => row.serverId);
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
    return this.updateRow(name, {
      enabledWorkspaceIds: JSON.stringify(enabledWorkspaceIds),
    });
  }

  private updateRow(
    name: PluginName,
    patch: Partial<typeof pluginsTable.$inferInsert>,
  ): PluginInstallRecord {
    try {
      const row = this.db
        .update(pluginsTable)
        .set({ ...patch, updatedAt: new Date().toISOString() })
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

function toRow(rec: PluginInstallRecord) {
  return {
    source: rec.source,
    revision: rec.revision,
    path: rec.path,
    dataPath: rec.dataPath,
    format: rec.format,
    grants: JSON.stringify(rec.grants),
    options: JSON.stringify(rec.options),
    enabledWorkspaceIds: JSON.stringify(rec.enabledWorkspaceIds),
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
    name: row.name,
    source: row.source,
    revision: row.revision,
    path: row.path,
    dataPath: row.dataPath,
    format: parseFormat(row.format),
    grants: parseGrants(row.grants),
    options: parseOptions(row.options),
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

function parseGrants(raw: string): Record<string, PluginGrants> {
  const parsed = parseJsonMap(raw);
  const grants: Record<string, PluginGrants> = {};
  for (const [workspaceId, value] of Object.entries(parsed)) {
    const classes: PluginGrants = {};
    for (const [grantClass, enabled] of Object.entries(toMap(value))) {
      if (typeof enabled === 'boolean') {
        classes[grantClass as GrantClass] = enabled;
      }
    }
    grants[workspaceId] = classes;
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
