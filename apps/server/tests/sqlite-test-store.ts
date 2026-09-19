import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { bootstrapDatabase } from '../src/adapters/store/sqlite/bootstrap.ts';
import type { StudioDb } from '../src/adapters/store/sqlite/connection.ts';
import { SqliteAgentRepo } from '../src/adapters/store/sqlite/repos/sqlite-agent.repo.ts';
import { SqliteAttachmentRepo } from '../src/adapters/store/sqlite/repos/sqlite-attachment.repo.ts';
import { SqliteLlmModelRepo } from '../src/adapters/store/sqlite/repos/sqlite-llm-model.repo.ts';
import { SqliteLlmProviderRepo } from '../src/adapters/store/sqlite/repos/sqlite-llm-provider.repo.ts';
import { SqliteRuntimeState } from '../src/adapters/store/sqlite/repos/sqlite-runtime-state.repo.ts';
import { SqliteScheduleRepo } from '../src/adapters/store/sqlite/repos/sqlite-schedule.repo.ts';
import { SqliteThreadRepo } from '../src/adapters/store/sqlite/repos/sqlite-thread.repo.ts';
import { SqliteWebhookRepo } from '../src/adapters/store/sqlite/repos/sqlite-webhook.repo.ts';
import { SqliteWorkspaceRepo } from '../src/adapters/store/sqlite/repos/sqlite-workspace.repo.ts';
import * as schema from '../src/adapters/store/sqlite/schema/index.ts';
import { SqliteUnitOfWork } from '../src/adapters/store/sqlite/sqlite-unit-of-work.ts';
import type { AgentRepository } from '../src/domain/agent.port.ts';
import type { AttachmentRepository } from '../src/domain/attachment.port.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../src/domain/llm-provider.port.ts';
import type { RuntimeStateRepository } from '../src/domain/runtime-state.port.ts';
import type { ScheduleRepository } from '../src/domain/schedule.port.ts';
import type { ThreadRepository } from '../src/domain/thread.port.ts';
import type { UnitOfWork } from '../src/domain/unit-of-work.port.ts';
import type { WebhookRepository } from '../src/domain/webhook.port.ts';
import type { WorkspaceRepository } from '../src/domain/workspace.port.ts';

export type TestStoreRepos = {
  workspace: WorkspaceRepository;
  agent: AgentRepository;
  llmProvider: LlmProviderRepository;
  llmModel: LlmModelRepository;
  schedule: ScheduleRepository;
  webhook: WebhookRepository;
  thread: ThreadRepository;
  runtimeState: RuntimeStateRepository;
  attachment: AttachmentRepository;
};

export type TestStoreDb = StudioDb & { $client: Database };

export type TestStore = {
  db: TestStoreDb;
  repos: TestStoreRepos;
  uow: UnitOfWork;
  cleanup: () => void;
};

export type Seed = Record<string, never>;

export function createSqliteTestStore(seed: Seed = {}): Promise<TestStore> {
  void seed;
  const sqlite = new Database(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  const db = drizzle(sqlite, { schema }) as TestStoreDb;
  bootstrapDatabase(db);

  const runtimeStateFactory: RuntimeStateRepository = {
    forState(threadId: string) {
      return new SqliteRuntimeState(db, threadId, threadId);
    },
  };

  const repos: TestStoreRepos = {
    workspace: new SqliteWorkspaceRepo(db),
    agent: new SqliteAgentRepo(db),
    llmProvider: new SqliteLlmProviderRepo(db),
    llmModel: new SqliteLlmModelRepo(db),
    schedule: new SqliteScheduleRepo(db),
    webhook: new SqliteWebhookRepo(db),
    thread: new SqliteThreadRepo(db),
    runtimeState: runtimeStateFactory,
    attachment: new SqliteAttachmentRepo(db),
  };

  return Promise.resolve({
    db,
    repos,
    uow: new SqliteUnitOfWork(db),
    cleanup: () => sqlite.close(),
  });
}
