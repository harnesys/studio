import { useSelectedAgent } from '@/features/desk';
import { HitlPrompt } from '@/features/send-message';
import { ChatComposer } from '@/widgets/chat-composer';
import { ChatTranscript } from '@/widgets/chat-transcript';

import { DeskIdle } from './desk-idle';

export function ChatWorkspace() {
  const agent = useSelectedAgent();

  if (!agent) {
    return (
      <section className="flex min-w-0 flex-1 flex-col" data-testid="chat-surface">
        <DeskIdle />
      </section>
    );
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="chat-surface">
      <div className="min-h-0 flex-1">
        <ChatTranscript />
      </div>
      <HitlPrompt />
      <ChatComposer />
    </section>
  );
}
