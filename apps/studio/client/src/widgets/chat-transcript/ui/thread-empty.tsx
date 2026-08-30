import { type Agent, agentStarters } from '@/entities/agent';
import { useSelectedThread } from '@/features/desk';
import { sendMessage } from '@/features/send-message';
import {
  CategoryLanding,
  CategoryLandingDescription,
  CategoryLandingEyebrow,
  CategoryLandingStarter,
  CategoryLandingStarterList,
  CategoryLandingTitle,
} from '@/shared/ui/category-landing';

export function ThreadEmpty({ agent }: { agent: Agent }) {
  const thread = useSelectedThread();
  const starters = agentStarters(agent);

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
                if (thread) {
                  void sendMessage({ threadId: thread.id, content: starter });
                }
              }}
            >
              {starter}
            </CategoryLandingStarter>
          ))}
        </CategoryLandingStarterList>
      </div>
    </CategoryLanding>
  );
}
