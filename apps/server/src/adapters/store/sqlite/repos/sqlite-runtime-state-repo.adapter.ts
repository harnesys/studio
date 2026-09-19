import type { Event } from 'harnesys';
import type { RuntimeStateRepository } from '../../../../domain/runtime-state.port.ts';
import type { StudioDb } from '../connection.ts';
import { SqliteRuntimeState } from './sqlite-runtime-state.repo.ts';
export class SqliteRuntimeStateRepo implements RuntimeStateRepository {
  constructor(
    private readonly db: StudioDb,
    private readonly onEvents?: (threadId: string, events: readonly Event[]) => void,
  ) {}
  forState(threadId: string): SqliteRuntimeState {
    return new SqliteRuntimeState(this.db, threadId, threadId, this.onEvents);
  }
}
