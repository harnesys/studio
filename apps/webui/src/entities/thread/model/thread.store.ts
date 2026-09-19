import { threadsForAgent } from '@harnesys/studio-shared';
import { create } from 'zustand';

import { latestThread, type Thread } from './thread';

type ThreadStore = {
  items: Thread[];
  /** Whether the open transcript for this thread is stuck to the bottom edge. */
  viewingAtEnd: Record<string, boolean>;
  byId: (id: string) => Thread | undefined;
  forAgent: (agentId: string) => Thread[];
  latestForAgent: (agentId: string) => Thread | undefined;
  hasUnreadForAgent: (agentId: string) => boolean;
  create: (agentId: string, title?: string) => Thread | null;
  upsert: (thread: Thread) => void;
  replaceWorkspace: (workspaceId: string, threads: Thread[]) => void;
  markRead: (threadId: string) => void;
  markUnread: (threadId: string) => void;
  setPinned: (threadId: string, pinned: boolean) => void;
  setViewingAtEnd: (threadId: string, atEnd: boolean) => void;
  isViewingAtEnd: (threadId: string) => boolean;
  touch: (threadId: string) => void;
  remove: (threadId: string) => void;
  removeForAgent: (agentId: string) => string[];
};

export const useThreadStore = create<ThreadStore>((set, get) => ({
  items: [],
  viewingAtEnd: {},

  byId: (id) => get().items.find((item) => item.id === id),

  forAgent: (agentId) => threadsForAgent(get().items, agentId),

  latestForAgent: (agentId) => latestThread(get().forAgent(agentId)),

  hasUnreadForAgent: (agentId) =>
    get()
      .forAgent(agentId)
      .some((item) => item.unread),

  create: (agentId, title = 'New thread') => {
    if (!agentId) {
      return null;
    }
    const thread: Thread = {
      id: crypto.randomUUID(),
      agentId,
      originAgentId: agentId,
      title,
      kind: 'chat',
      updatedAt: new Date().toISOString(),
      unread: false,
    };
    set((state) => ({ items: [...state.items, thread] }));
    return thread;
  },

  upsert: (thread) => {
    set((state) => ({
      items: state.items.some((item) => item.id === thread.id)
        ? state.items.map((item) => (item.id === thread.id ? thread : item))
        : [...state.items, thread],
    }));
  },

  replaceWorkspace: (workspaceId, threads) => {
    set((state) => ({
      items: [...state.items.filter((item) => item.workspaceId !== workspaceId), ...threads],
    }));
  },

  markRead: (threadId) => {
    const current = get().items.find((item) => item.id === threadId);
    if (!current?.unread) {
      return;
    }
    set((state) => ({
      items: state.items.map((item) => (item.id === threadId ? { ...item, unread: false } : item)),
    }));
  },

  markUnread: (threadId) => {
    const current = get().items.find((item) => item.id === threadId);
    if (!current || current.unread) {
      return;
    }
    set((state) => ({
      items: state.items.map((item) => (item.id === threadId ? { ...item, unread: true } : item)),
    }));
  },

  setPinned: (threadId, pinned) => {
    set((state) => ({
      items: state.items.map((item) => (item.id === threadId ? { ...item, pinned } : item)),
    }));
  },

  setViewingAtEnd: (threadId, atEnd) => {
    set((state) => {
      if (state.viewingAtEnd[threadId] === atEnd) {
        return state;
      }
      return {
        viewingAtEnd: { ...state.viewingAtEnd, [threadId]: atEnd },
      };
    });
  },

  isViewingAtEnd: (threadId) => Boolean(get().viewingAtEnd[threadId]),

  touch: (threadId) => {
    const now = new Date().toISOString();
    set((state) => ({
      items: state.items.map((item) =>
        item.id === threadId ? { ...item, updatedAt: now, unread: false } : item,
      ),
    }));
  },

  remove: (threadId) => {
    set((state) => {
      const { [threadId]: _, ...viewingAtEnd } = state.viewingAtEnd;
      return {
        items: state.items.filter((item) => item.id !== threadId),
        viewingAtEnd,
      };
    });
  },

  removeForAgent: (agentId) => {
    const removed = threadsForAgent(get().items, agentId).map((item) => item.id);
    const removedIds = new Set(removed);
    set((state) => {
      const viewingAtEnd = { ...state.viewingAtEnd };
      for (const id of removed) {
        delete viewingAtEnd[id];
      }
      return {
        items: state.items.filter((item) => !removedIds.has(item.id)),
        viewingAtEnd,
      };
    });
    return removed;
  },
}));
