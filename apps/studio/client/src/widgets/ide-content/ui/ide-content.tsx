import { useAgentStore } from '@/entities/agent';
import { useThreadStore } from '@/entities/thread';
import { useDeskStore } from '@/features/desk';
import type { IdeTab } from '@/features/ide';
import { openFileKind } from '@/features/open-file';
import { HitlPrompt } from '@/features/send-message';
import { ChatComposer } from '@/widgets/chat-composer';
import { ThreadPanel } from '@/widgets/chat-transcript';
import { MediaPreview, TextEditor } from '@/widgets/file-pane';

export function IdeTabContent({ tab, workspaceId }: { tab: IdeTab; workspaceId: string }) {
  const hydratedWorkspaceId = useDeskStore((state) => state.hydratedWorkspaceId);
  const isHydrating = Boolean(workspaceId && hydratedWorkspaceId !== workspaceId);

  if (tab.kind === 'thread' && tab.threadId) {
    const thread = useThreadStore.getState().byId(tab.threadId);
    const agent = useAgentStore.getState().items.find((a) => a.id === thread?.agentId) ?? null;
    if (!thread || !agent || isHydrating) {
      return (
        <div
          className="flex flex-1 items-center justify-center text-muted-foreground text-sm"
          data-testid="ide-thread-loading"
        >
          {isHydrating ? 'Loading…' : 'Thread not found'}
        </div>
      );
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-thread">
        <div className="min-h-0 flex-1">
          <ThreadPanel threadId={thread.id} agent={agent} />
        </div>
        <HitlPrompt />
        {thread.kind === 'chat' ? <ChatComposer /> : null}
      </div>
    );
  }
  if (tab.kind === 'file' && tab.path) {
    const kind = openFileKind(tab.path);
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-file">
        {kind === 'text' ? (
          <TextEditor workspaceId={workspaceId} path={tab.path} dirty={Boolean(tab.dirty)} />
        ) : null}
        {kind === 'image' || kind === 'pdf' ? (
          <MediaPreview workspaceId={workspaceId} path={tab.path} kind={kind} />
        ) : null}
        {kind === 'unsupported' ? (
          <div className="flex flex-1 items-center justify-center px-4 text-muted-foreground text-sm">
            Preview is not available
          </div>
        ) : null}
      </div>
    );
  }
  return null;
}
