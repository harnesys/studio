import type { Journal } from '@studio/shared';
import { isAgentEntry, isBuiltinStep } from '@studio/shared';
import { useShallow } from 'zustand/react/shallow';
import type { AgentStatus } from '@/entities/agent';
import { useJournalStore } from '@/entities/journal';
import { useThreadStore } from '@/entities/thread';

/** Live agent status from open runs / HITL on this agent's threads. */
export function useAgentLiveStatus(agentId: string): AgentStatus {
  const threadIds = useThreadStore(
    useShallow((state) =>
      state.items.filter((item) => item.agentId === agentId).map((item) => item.id),
    ),
  );
  return useJournalStore((state) => {
    let running = false;
    for (const threadId of threadIds) {
      const journal = state.journals[threadId] ?? { entries: [] };
      if (isWaiting(journal)) {
        return 'waiting';
      }
      if (state.activeRuns[threadId] || hasRunningAgent(journal)) {
        running = true;
      }
    }
    return running ? 'running' : 'idle';
  });
}

export function useAgentHasUnread(agentId: string): boolean {
  return useThreadStore((state) => state.hasUnreadForAgent(agentId));
}

export function useThreadWaiting(threadId: string | null): boolean {
  return useJournalStore((state) => {
    if (!threadId) {
      return false;
    }
    return isWaiting(state.journals[threadId] ?? { entries: [] });
  });
}

function isWaiting(journal: Journal): boolean {
  const agent = [...journal.entries].reverse().find(isAgentEntry);
  if (!agent) {
    return false;
  }
  if (agent.status === 'paused') {
    return true;
  }
  return agent.steps.some(
    (step: any) =>
      isBuiltinStep(step) &&
      (step.status === 'awaiting_confirm' || step.status === 'awaiting_input'),
  );
}

function hasRunningAgent(journal: Journal): boolean {
  return journal.entries.some((entry) => isAgentEntry(entry) && entry.status === 'running');
}
