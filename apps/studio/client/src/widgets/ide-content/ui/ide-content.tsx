import { useAgentStore } from '@/entities/agent';
import { useThreadStore } from '@/entities/thread';
import { useDeskStore } from '@/features/desk';
import type { IdeTab } from '@/features/ide';
import { openFileKind } from '@/features/open-file';
import { HitlPrompt, PlanApplyBar } from '@/features/send-message';
import { ChatComposer } from '@/widgets/chat-composer';
import { SpawnView, ThreadPanel } from '@/widgets/chat-transcript';
import { MediaPreview, TextEditor } from '@/widgets/file-pane';
import { ThreadJournal } from '@/widgets/thread-journal';

export function IdeTabContent({ tab, workspaceId }: { tab: IdeTab; workspaceId: string }) {
  const isHydrating = useDeskStore((state) => state.hydrated[workspaceId] !== 'ready');
  const thread = useThreadStore((state) =>
    tab.kind === 'thread' && tab.threadId
      ? state.items.find((item) => item.id === tab.threadId)
      : undefined,
  );
  const agent = useAgentStore((state) =>
    thread ? state.items.find((item) => item.id === thread.agentId) : undefined,
  );
  if (tab.kind === 'thread' && tab.threadId) {
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
    if (thread.kind === 'chat') {
      return (
        <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-thread">
          <div className="min-h-0 flex-1">
            <ThreadPanel threadId={thread.id} agent={agent} />
          </div>
          <HitlPrompt />
          <PlanApplyBar />
          <ChatComposer />
        </div>
      );
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-thread">
        <ThreadJournal threadId={thread.id} agent={agent} kind={thread.kind} />
        <HitlPrompt />
        <PlanApplyBar />
      </div>
    );
  }
  if (tab.kind === 'spawn' && tab.threadId && tab.spawnId) {
    return <SpawnView tab={tab} threadId={tab.threadId} spawnId={tab.spawnId} />;
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
