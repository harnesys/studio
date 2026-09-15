import { ChevronLeftIcon } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import type { Agent } from '@/entities/agent';
import type { Thread } from '@/entities/thread';
import { useAgentsSlideStore, useAgentThreads } from '@/features/desk';
import { Button } from '@/shared/ui/button';
import { useThreadActions } from '../model/thread-actions';
import { buildThreadTree, type ThreadTreeNode } from '../model/thread-tree';
import { AgentThreadRow } from './agent-thread-row';

function ThreadTreeNodes({
  nodes,
  renderRow,
}: {
  nodes: ThreadTreeNode[];
  renderRow: (thread: Thread) => ReactNode;
}) {
  return (
    <>
      {nodes.map((node) => (
        <Fragment key={node.thread.id}>
          {renderRow(node.thread)}
          {node.children.length > 0 ? (
            <div className="ml-5 border-border/60 border-l pl-3">
              <ThreadTreeNodes nodes={node.children} renderRow={renderRow} />
            </div>
          ) : null}
        </Fragment>
      ))}
    </>
  );
}

export function AgentThreadsPanel({
  agent,
  workspaceId,
  activeThreadId,
  onDone,
}: {
  agent: Agent;
  workspaceId: string;
  activeThreadId: string | null;
  onDone: () => void;
}) {
  const back = useAgentsSlideStore((state) => state.back);
  const threads = useAgentThreads(agent.id);
  const actions = useThreadActions(workspaceId);
  const sorted = buildThreadTree(threads);

  return (
    <div className="flex flex-col gap-0.5" data-testid="agent-threads-panel">
      <div className="mb-1 flex items-center gap-1 group-data-[collapsible=icon]:hidden">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="px-2 text-muted-foreground"
          data-testid="agent-threads-back"
          title="Back to agents"
          onClick={() => back()}
        >
          <ChevronLeftIcon className="-ml-px" />
          <span className="min-w-0 truncate">Back to agents</span>
          <span className="sr-only">Back to agents</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="ml-auto shrink-0 px-2 text-muted-foreground text-xs"
          data-testid="agent-threads-new"
          onClick={() => actions.createThread(agent.id)}
        >
          New
        </Button>
      </div>
      {sorted.length === 0 ? (
        <p className="px-2 py-2 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
          No threads yet.
        </p>
      ) : (
        <ThreadTreeNodes
          nodes={sorted}
          renderRow={(thread) => (
            <AgentThreadRow
              thread={thread}
              selected={activeThreadId === thread.id}
              onSelect={() => {
                actions.openThread(thread);
                onDone();
              }}
              onPinToggle={thread.kind === 'chat' ? () => actions.togglePin(thread) : undefined}
              onDelete={thread.kind === 'chat' ? () => actions.removeThread(thread) : undefined}
            />
          )}
        />
      )}
    </div>
  );
}
