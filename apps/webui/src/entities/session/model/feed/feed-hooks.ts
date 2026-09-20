import { useSessionStore } from '../session.store';
import type { MapInfo, SpawnInfo, ThreadFeed, ThreadFeeds } from './feed-types';

export function useThreadFeeds(threadId: string | null): ThreadFeeds | undefined {
  return useSessionStore((state) => (threadId ? state.feeds[threadId] : undefined));
}

export function useThreadFeed(threadId: string | null): ThreadFeed | undefined {
  return useSessionStore((state) => (threadId ? state.feeds[threadId]?.own : undefined));
}

export function useInheritedFeed(threadId: string | null): ThreadFeed | undefined {
  return useSessionStore((state) => (threadId ? state.feeds[threadId]?.inherited : undefined));
}

export function useFeedSpawn(threadId: string | null, spawnId: string): SpawnInfo | undefined {
  return useSessionStore((state) => {
    const feeds = threadId ? state.feeds[threadId] : undefined;
    if (!feeds) {
      return undefined;
    }
    return (
      feeds.own.spawns.find((spawn) => spawn.spawnId === spawnId) ??
      feeds.inherited.spawns.find((spawn) => spawn.spawnId === spawnId)
    );
  });
}

export function useFeedSpawns(threadId: string | null): SpawnInfo[] {
  return useSessionStore((state) => {
    const feeds = threadId ? state.feeds[threadId] : undefined;
    if (!feeds) {
      return [];
    }
    if (feeds.inherited.spawns.length === 0) {
      return feeds.own.spawns;
    }
    if (feeds.own.spawns.length === 0) {
      return feeds.inherited.spawns;
    }
    return [...feeds.inherited.spawns, ...feeds.own.spawns];
  });
}

export function useFeedMap(threadId: string | null, toolCallId: string): MapInfo | undefined {
  return useSessionStore((state) => {
    const feeds = threadId ? state.feeds[threadId] : undefined;
    if (!feeds) {
      return undefined;
    }
    return (
      feeds.own.maps.find((map) => map.toolCallId === toolCallId) ??
      feeds.inherited.maps.find((map) => map.toolCallId === toolCallId)
    );
  });
}
