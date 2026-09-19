import { eq, sql } from 'drizzle-orm';
import { DEFAULT_KNOWLEDGE_SETTINGS } from '../../config/constants.ts';
import type { StudioDb } from '../store/sqlite/connection.ts';
import {
  type KnowledgeIndexStateRow,
  type KnowledgeSettingsRow,
  knowledgeIndexStateTable,
  knowledgeSettingsTable,
} from '../store/sqlite/schema';
import type {
  KnowledgeIndexStatePatch,
  KnowledgeIndexStateRecord,
  KnowledgeSettingsRecord,
  UpsertKnowledgeSettingsRequest,
} from './knowledge-index-types.ts';

export function getSettingsOrDefault(db: StudioDb, workspaceId: string): KnowledgeSettingsRecord {
  const row = db
    .select()
    .from(knowledgeSettingsTable)
    .where(eq(knowledgeSettingsTable.workspaceId, workspaceId))
    .get();
  if (row) {
    return toSettings(row);
  }
  const now = new Date().toISOString();
  const inserted = db
    .insert(knowledgeSettingsTable)
    .values({
      workspaceId,
      entireWorkspace: DEFAULT_KNOWLEDGE_SETTINGS.entireWorkspace,
      backend: DEFAULT_KNOWLEDGE_SETTINGS.backend,
      embedProvider: DEFAULT_KNOWLEDGE_SETTINGS.embedProvider,
      embedModel: DEFAULT_KNOWLEDGE_SETTINGS.embedModel,
      watchEnabled: DEFAULT_KNOWLEDGE_SETTINGS.watchEnabled,
      updatedAt: now,
    })
    .returning()
    .get();
  return toSettings(inserted);
}

export function putSettings(
  db: StudioDb,
  workspaceId: string,
  patch: UpsertKnowledgeSettingsRequest,
): KnowledgeSettingsRecord {
  const current = getSettingsOrDefault(db, workspaceId);
  const next: KnowledgeSettingsRecord = {
    workspaceId,
    entireWorkspace: patch.entireWorkspace ?? current.entireWorkspace,
    backend: patch.backend ?? current.backend,
    embedProvider: patch.embedProvider === undefined ? current.embedProvider : patch.embedProvider,
    embedModel: patch.embedModel === undefined ? current.embedModel : patch.embedModel,
    watchEnabled: patch.watchEnabled ?? current.watchEnabled,
    updatedAt: new Date().toISOString(),
  };
  db.insert(knowledgeSettingsTable)
    .values(next)
    .onConflictDoUpdate({
      target: knowledgeSettingsTable.workspaceId,
      set: {
        entireWorkspace: next.entireWorkspace,
        backend: next.backend,
        embedProvider: next.embedProvider,
        embedModel: next.embedModel,
        watchEnabled: next.watchEnabled,
        updatedAt: next.updatedAt,
      },
    })
    .run();
  return next;
}

export function getIndexState(db: StudioDb, workspaceId: string): KnowledgeIndexStateRecord {
  const row = db
    .select()
    .from(knowledgeIndexStateTable)
    .where(eq(knowledgeIndexStateTable.workspaceId, workspaceId))
    .get();
  if (row) {
    return toState(row);
  }
  return {
    workspaceId,
    status: 'idle',
    phase: null,
    processed: 0,
    total: 0,
    lastError: null,
    startedAt: null,
    finishedAt: null,
  };
}

export function upsertIndexState(
  db: StudioDb,
  workspaceId: string,
  patch: KnowledgeIndexStatePatch,
): KnowledgeIndexStateRecord {
  const current = getIndexState(db, workspaceId);
  const next = {
    workspaceId,
    status: patch.status ?? current.status,
    phase: patch.phase === undefined ? current.phase : patch.phase,
    processed: patch.processed ?? current.processed,
    total: patch.total ?? current.total,
    lastError: patch.lastError === undefined ? current.lastError : patch.lastError,
    startedAt: patch.startedAt === undefined ? current.startedAt : patch.startedAt,
    finishedAt: patch.finishedAt === undefined ? current.finishedAt : patch.finishedAt,
  };
  db.insert(knowledgeIndexStateTable)
    .values(next)
    .onConflictDoUpdate({
      target: knowledgeIndexStateTable.workspaceId,
      set: {
        status: next.status,
        phase: next.phase,
        processed: next.processed,
        total: next.total,
        lastError: next.lastError,
        startedAt: next.startedAt,
        finishedAt: next.finishedAt,
      },
    })
    .run();
  return next;
}

export function bumpProcessed(db: StudioDb, workspaceId: string): void {
  db.update(knowledgeIndexStateTable)
    .set({ processed: sql`${knowledgeIndexStateTable.processed} + 1` })
    .where(eq(knowledgeIndexStateTable.workspaceId, workspaceId))
    .run();
}

function toSettings(row: KnowledgeSettingsRow): KnowledgeSettingsRecord {
  return {
    workspaceId: row.workspaceId,
    entireWorkspace: row.entireWorkspace,
    backend: row.backend,
    embedProvider: row.embedProvider,
    embedModel: row.embedModel,
    watchEnabled: row.watchEnabled,
    updatedAt: row.updatedAt,
  };
}

function toState(row: KnowledgeIndexStateRow): KnowledgeIndexStateRecord {
  return {
    workspaceId: row.workspaceId,
    status: row.status,
    phase: row.phase,
    processed: row.processed,
    total: row.total,
    lastError: row.lastError,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}
