import { ArrowRightLeftIcon } from 'lucide-react';

import { useAgentStore } from '@/entities/agent';

import { FeedNotice, FeedNoticeMetaSep } from './feed-notice';

export function HandoffCard({ agentId }: { agentId: string }) {
  const agent = useAgentStore((state) => state.items.find((item) => item.id === agentId));
  const name = agent?.name ?? agentId.slice(0, 8);

  return (
    <FeedNotice
      testId="handoff-message"
      tone="live"
      icon={ArrowRightLeftIcon}
      label="Handoff"
      meta={
        <>
          <FeedNoticeMetaSep />
          <span className="truncate" title={name}>
            {name}
          </span>
        </>
      }
    />
  );
}
