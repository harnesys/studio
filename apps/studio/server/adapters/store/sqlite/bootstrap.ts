import { sql } from 'drizzle-orm';
import { bootstrapMemory } from './bootstrap-memory.ts';
import type { StudioDb } from './connection.ts';

export function bootstrap(db: StudioDb): void {
  // Drop journal tables (0.5.0 cutover)
  for (const table of ['journal_steps', 'journal_entries']) {
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
      name TEXT NOT NULL UNIQUE,
      driver TEXT NOT NULL,
      api_url TEXT,
      api_key TEXT,
      headers TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
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
      title TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'chat',
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_read_at TEXT NOT NULL,
      CHECK(kind IN ('chat', 'schedule'))
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
      thread_id TEXT NOT NULL,
      status TEXT NOT NULL,
      interrupt_id TEXT,
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
      WHERE parent_run_id IS NULL AND status IN ('queued', 'running', 'needs_input');`,
    `CREATE INDEX IF NOT EXISTS runs_claim_idx ON runs(status, created_at);`,
    `CREATE INDEX IF NOT EXISTS runs_ask_ttl_idx ON runs(status, updated_at);`,
    `CREATE TABLE IF NOT EXISTS run_events (
      run_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      thread_id TEXT NOT NULL,
      type TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      metadata TEXT,
      client_event_id TEXT,
      PRIMARY KEY (run_id, seq)
    );`,
    `CREATE INDEX IF NOT EXISTS run_events_client_idx ON run_events(thread_id, client_event_id);`,
    `CREATE INDEX IF NOT EXISTS attachments_thread_idx ON attachments(thread_id);`,
  ];

  for (const statement of statements) {
    db.run(sql.raw(statement));
  }

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
    db.run(sql.raw(`ALTER TABLE agents ADD COLUMN tools text NOT NULL DEFAULT '[]';`));
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
    db.run(sql.raw(`ALTER TABLE threads ADD COLUMN kind text NOT NULL DEFAULT 'chat';`));
  } catch {}

  try {
    db.run(sql.raw('ALTER TABLE threads ADD COLUMN last_read_at text;'));
  } catch {}

  try {
    db.run(sql.raw('UPDATE threads SET last_read_at = updated_at WHERE last_read_at IS NULL;'));
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

  bootstrapMemory(db);
}

export const bootstrapDatabase = bootstrap;
