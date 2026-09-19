import type { SessionHandle } from 'harnesys';
import { NotFoundError } from '../domain/studio.error.ts';
import type { ThreadRepository } from '../domain/thread.port.ts';
import type { WorkspaceRepository } from '../domain/workspace.port.ts';
import type { ThreadRuntimeRegistry } from './thread-runtime.registry.ts';
import type { WorkspaceHarnesysRegistry } from './workspace-harnesys.registry.ts';
export type ThreadSessions = {
  forThread(threadId: string): Promise<SessionHandle>;
};
export type ThreadSessionsDeps = {
  threads: ThreadRepository;
  workspaces: WorkspaceRepository;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
  registry: ThreadRuntimeRegistry;
};
export class ThreadSessionsAdapter implements ThreadSessions {
  constructor(private readonly deps: ThreadSessionsDeps) {}
  async forThread(threadId: string): Promise<SessionHandle> {
    const thread = this.deps.threads.findById(threadId);
    if (!thread) {
      throw new NotFoundError('thread not found');
    }
    const workspace = this.deps.workspaces.findById(thread.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    const hx = await this.deps.workspaceHarnesys.get(workspace);
    return this.deps.registry.threadOf(thread.id, hx, thread.agentId, workspace.path);
  }
}
