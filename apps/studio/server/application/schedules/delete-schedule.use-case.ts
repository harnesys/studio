import type { ScheduleFireQueue } from '../../adapters/schedule-fire-queue.adapter.ts';
import type { StudioDb } from '../../adapters/store/sqlite/connection.ts';
import type { AttachmentRepository } from '../../domain/attachment.port.ts';
import type { AttachmentsPort } from '../../domain/attachments.port.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import type { ScheduleRepository } from '../../domain/schedule.port.ts';
import type { SemanticSessionCleanup } from '../../domain/semantic-session.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type DeleteScheduleRequest = {
  workspaceId: string;
  id: string;
};

export type DeleteScheduleInput = {
  execute(request: DeleteScheduleRequest): Promise<void>;
};

export type DeleteScheduleDeps = {
  schedules: ScheduleRepository;
  threads: ThreadRepository;
  workspaces: WorkspaceRepository;
  attachments: AttachmentRepository;
  attachmentsFs: AttachmentsPort;
  queue: ScheduleFireQueue;
  deskEvents: DeskEventsPort;
  db?: StudioDb;
  semanticSessions?: SemanticSessionCleanup;
};

export class DeleteScheduleUseCase implements DeleteScheduleInput {
  private readonly schedules: ScheduleRepository;
  private readonly threads: ThreadRepository;
  private readonly workspaces: WorkspaceRepository;
  private readonly attachments: AttachmentRepository;
  private readonly attachmentsFs: AttachmentsPort;
  private readonly queue: ScheduleFireQueue;
  private readonly deskEvents: DeskEventsPort;
  private readonly db?: StudioDb;
  private readonly semanticSessions?: SemanticSessionCleanup;

  constructor(deps: DeleteScheduleDeps) {
    this.schedules = deps.schedules;
    this.threads = deps.threads;
    this.workspaces = deps.workspaces;
    this.attachments = deps.attachments;
    this.attachmentsFs = deps.attachmentsFs;
    this.queue = deps.queue;
    this.deskEvents = deps.deskEvents;
    this.db = deps.db;
    this.semanticSessions = deps.semanticSessions;
  }

  async execute(request: DeleteScheduleRequest): Promise<void> {
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }

    const schedule = this.schedules.findById(request.id);
    if (!schedule || schedule.workspaceId !== request.workspaceId) {
      throw new NotFoundError('schedule not found');
    }

    const threadId = schedule.threadId;
    const thread = this.threads.findById(threadId);
    const ownedThread = thread?.kind === 'schedule';
    const attachmentRows = ownedThread ? this.attachments.listByThread(threadId) : [];
    const attachmentIds = attachmentRows.map((row) => row.id);

    this.queue.drop(threadId);

    const perform = () => {
      if (ownedThread) {
        this.semanticSessions?.deleteSessionByThread({
          workspaceId: request.workspaceId,
          threadId,
        });
      }
      this.schedules.delete(schedule.id);
      if (ownedThread) {
        this.threads.delete(threadId);
      }
    };

    if (this.db) {
      this.db.transaction(perform);
    } else {
      perform();
    }

    this.deskEvents.emit(request.workspaceId, {
      type: 'schedule-deleted',
      id: schedule.id,
    });

    if (ownedThread && attachmentIds.length > 0) {
      await this.attachmentsFs.remove(workspace.path, threadId, attachmentIds);
    }
  }
}
