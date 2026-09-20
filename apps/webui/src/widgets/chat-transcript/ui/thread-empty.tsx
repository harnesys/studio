import { MessagesSquareIcon, SparklesIcon } from 'lucide-react';
import { type Agent, agentStarters } from '@/entities/agent';
import { useAgentThreads } from '@/features/desk';
import { useOpenThreadTab } from '@/features/ide';
import { sendMessage } from '@/features/send-message';
import { formatDayTime } from '@/shared/lib/format-clock';
import {
  CategoryLanding,
  CategoryLandingDescription,
  CategoryLandingEyebrow,
  CategoryLandingList,
  CategoryLandingListItem,
  CategoryLandingSection,
  CategoryLandingStarter,
  CategoryLandingStarterList,
  CategoryLandingTitle,
} from '@/shared/ui/category-landing';

const MAX_SKILL_STARTERS = 3;
const MAX_RECENT_THREADS = 3;

export function ThreadEmpty({ agent, threadId }: { agent: Agent; threadId: string }) {
  const starters = agentStarters(agent);
  const openThreadTab = useOpenThreadTab();
  const recentThreads = useAgentThreads(agent.id)
    .filter((thread) => thread.id !== threadId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_RECENT_THREADS);
  const skills = agent.skills.slice(0, MAX_SKILL_STARTERS);
  return (
    <CategoryLanding data-testid="chat-empty-thread" className="fade-in animate-in duration-200">
      <CategoryLandingEyebrow>READY</CategoryLandingEyebrow>
      <CategoryLandingTitle>{agent.name} is on the floor</CategoryLandingTitle>
      <CategoryLandingDescription>{agent.instructions}</CategoryLandingDescription>
      <div className="mt-8">
        <p className="mb-2.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
          Start with
        </p>
        <CategoryLandingStarterList>
          {starters.map((starter) => (
            <CategoryLandingStarter
              key={starter}
              onClick={() => {
                void sendMessage({ threadId, content: starter });
              }}
            >
              {starter}
            </CategoryLandingStarter>
          ))}
        </CategoryLandingStarterList>
      </div>
      {skills.length > 0 ? (
        <CategoryLandingSection label="Skills" icon={<SparklesIcon />}>
          <CategoryLandingStarterList>
            {skills.map((skill) => (
              <CategoryLandingStarter
                key={skill}
                onClick={() => {
                  void sendMessage({
                    threadId,
                    content: `Use the ${skill} skill`,
                    skills: [skill],
                  });
                }}
              >
                {skill}
              </CategoryLandingStarter>
            ))}
          </CategoryLandingStarterList>
        </CategoryLandingSection>
      ) : null}
      {recentThreads.length > 0 ? (
        <CategoryLandingSection label="Recent threads" icon={<MessagesSquareIcon />}>
          <CategoryLandingList>
            {recentThreads.map((thread) => (
              <CategoryLandingListItem
                key={thread.id}
                icon={<MessagesSquareIcon />}
                title={thread.title}
                subtitle={formatDayTime(thread.updatedAt)}
                onClick={() => {
                  openThreadTab(agent.workspaceId, agent.id, thread.id);
                }}
              />
            ))}
          </CategoryLandingList>
        </CategoryLandingSection>
      ) : null}
    </CategoryLanding>
  );
}
