import { CalendarClockIcon, MessageSquareIcon, MessageSquarePlusIcon } from 'lucide-react';
import { useAgentThreads, useDeskStore, useSelectedAgent } from '@/features/desk';
import { openNewThread } from '@/features/switch-thread';
import { useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { formatDayTime } from '@/shared/lib/format-clock';
import {
  CategoryLanding,
  CategoryLandingActionCard,
  CategoryLandingActions,
  CategoryLandingDescription,
  CategoryLandingEyebrow,
  CategoryLandingList,
  CategoryLandingListItem,
  CategoryLandingSection,
  CategoryLandingTitle,
} from '@/shared/ui/category-landing';

export function ThreadsList() {
  const { workspaceId, agentId } = useStudioLocation();
  const agent = useSelectedAgent();
  const threads = useAgentThreads(agentId);
  const { openThread } = useStudioNavigation();

  if (!agent || !workspaceId || !agentId) {
    return (
      <CategoryLanding data-testid="threads-list">
        <CategoryLandingEyebrow>CLEAR</CategoryLandingEyebrow>
        <CategoryLandingTitle>Threads</CategoryLandingTitle>
        <CategoryLandingDescription>Select an agent to see its threads.</CategoryLandingDescription>
      </CategoryLanding>
    );
  }

  const sorted = [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  if (threads.length === 0) {
    return (
      <CategoryLanding data-testid="threads-list">
        <CategoryLandingEyebrow>CLEAR</CategoryLandingEyebrow>
        <CategoryLandingTitle>No thread on the floor</CategoryLandingTitle>
        <CategoryLandingDescription>
          {agent.name} is standing by. Start a thread to talk.
        </CategoryLandingDescription>
        <div className="mt-8">
          <p className="mb-2.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
            Start with
          </p>
          <CategoryLandingActions>
            <CategoryLandingActionCard
              icon={<MessageSquarePlusIcon />}
              title="New thread"
              description={`A blank conversation with ${agent.name}.`}
              onClick={() => {
                void openNewThread(agent.id, workspaceId).then((threadId) => {
                  if (threadId) {
                    useDeskStore.getState().setFocusedThreadId(threadId);
                    openThread(workspaceId, agent.id, threadId);
                  }
                });
              }}
            />
          </CategoryLandingActions>
        </div>
      </CategoryLanding>
    );
  }

  return (
    <CategoryLanding data-testid="threads-list">
      <CategoryLandingEyebrow>THREADS — {threads.length}</CategoryLandingEyebrow>
      <CategoryLandingTitle>{agent.name} — threads</CategoryLandingTitle>
      <CategoryLandingDescription>
        {threads.length} thread{threads.length === 1 ? '' : 's'} on the floor. Open one to continue
        or start a fresh line.
      </CategoryLandingDescription>

      <div className="mt-8">
        <p className="mb-2.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
          Start with
        </p>
        <CategoryLandingActions>
          <CategoryLandingActionCard
            icon={<MessageSquarePlusIcon />}
            title="New thread"
            description={`A blank conversation with ${agent.name}.`}
            onClick={() => {
              void openNewThread(agent.id, workspaceId).then((threadId) => {
                if (threadId) {
                  useDeskStore.getState().setFocusedThreadId(threadId);
                  openThread(workspaceId, agent.id, threadId);
                }
              });
            }}
          />
        </CategoryLandingActions>
      </div>

      <CategoryLandingSection label="Existing">
        <CategoryLandingList>
          {sorted.map((item) => (
            <CategoryLandingListItem
              key={item.id}
              icon={item.kind === 'schedule' ? <CalendarClockIcon /> : <MessageSquareIcon />}
              title={item.title}
              subtitle={formatDayTime(item.updatedAt)}
              status={item.unread ? <span className="text-live">unread</span> : null}
              onClick={() => {
                useDeskStore.getState().setFocusedThreadId(item.id);
                openThread(workspaceId, agent.id, item.id);
              }}
            />
          ))}
        </CategoryLandingList>
      </CategoryLandingSection>
    </CategoryLanding>
  );
}
