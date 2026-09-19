import { useRef } from 'react';
import type { Thread } from '@/entities/thread';
import {
  useAgentThreads,
  useDeskStore,
  useSelectedAgent,
  useSelectedThread,
} from '@/features/desk';
import { MAX_MOUNTED_THREADS } from '@/shared/config/constants';
import { studioFocusWorkspaceId, useStudioLocation } from '@/shared/config/location';
import { cn } from '@/shared/lib/utils';

import { ChatSkeleton } from './chat-skeleton';
import { NoThreads } from './no-threads';
import { ThreadPanel } from './thread-panel';

export function ChatTranscript() {
  const workspaceId = studioFocusWorkspaceId(useStudioLocation());
  const isHydrating = useDeskStore(
    (state) => Boolean(workspaceId) && state.hydrated[workspaceId ?? ''] !== 'ready',
  );
  const agent = useSelectedAgent();
  const thread = useSelectedThread();
  const threads = useAgentThreads(agent?.id ?? null);
  const mountedIds = useMountedThreadIds(agent?.id ?? null, thread?.id ?? null, threads);

  if (!agent) {
    return null;
  }

  if (isHydrating) {
    return <ChatSkeleton />;
  }

  if (!thread) {
    return <NoThreads agent={agent} />;
  }

  return (
    <div className="relative h-full min-h-0" data-testid="chat-transcript-stack">
      {mountedIds.map((threadId) => {
        const active = threadId === thread.id;
        return (
          <div
            key={threadId}
            data-testid={active ? 'chat-transcript' : undefined}
            className={cn(
              'absolute inset-0 min-h-0 transition-opacity duration-150 ease-out',
              active ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0',
            )}
            aria-hidden={!active}
          >
            <ThreadPanel threadId={threadId} agent={agent} />
          </div>
        );
      })}
    </div>
  );
}

function useMountedThreadIds(
  agentId: string | null,
  activeId: string | null,
  threads: Thread[],
): string[] {
  const agentRef = useRef<string | null>(null);
  const mountedRef = useRef<string[]>([]);

  if (agentRef.current !== agentId) {
    agentRef.current = agentId;
    mountedRef.current = preferThreadIds(threads, activeId);
  }

  const existing = new Set(threads.map((item) => item.id));
  let mounted = mountedRef.current.filter((id) => existing.has(id));

  if (activeId && existing.has(activeId) && !mounted.includes(activeId)) {
    mounted = [activeId, ...mounted].slice(0, MAX_MOUNTED_THREADS);
  } else if (activeId && existing.has(activeId)) {
    mounted = [activeId, ...mounted.filter((id) => id !== activeId)];
  }

  if (mounted.length === 0 && threads.length > 0) {
    mounted = preferThreadIds(threads, activeId);
  }

  mountedRef.current = mounted;
  return mounted;
}

function preferThreadIds(threads: Thread[], activeId: string | null): string[] {
  const ranked = [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const ids = ranked.map((item) => item.id);
  if (activeId && ids.includes(activeId)) {
    return [activeId, ...ids.filter((id) => id !== activeId)].slice(0, MAX_MOUNTED_THREADS);
  }
  return ids.slice(0, MAX_MOUNTED_THREADS);
}
