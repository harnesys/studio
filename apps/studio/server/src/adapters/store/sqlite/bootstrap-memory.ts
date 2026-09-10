import { sql } from 'drizzle-orm';
import type { StudioDb } from './connection.ts';

const MEMORY_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS agent_pins (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL,
    key TEXT NOT NULL,
    text TEXT NOT NULL,
    source TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (workspace_id, agent_name, key),
    CHECK(source IN ('agent', 'human'))
  );`,
  `CREATE TABLE IF NOT EXISTS semantic_memories (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL,
    scope TEXT NOT NULL,
    key TEXT,
    text TEXT NOT NULL,
    source TEXT NOT NULL,
    thread_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK(scope IN ('session', 'long')),
    CHECK(source IN ('agent', 'human'))
  );`,
  `DROP INDEX IF EXISTS semantic_memories_keyed_unique;`,
  `CREATE UNIQUE INDEX IF NOT EXISTS semantic_memories_long_keyed_unique
    ON semantic_memories(workspace_id, agent_name, scope, key)
    WHERE key IS NOT NULL AND scope = 'long';`,
  `CREATE UNIQUE INDEX IF NOT EXISTS semantic_memories_session_keyed_unique
    ON semantic_memories(workspace_id, agent_name, scope, key, thread_id)
    WHERE key IS NOT NULL AND scope = 'session';`,
  `CREATE INDEX IF NOT EXISTS semantic_memories_workspace_agent_idx
    ON semantic_memories(workspace_id, agent_name);`,
  `CREATE INDEX IF NOT EXISTS semantic_memories_thread_idx
    ON semantic_memories(workspace_id, thread_id);`,
  `CREATE TABLE IF NOT EXISTS episodic_chunks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    thread_id TEXT NOT NULL,
    entry_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    text TEXT NOT NULL,
    compaction_entry_id TEXT,
    embedding BLOB,
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS episodic_chunks_workspace_thread_idx
    ON episodic_chunks(workspace_id, thread_id);`,
  `CREATE INDEX IF NOT EXISTS episodic_chunks_thread_seq_idx
    ON episodic_chunks(thread_id, seq);`,
  `CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    uri TEXT NOT NULL,
    title TEXT,
    text TEXT NOT NULL,
    embedding BLOB,
    updated_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS knowledge_chunks_workspace_idx
    ON knowledge_chunks(workspace_id);`,
  `CREATE INDEX IF NOT EXISTS knowledge_chunks_workspace_uri_idx
    ON knowledge_chunks(workspace_id, uri);`,
  `CREATE TABLE IF NOT EXISTS knowledge_roots (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (workspace_id, path)
  );`,
  `CREATE TABLE IF NOT EXISTS knowledge_settings (
    workspace_id TEXT PRIMARY KEY NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    entire_workspace INTEGER NOT NULL DEFAULT 0,
    backend TEXT NOT NULL DEFAULT 'fts',
    embed_provider TEXT,
    embed_model TEXT,
    watch_enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    CHECK(backend IN ('fts', 'vector'))
  );`,
  `CREATE TABLE IF NOT EXISTS knowledge_files (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    uri TEXT NOT NULL,
    status TEXT NOT NULL,
    skip_reason TEXT,
    mtime_ms INTEGER,
    size_bytes INTEGER,
    content_hash TEXT,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (workspace_id, uri),
    CHECK(status IN ('pending', 'indexed', 'skipped', 'error'))
  );`,
  `CREATE INDEX IF NOT EXISTS knowledge_files_workspace_status_idx
    ON knowledge_files(workspace_id, status);`,
  `CREATE TABLE IF NOT EXISTS knowledge_index_state (
    workspace_id TEXT PRIMARY KEY NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'idle',
    phase TEXT,
    processed INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    started_at TEXT,
    finished_at TEXT,
    CHECK(status IN ('idle', 'running', 'error'))
  );`,
] as const;

const MEMORY_FTS_STATEMENTS = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS episodic_chunks_fts USING fts5(
    text,
    content='episodic_chunks',
    content_rowid='rowid'
  );`,
  `CREATE TRIGGER IF NOT EXISTS episodic_chunks_ai AFTER INSERT ON episodic_chunks BEGIN
    INSERT INTO episodic_chunks_fts(rowid, text) VALUES (new.rowid, new.text);
  END;`,
  `CREATE TRIGGER IF NOT EXISTS episodic_chunks_ad AFTER DELETE ON episodic_chunks BEGIN
    INSERT INTO episodic_chunks_fts(episodic_chunks_fts, rowid, text)
      VALUES('delete', old.rowid, old.text);
  END;`,
  `CREATE TRIGGER IF NOT EXISTS episodic_chunks_au AFTER UPDATE ON episodic_chunks BEGIN
    INSERT INTO episodic_chunks_fts(episodic_chunks_fts, rowid, text)
      VALUES('delete', old.rowid, old.text);
    INSERT INTO episodic_chunks_fts(rowid, text) VALUES (new.rowid, new.text);
  END;`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
    title,
    text,
    content='knowledge_chunks',
    content_rowid='rowid'
  );`,
  `CREATE TRIGGER IF NOT EXISTS knowledge_chunks_ai AFTER INSERT ON knowledge_chunks BEGIN
    INSERT INTO knowledge_chunks_fts(rowid, title, text)
      VALUES (new.rowid, new.title, new.text);
  END;`,
  `CREATE TRIGGER IF NOT EXISTS knowledge_chunks_ad AFTER DELETE ON knowledge_chunks BEGIN
    INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, title, text)
      VALUES('delete', old.rowid, old.title, old.text);
  END;`,
  `CREATE TRIGGER IF NOT EXISTS knowledge_chunks_au AFTER UPDATE ON knowledge_chunks BEGIN
    INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, title, text)
      VALUES('delete', old.rowid, old.title, old.text);
    INSERT INTO knowledge_chunks_fts(rowid, title, text)
      VALUES (new.rowid, new.title, new.text);
  END;`,
] as const;

export function bootstrapMemory(db: StudioDb): void {
  for (const statement of MEMORY_STATEMENTS) {
    db.run(sql.raw(statement));
  }
  for (const statement of MEMORY_FTS_STATEMENTS) {
    try {
      db.run(sql.raw(statement));
    } catch {}
  }
}
