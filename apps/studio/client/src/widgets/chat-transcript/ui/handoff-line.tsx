import { ArrowRightLeftIcon } from 'lucide-react';

import { useAgentStore } from '@/entities/agent';

import { agentFallbackName } from '../model/agent-label';
import { ActivityLine } from './activity-line';

export function HandoffLine({ agentId }: { agentId: string }) {
  const agent = useAgentStore((state) => state.byId(agentId));
  const name = agent?.name ?? agentFallbackName(agentId);
  return <ActivityLine icon={ArrowRightLeftIcon} label="Handoff" hint={name} hasContent={false} />;
}
