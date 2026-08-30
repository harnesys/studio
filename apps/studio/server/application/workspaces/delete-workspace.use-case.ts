import type { StudioDb } from '../../adapters/store/sqlite/connection.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { AttachmentRepository } from '../../domain/attachment.port.ts';
import type { AttachmentsPort } from '../../domain/attachments.port.ts';
import type { ScheduleRepository } from '../../domain/schedule.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type DeleteWorkspaceRequest = {
  id: string;
};

export type DeleteWorkspaceInput = {
  execute(request: DeleteWorkspaceRequest): Promise<void>;
};

export type DeleteWorkspaceDeps = {
  workspaces: WorkspaceRepository;
  agents: AgentRepository;
  threads: ThreadRepository;
  attachments: AttachmentRepository;
  attachmentsFs: AttachmentsPort;
  db?: StudioDb;
  workspaceHarnesys?: WorkspaceHarnesysRegistry;
  schedules?: ScheduleRepository;
};

export class DeleteWorkspaceUseCase implements DeleteWorkspaceInput {
  private readonly workspaces: WorkspaceRepository;
  private readonly agents: AgentRepository;
  private readonly threads: ThreadRepository;
  private readonly attachments: AttachmentRepository;
  private readonly attachmentsFs: AttachmentsPort;
  private readonly db?: StudioDb;
  private readonly workspaceHarnesys?: WorkspaceHarnesysRegistry;
  private readonly schedules?: ScheduleRepository;

  constructor(deps: DeleteWorkspaceDeps) {
    this.workspaces = deps.workspaces;
    this.agents = deps.agents;
    this.threads = deps.threads;
    this.attachments = deps.attachments;
    this.attachmentsFs = deps.attachmentsFs;
    this.db = deps.db;
    this.workspaceHarnesys = deps.workspaceHarnesys;
    this.schedules = deps.schedules;
  }

  async execute(request: DeleteWorkspaceRequest): Promise<void> {
    const all = this.workspaces.list();
    if (all.length <= 1) {
      throw new ValidationError('keep at least one workspace');
    }

    const doomed = this.threads.listByWorkspace(request.id).map((t) => t.id);
    const workspace = this.workspaces.findById(request.id);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }

    const performDbDelete = () => {
      this.schedules?.deleteByWorkspace(request.id);
      this.attachments.deleteByWorkspace(request.id, doomed);
      this.threads.deleteByWorkspace(request.id);
      this.agents.deleteByWorkspace(request.id);
      this.workspaces.delete(request.id);
    };
    if (this.db) {
      this.db.transaction(() => performDbDelete());
    } else {
      performDbDelete();
    }

    await this.workspaceHarnesys?.forget(request.id);

    for (const threadId of doomed) {
      await this.attachmentsFs.remove(workspace.path, threadId, []);
    }
  }
}
