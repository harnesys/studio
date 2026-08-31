import type { RuntimeStateRepository } from '../../../../domain/runtime-state.port.ts';
import type { StudioDb } from '../connection.ts';
import { SqliteRuntimeState } from './sqlite-runtime-state.repo.ts';

export class SqliteRuntimeStateRepo implements RuntimeStateRepository {
  constructor(private readonly db: StudioDb) {}

  forState(threadId: string): SqliteRuntimeState {
    return new SqliteRuntimeState(this.db, threadId, threadId);
  }

  deleteByThread(_threadId: string): void {
    // TODO: implement cleanup when thread is deleted
  }
}
