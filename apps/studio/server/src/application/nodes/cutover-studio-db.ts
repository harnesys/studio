import { Database } from 'bun:sqlite';
import { cpSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { MachineConfigFileAdapter } from '../../adapters/machine-config/machine-config.file.ts';
import { bootstrap } from '../../adapters/store/sqlite/bootstrap.ts';
import { createSqliteConnection } from '../../adapters/store/sqlite/connection.ts';
import {
  defaultHomePath,
  pluginDataPath,
  pluginInstallPath,
  pluginsPath,
  studioDbBakPath,
  studioDbPath,
  studioDir,
  systemPresetsPath,
  systemSkillsPath,
  workspaceDbPath,
  workspacePluginDataPath,
  workspacePluginInstallPath,
  workspacePluginsPath,
  workspacePresetsPath,
  workspaceSkillsPath,
} from '../../adapters/store/studio-layout.ts';
import { logger } from '../../config/logger.ts';
import type { HostNodeRecord } from '../../domain/machine-config.ts';
import { ValidationError } from '../../domain/studio.error.ts';

export type CutoverResult = {
  migrated: string[];
  skipped: string[];
  bakPath: string | null;
};

/**
 * Stopped-host cutover: copy domain+catalog rows from `~/.harnesys/studio.db`
 * into each node's `<workspace>/.harnesys/workspace.db`, seed FS overlays,
 * rename studio.db → studio.db.bak. Idempotent: existing non-empty workspace.db
 * is skipped.
 */
export function cutoverStudioDb(home: string = defaultHomePath()): CutoverResult {
  const config = new MachineConfigFileAdapter({ home });
  const nodes = config.read().host.nodes;
  if (nodes.length === 0) {
    logger.info({ scope: 'cutover' }, 'host.nodes empty; nothing to migrate');
    return { migrated: [], skipped: [], bakPath: null };
  }

  const legacyPath = studioDbPath(home);
  if (!existsSync(legacyPath)) {
    // Ensure each ready node has a workspace.db identity file even without legacy.
    const migrated: string[] = [];
    const skipped: string[] = [];
    for (const node of nodes) {
      if (hasNonEmptyDb(workspaceDbPath(node.path))) {
        skipped.push(node.id);
        continue;
      }
      ensureIdentityDb(node);
      migrated.push(node.id);
    }
    return { migrated, skipped, bakPath: null };
  }

  const migrated: string[] = [];
  const skipped: string[] = [];

  for (const node of nodes) {
    const dest = workspaceDbPath(node.path);
    if (hasNonEmptyDb(dest)) {
      skipped.push(node.id);
      logger.info({ scope: 'cutover' }, `skip ${node.id}: workspace.db already present`);
      continue;
    }
    migrateNode(legacyPath, home, node);
    migrated.push(node.id);
    logger.info({ scope: 'cutover' }, `migrated ${node.id} → ${dest}`);
  }

  let bakPath: string | null = null;
  if (existsSync(legacyPath)) {
    bakPath = studioDbBakPath(home);
    if (existsSync(bakPath)) {
      throw new ValidationError(
        `refusing to overwrite existing ${bakPath}; remove it or finish manually`,
      );
    }
    renameSync(legacyPath, bakPath);
    logger.info({ scope: 'cutover' }, `renamed ${legacyPath} → ${bakPath}`);
  }

  return { migrated, skipped, bakPath };
}

function migrateNode(legacyPath: string, home: string, node: HostNodeRecord): void {
  mkdirSync(studioDir(node.path), { recursive: true });
  const destPath = workspaceDbPath(node.path);
  bootstrap(createSqliteConnection(destPath));

  const raw = new Database(destPath);
  for (const pragma of ['PRAGMA foreign_keys = ON', 'PRAGMA journal_mode = WAL']) {
    raw.exec(pragma);
  }
  raw.exec(`ATTACH DATABASE '${escapeSql(legacyPath)}' AS legacy;`);
  try {
    copyIdentity(raw, node);
    copyWorkspaceScoped(raw, node.id);
    copyThreadScoped(raw, node.id);
    copyPluginRegistries(raw);
  } finally {
    raw.exec('DETACH DATABASE legacy;');
    raw.close();
  }

  seedSkills(home, node.path);
  seedPresets(home, node.path);
  seedPlugins(home, node, destPath);
}

function copyIdentity(raw: Database, node: HostNodeRecord): void {
  raw.exec(`DELETE FROM workspaces;`);
  const legacy = raw
    .query('SELECT id, name, path, created_at FROM legacy.workspaces WHERE id = ?')
    .get(node.id) as { id: string; name: string; path: string; created_at: string } | null;
  const createdAt = legacy?.created_at ?? new Date().toISOString();
  raw
    .query('INSERT INTO workspaces (id, name, path, created_at) VALUES (?, ?, ?, ?)')
    .run(node.id, node.name, node.path, createdAt);
}

function copyWorkspaceScoped(raw: Database, workspaceId: string): void {
  const tables = [
    'agents',
    'llm_providers',
    'mode_presets',
    'schedules',
    'webhooks',
    'plugins',
    'plugin_approvals',
    'plugin_server_state',
    'agent_pins',
    'semantic_memories',
    'episodic_chunks',
    'knowledge_roots',
    'knowledge_settings',
    'knowledge_files',
    'knowledge_chunks',
    'knowledge_index_state',
  ];
  for (const table of tables) {
    if (!legacyHasTable(raw, table)) {
      continue;
    }
    if (!legacyHasColumn(raw, table, 'workspace_id')) {
      continue;
    }
    raw.exec(
      `INSERT OR IGNORE INTO ${table} SELECT * FROM legacy.${table} WHERE workspace_id = '${escapeSql(workspaceId)}';`,
    );
  }

  // Models follow providers of this node.
  if (legacyHasTable(raw, 'llm_models') && legacyHasTable(raw, 'llm_providers')) {
    raw.exec(
      `INSERT OR IGNORE INTO llm_models
       SELECT m.* FROM legacy.llm_models m
       INNER JOIN legacy.llm_providers p ON p.id = m.provider_id
       WHERE p.workspace_id = '${escapeSql(workspaceId)}';`,
    );
  }
}

function copyThreadScoped(raw: Database, workspaceId: string): void {
  if (!legacyHasTable(raw, 'threads')) {
    return;
  }
  raw.exec(
    `INSERT OR IGNORE INTO threads SELECT * FROM legacy.threads WHERE workspace_id = '${escapeSql(workspaceId)}';`,
  );

  const viaThread = [
    ['snapshots', 'thread_id'],
    ['attachments', 'thread_id'],
    ['runs', 'thread_id'],
    ['run_events', 'thread_id'],
    ['thread_plans', 'thread_id'],
  ] as const;
  for (const [table, col] of viaThread) {
    if (!legacyHasTable(raw, table)) {
      continue;
    }
    raw.exec(
      `INSERT OR IGNORE INTO ${table}
       SELECT t.* FROM legacy.${table} t
       INNER JOIN legacy.threads th ON th.id = t.${col}
       WHERE th.workspace_id = '${escapeSql(workspaceId)}';`,
    );
  }

  if (legacyHasTable(raw, 'thread_plan_items') && legacyHasTable(raw, 'thread_plans')) {
    raw.exec(
      `INSERT OR IGNORE INTO thread_plan_items
       SELECT i.* FROM legacy.thread_plan_items i
       INNER JOIN legacy.thread_plans p ON p.id = i.plan_id
       INNER JOIN legacy.threads th ON th.id = p.thread_id
       WHERE th.workspace_id = '${escapeSql(workspaceId)}';`,
    );
  }
}

function copyPluginRegistries(raw: Database): void {
  if (legacyHasTable(raw, 'plugin_registries')) {
    raw.exec('INSERT OR IGNORE INTO plugin_registries SELECT * FROM legacy.plugin_registries;');
  }
  if (legacyHasTable(raw, 'plugin_catalog_entries')) {
    raw.exec(
      'INSERT OR IGNORE INTO plugin_catalog_entries SELECT * FROM legacy.plugin_catalog_entries;',
    );
  }
}

function seedSkills(home: string, workspacePath: string): void {
  const src = systemSkillsPath(home);
  const dest = workspaceSkillsPath(workspacePath);
  if (!existsSync(src) || !statSync(src).isDirectory()) {
    return;
  }
  copyDirContentsIfEmpty(src, dest);
}

function seedPresets(home: string, workspacePath: string): void {
  for (const sub of ['agents', 'modes'] as const) {
    const src = systemPresetsPath(sub, home);
    const dest = workspacePresetsPath(workspacePath, sub);
    if (!existsSync(src) || !statSync(src).isDirectory()) {
      continue;
    }
    mkdirSync(dest, { recursive: true });
    copyDirContentsIfEmpty(src, dest);
  }
}

function seedPlugins(home: string, node: HostNodeRecord, destDbPath: string): void {
  const hostPlugins = pluginsPath(home);
  if (!existsSync(hostPlugins)) {
    return;
  }
  mkdirSync(workspacePluginsPath(node.path), { recursive: true });

  const db = new Database(destDbPath);
  const rows = db
    .query('SELECT name, path, data_path FROM plugins WHERE workspace_id = ?')
    .all(node.id) as Array<{ name: string; path: string; data_path: string }>;

  for (const row of rows) {
    const name = row.name;
    const srcCheckout = existsSync(row.path) ? row.path : pluginInstallPath(home, name);
    const destCheckout = workspacePluginInstallPath(node.path, name);
    if (existsSync(srcCheckout) && !existsSync(destCheckout)) {
      cpSync(srcCheckout, destCheckout, { recursive: true });
    }
    const srcData = existsSync(row.data_path) ? row.data_path : pluginDataPath(home, name);
    const destData = workspacePluginDataPath(node.path, name);
    if (existsSync(srcData) && !existsSync(destData)) {
      cpSync(srcData, destData, { recursive: true });
    }
    db.query('UPDATE plugins SET path = ?, data_path = ? WHERE workspace_id = ? AND name = ?').run(
      destCheckout,
      destData,
      node.id,
      name,
    );
  }
  db.close();
}

function ensureIdentityDb(node: HostNodeRecord): void {
  const storePath = workspaceDbPath(node.path);
  bootstrap(createSqliteConnection(storePath));
  const raw = new Database(storePath);
  const existing = raw.query('SELECT id FROM workspaces WHERE id = ?').get(node.id);
  if (!existing) {
    raw
      .query('INSERT INTO workspaces (id, name, path, created_at) VALUES (?, ?, ?, ?)')
      .run(node.id, node.name, node.path, new Date().toISOString());
  }
  raw.close();
}

function hasNonEmptyDb(path: string): boolean {
  if (!existsSync(path)) {
    return false;
  }
  try {
    return statSync(path).size > 0;
  } catch {
    return false;
  }
}

function copyDirContentsIfEmpty(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  const entries = Array.from(new Bun.Glob('*').scanSync({ cwd: dest }));
  if (entries.length > 0) {
    return;
  }
  cpSync(src, dest, { recursive: true });
}

function legacyHasTable(raw: Database, name: string): boolean {
  const row = raw
    .query("SELECT name FROM legacy.sqlite_master WHERE type='table' AND name = ?")
    .get(name);
  return row !== null;
}

function legacyHasColumn(raw: Database, table: string, column: string): boolean {
  const rows = raw.query(`PRAGMA legacy.table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function escapeSql(value: string): string {
  return value.replaceAll("'", "''");
}
