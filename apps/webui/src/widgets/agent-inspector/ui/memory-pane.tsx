import type { Agent } from '@/entities/agent';

import { PinsPanel } from './pins-panel';
import { SemanticPanel } from './semantic-panel';

export function MemoryPane({ agent }: { agent: Agent }) {
  return (
    <>
      <PinsPanel agent={agent} />
      <SemanticPanel agent={agent} />
    </>
  );
}
