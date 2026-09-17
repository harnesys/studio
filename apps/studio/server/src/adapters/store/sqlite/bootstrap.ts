import { ASK_MODE, DEFAULT_MODE_ID, modeFromPreset } from '@harnesys/studio-shared';
import { eq, sql } from 'drizzle-orm';
import { backfillAgentsModeGates } from './bootstrap-agents-gate-migration.ts';
import { migrateCapabilityCore } from './bootstrap-capability-core-migration.ts';
import { migrateCapabilitySet } from './bootstrap-capability-set-migration.ts';
import { bootstrapMemory } from './bootstrap-memory.ts';
import { cleanupReservedModeIds } from './bootstrap-modes-cleanup.ts';
import { migrateNodeCatalogPresets } from './bootstrap-node-catalog-presets-migration.ts';
import { migrateNodeCatalogProviders } from './bootstrap-node-catalog-providers-migration.ts';
import type { StudioDb } from './connection.ts';
import { migratePluginGrantsSchema } from './plugins-migration.ts';
import { SqliteModePresetRepo } from './repos/sqlite-mode-preset.repo.ts';
import { agentsTable } from './schema/agents.ts';
import { seedLegacyModePresetsIfUnscoped } from './seed-legacy-mode-presets.ts';

export function bootstrap(db: StudioDb): void {
  // Drop journal tables (0.5.0 cutover)
  for (const table of ['journal_steps', 'journal_entries', 'events']) {
    try {
      db.run(sql.raw(`DROP TABLE IF EXISTS ${table};`));
    } catch {}
  }

  const statements = [
    `CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      model_id TEXT,
      role TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      effort TEXT,
      generation TEXT,
      skills TEXT NOT NULL DEFAULT '[]',
      mcp_servers TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS llm_providers (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      driver TEXT NOT NULL,
      api_url TEXT,
      api_key TEXT,
      headers TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS llm_providers_workspace_id_name_unique
      ON llm_providers(workspace_id, name);`,
    `CREATE TABLE IF NOT EXISTS llm_models (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL REFERENCES llm_providers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
      origin_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
      title TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'chat',
      parent_thread_id TEXT REFERENCES threads(id) ON DELETE SET NULL,
      fork_at TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_read_at TEXT NOT NULL,
      CHECK(kind IN ('chat', 'schedule', 'webhook'))
    );`,
    `CREATE TABLE IF NOT EXISTS snapshots (
      session_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      snapshot TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      entry_id TEXT,
      name TEXT NOT NULL,
      media_type TEXT NOT NULL,
      path TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      target_agent_id TEXT NOT NULL REFERENCES agents(id),
      detail TEXT NOT NULL DEFAULT '',
      cron TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'auto',
      history TEXT NOT NULL DEFAULT 'none',
      history_last INTEGER NOT NULL DEFAULT 1,
      thread_id TEXT NOT NULL REFERENCES threads(id),
      next_run_at TEXT,
      last_fired_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK(status IN ('active', 'paused', 'failed')),
      CHECK(mode IN ('ask', 'auto', 'dont_ask', 'bypass')),
      CHECK(history IN ('none', 'last', 'all'))
    );`,
    `CREATE INDEX IF NOT EXISTS schedules_workspace_idx ON schedules(workspace_id);`,
    `CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      target_agent_id TEXT NOT NULL REFERENCES agents(id),
      detail TEXT NOT NULL DEFAULT '',
      endpoint TEXT NOT NULL,
      thread_id TEXT NOT NULL REFERENCES threads(id),
      last_fired_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK(status IN ('active', 'paused', 'failed'))
    );`,
    `CREATE INDEX IF NOT EXISTS webhooks_workspace_idx ON webhooks(workspace_id);`,
    `CREATE TABLE IF NOT EXISTS thread_plans (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL UNIQUE REFERENCES threads(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'draft',
      overview TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK(status IN ('draft', 'approved', 'in_progress', 'completed', 'cancelled'))
    );`,
    `CREATE TABLE IF NOT EXISTS thread_plan_items (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES thread_plans(id) ON DELETE CASCADE,
      "order" INTEGER NOT NULL CHECK("order" >= 0),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      subagent_role TEXT,
      result_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK(status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled'))
    );`,
    `CREATE INDEX IF NOT EXISTS thread_plan_items_plan_idx ON thread_plan_items(plan_id);`,
    `CREATE INDEX IF NOT EXISTS thread_plan_items_plan_order_idx ON thread_plan_items(plan_id, "order");`,
    `CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      interrupt_id TEXT,
      wait_fire_at INTEGER,
      parent_run_id TEXT,
      attempt INTEGER NOT NULL DEFAULT 1,
      lease_instance_id TEXT,
      lease_expires_at INTEGER,
      lease_epoch INTEGER NOT NULL DEFAULT 0,
      last_seq INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS runs_active_root_idx ON runs(thread_id)
      WHERE parent_run_id IS NULL AND status IN ('queued', 'running', 'needs_input', 'waiting');`,
    `CREATE INDEX IF NOT EXISTS runs_claim_idx ON runs(status, created_at);`,
    `CREATE INDEX IF NOT EXISTS runs_ask_ttl_idx ON runs(status, updated_at);`,
    // runs_wait_fire_idx is created after ALTER wait_fire_at below.
    `CREATE TABLE IF NOT EXISTS run_events (
      run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      metadata TEXT,
      client_event_id TEXT,
      PRIMARY KEY (run_id, seq)
    );`,
    `CREATE INDEX IF NOT EXISTS run_events_client_idx ON run_events(thread_id, client_event_id);`,
    `CREATE INDEX IF NOT EXISTS attachments_thread_idx ON attachments(thread_id);`,
    `CREATE TABLE IF NOT EXISTS plugins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL,
      revision TEXT NOT NULL,
      path TEXT NOT NULL,
      data_path TEXT NOT NULL,
      format TEXT,
      ir_summary TEXT,
      grants TEXT NOT NULL DEFAULT '{}',
      options TEXT NOT NULL DEFAULT '{}',
      enabled_workspace_ids TEXT NOT NULL DEFAULT '[]',
      registry_id TEXT REFERENCES plugin_registries(id) ON DELETE SET NULL,
      catalog_plugin_name TEXT,
      installed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS plugin_approvals (
      plugin_name TEXT NOT NULL REFERENCES plugins(name) ON DELETE CASCADE,
      server_id TEXT NOT NULL,
      approved_at TEXT NOT NULL,
      PRIMARY KEY (plugin_name, server_id)
    );`,
    `CREATE TABLE IF NOT EXISTS plugin_server_state (
      plugin_name TEXT NOT NULL REFERENCES plugins(name) ON DELETE CASCADE,
      server_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      disabled_at TEXT NOT NULL,
      PRIMARY KEY (plugin_name, server_id, workspace_id)
    );`,
    `CREATE TABLE IF NOT EXISTS plugin_registries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      source TEXT NOT NULL,
      path TEXT NOT NULL,
      revision TEXT,
      last_sync_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS plugin_catalog_entries (
      id TEXT PRIMARY KEY,
      registry_id TEXT NOT NULL REFERENCES plugin_registries(id) ON DELETE CASCADE,
      plugin_name TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(registry_id, plugin_name)
    );`,
  ];

  for (const statement of statements) {
    db.run(sql.raw(statement));
  }

  // Widen threads.kind CHECK for webhook threads (SQLite requires table rebuild).
  try {
    const master = db.all<{ sql: string }>(
      sql`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'threads'`,
    );
    const createSql = master[0]?.sql ?? '';
    if (createSql !== '' && !createSql.includes("'webhook'")) {
      db.run(sql.raw('PRAGMA foreign_keys = OFF;'));
      db.run(
        sql.raw(`CREATE TABLE threads_kind_migration (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
        title TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'chat',
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_read_at TEXT NOT NULL,
        CHECK(kind IN ('chat', 'schedule', 'webhook'))
      );`),
      );
      db.run(sql.raw('INSERT INTO threads_kind_migration SELECT * FROM threads;'));
      db.run(sql.raw('DROP TABLE threads;'));
      db.run(sql.raw('ALTER TABLE threads_kind_migration RENAME TO threads;'));
      db.run(sql.raw('PRAGMA foreign_keys = ON;'));
    }
  } catch {}

  try {
    db.run(sql.raw('ALTER TABLE webhooks ADD COLUMN thread_id text REFERENCES threads(id);'));
  } catch {}

  try {
    db.run(sql.raw('ALTER TABLE plugins ADD COLUMN registry_id text;'));
  } catch {}

  try {
    db.run(sql.raw('ALTER TABLE plugins ADD COLUMN catalog_plugin_name text;'));
  } catch {}

  migratePluginGrantsSchema(db);
  migrateNodeCatalogProviders(db);

  try {
    db.run(sql.raw('DELETE FROM webhooks WHERE thread_id IS NULL;'));
  } catch {}

  try {
    db.run(
      sql.raw('CREATE UNIQUE INDEX IF NOT EXISTS webhooks_thread_idx ON webhooks(thread_id);'),
    );
  } catch {}

  // Drop legacy chat tables (big-bang stand wipe; no data migration)
  for (const table of ['steps', 'messages', 'timeline_entries', 'automations']) {
    try {
      db.run(sql.raw(`DROP TABLE IF EXISTS ${table};`));
    } catch {}
  }

  try {
    db.run(sql.raw('ALTER TABLE agents RENAME COLUMN soul TO instructions;'));
  } catch {}

  try {
    db.run(sql.raw(`ALTER TABLE agents ADD COLUMN skills text NOT NULL DEFAULT '[]';`));
  } catch {}

  try {
    db.run(sql.raw(`ALTER TABLE agents ADD COLUMN mcp_servers text NOT NULL DEFAULT '[]';`));
  } catch {}

  try {
    db.run(sql.raw('ALTER TABLE agents ADD COLUMN effort text;'));
  } catch {}

  try {
    db.run(sql.raw('ALTER TABLE agents ADD COLUMN generation text;'));
  } catch {}

  try {
    db.run(sql.raw('ALTER TABLE agents ADD COLUMN tool_output text;'));
  } catch {}

  try {
    db.run(sql.raw('ALTER TABLE agents ADD COLUMN compaction_json text;'));
  } catch {}

  try {
    db.run(sql.raw('ALTER TABLE agents ADD COLUMN memory_json text;'));
  } catch {}

  try {
    db.run(sql.raw(`ALTER TABLE agents ADD COLUMN graph_json text;`));
  } catch {}

  try {
    db.run(sql.raw('ALTER TABLE agents ADD COLUMN budget_json text;'));
  } catch {}

  try {
    db.run(sql.raw(`ALTER TABLE agents ADD COLUMN capabilities_json text NOT NULL DEFAULT '{}';`));
  } catch {}

  try {
    db.run(sql.raw(`ALTER TABLE agents ADD COLUMN hooks_json text NOT NULL DEFAULT '[]';`));
  } catch {}

  try {
    db.run(
      sql.raw(`ALTER TABLE agents ADD COLUMN enabled_plugins_json text NOT NULL DEFAULT '{}';`),
    );
  } catch {}

  try {
    db.run(sql.raw('ALTER TABLE agents ADD COLUMN parent_id text;'));
  } catch {}

  try {
    db.run(sql.raw('ALTER TABLE agents ADD COLUMN permissions_json text;'));
  } catch {}

  try {
    db.run(sql.raw('ALTER TABLE agents ADD COLUMN color text;'));
  } catch {}

  // capability_core_v1: core есть у всех агентов до флипа composition-root
  // на резолвер (иначе таргет с fatal/без ask_user). Идемпотентно по маркеру.
  migrateCapabilityCore(db);

  try {
    db.run(
      sql.raw(`CREATE TABLE IF NOT EXISTS mode_presets (
      workspace_id text NOT NULL,
      id text NOT NULL,
      name text NOT NULL, description text NOT NULL DEFAULT '',
      instructions text NOT NULL DEFAULT '', skills_json text NOT NULL DEFAULT '[]',
      packs_json text NOT NULL DEFAULT '[]', permissions_json text NOT NULL DEFAULT '{}',
      builtin integer NOT NULL DEFAULT 0, installed_by_default integer NOT NULL DEFAULT 0,
      created_at text NOT NULL, updated_at text NOT NULL,
      PRIMARY KEY (workspace_id, id));`),
    );
  } catch {}

  // Legacy id-PK tables need the column before drizzle selects (gate/capability migrations).
  try {
    db.run(sql.raw('ALTER TABLE mode_presets ADD COLUMN workspace_id text;'));
  } catch {}

  // Legacy DBs still on id-PK get an unscoped seed; 4a migration copies per node.
  seedLegacyModePresetsIfUnscoped(db);

  cleanupReservedModeIds(db);

  try {
    db.run(sql.raw('ALTER TABLE agents ADD COLUMN default_mode_id text;'));
  } catch {}

  try {
    db.run(sql.raw("ALTER TABLE agents ADD COLUMN modes_json text NOT NULL DEFAULT '[]';"));
  } catch {}

  // Rows predating the `agents` operation: preset rows and agent mode copies
  // get the spec gate; custom modes keep inheriting the agent base.
  backfillAgentsModeGates(db);

  // capability_set_v1: `agents.tools` drop, modes/preset packs array→map, core
  // merge. Runs after the mode backfill above so freshly seeded agent modes
  // convert in the same boot; idempotent via `schema_meta`.
  migrateCapabilitySet(db);

  migrateNodeCatalogPresets(db);

  // After per-node presets exist: install installedByDefault + ask into empty agents.
  const presetRepo = new SqliteModePresetRepo(db);
  for (const row of db.select().from(agentsTable).all()) {
    if (row.modesJson !== '[]') {
      continue;
    }
    const defaults = presetRepo
      .list(row.workspaceId)
      .filter(
        (preset) =>
          preset.id !== DEFAULT_MODE_ID && (preset.installedByDefault || preset.id === ASK_MODE.id),
      );
    const modes = defaults.map(modeFromPreset);
    if (!modes.some((mode) => mode.id === ASK_MODE.id)) {
      modes.push({ ...ASK_MODE });
    }
    db.update(agentsTable)
      .set({ modesJson: JSON.stringify(modes) })
      .where(eq(agentsTable.id, row.id))
      .run();
  }

  try {
    db.run(sql.raw(`ALTER TABLE threads ADD COLUMN kind text NOT NULL DEFAULT 'chat';`));
  } catch {}

  try {
    db.run(sql.raw('ALTER TABLE threads ADD COLUMN last_read_at text;'));
  } catch {}

  try {
    db.run(sql.raw('UPDATE threads SET last_read_at = updated_at WHERE last_read_at IS NULL;'));
  } catch {}

  try {
    db.run(sql.raw("ALTER TABLE threads ADD COLUMN origin_agent_id text NOT NULL DEFAULT '';"));
  } catch {}

  try {
    db.run(
      sql.raw(
        "UPDATE threads SET origin_agent_id = agent_id WHERE origin_agent_id IS NULL OR origin_agent_id = '';",
      ),
    );
  } catch {}

  try {
    db.run(sql.raw('ALTER TABLE threads ADD COLUMN parent_thread_id text;'));
  } catch {}

  try {
    db.run(sql.raw('ALTER TABLE threads ADD COLUMN fork_at text;'));
  } catch {}

  try {
    db.run(sql.raw('ALTER TABLE schedules ADD COLUMN thread_id text REFERENCES threads(id);'));
  } catch {}

  try {
    db.run(sql.raw('DELETE FROM schedules WHERE thread_id IS NULL;'));
  } catch {}

  try {
    db.run(
      sql.raw('CREATE UNIQUE INDEX IF NOT EXISTS schedules_thread_idx ON schedules(thread_id);'),
    );
  } catch {}

  try {
    db.run(sql.raw(`ALTER TABLE schedules ADD COLUMN mode text NOT NULL DEFAULT 'auto';`));
  } catch {}

  try {
    db.run(sql.raw(`UPDATE schedules SET mode = 'auto' WHERE mode IS NULL OR mode = '';`));
  } catch {}

  try {
    db.run(sql.raw(`ALTER TABLE schedules ADD COLUMN history text NOT NULL DEFAULT 'none';`));
  } catch {}

  try {
    db.run(sql.raw(`ALTER TABLE schedules ADD COLUMN history_last integer NOT NULL DEFAULT 1;`));
  } catch {}

  try {
    db.run(sql.raw('ALTER TABLE schedules ADD COLUMN metadata text;'));
  } catch {}

  // Legacy chat used attachments.message_id; journal uses entry_id.
  try {
    db.run(sql.raw('ALTER TABLE attachments RENAME COLUMN message_id TO entry_id;'));
  } catch {}
  try {
    db.run(sql.raw('DROP INDEX IF EXISTS attachments_thread_pending_idx;'));
  } catch {}
  try {
    db.run(
      sql.raw(
        'CREATE INDEX IF NOT EXISTS attachments_thread_pending_idx ON attachments(thread_id) WHERE entry_id IS NULL;',
      ),
    );
  } catch {}
  try {
    db.run(sql.raw('ALTER TABLE runs ADD COLUMN wait_fire_at INTEGER;'));
  } catch {}
  // Always recreate after column exists (fresh create or ALTER).
  try {
    db.run(sql.raw('DROP INDEX IF EXISTS runs_active_root_idx;'));
  } catch {}
  db.run(
    sql.raw(
      `CREATE UNIQUE INDEX IF NOT EXISTS runs_active_root_idx ON runs(thread_id)
      WHERE parent_run_id IS NULL AND status IN ('queued', 'running', 'needs_input', 'waiting');`,
    ),
  );
  db.run(sql.raw('CREATE INDEX IF NOT EXISTS runs_wait_fire_idx ON runs(status, wait_fire_at);'));

  try {
    db.run(sql.raw("ALTER TABLE schedules ADD COLUMN mode_id text NOT NULL DEFAULT 'ask';"));
  } catch {}
  db.run(sql.raw('UPDATE schedules SET mode_id = mode;'));

  bootstrapMemory(db);
}

export const bootstrapDatabase = bootstrap;
