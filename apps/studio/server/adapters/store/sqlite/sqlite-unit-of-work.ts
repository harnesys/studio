import type { StudioRepos, UnitOfWork } from '../../../domain/unit-of-work.port.ts';
import type { StudioDb } from './connection.ts';
import { SqliteAgentRepo } from './repos/sqlite-agent.repo.ts';
import { SqliteAttachmentRepo } from './repos/sqlite-attachment.repo.ts';
import { SqliteJournalRepo } from './repos/sqlite-journal.repo.ts';
import { SqlitePlanRepo } from './repos/sqlite-plan.repo.ts';
import { SqliteThreadRepo } from './repos/sqlite-thread.repo.ts';

export class SqliteUnitOfWork implements UnitOfWork {
  constructor(private readonly db: StudioDb) {}

  run<T>(work: (repos: StudioRepos) => T): T {
    return this.db.transaction((tx) => {
      const db = tx as unknown as StudioDb;
      const threads = new SqliteThreadRepo(db);
      const journal = new SqliteJournalRepo(db);
      const attachments = new SqliteAttachmentRepo(db);
      const agents = new SqliteAgentRepo(db);
      const plans = new SqlitePlanRepo(db);
      return work({ threads, journal, attachments, agents, plans });
    });
  }
}
