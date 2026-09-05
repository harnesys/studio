import { create } from 'zustand';
import { IDE_WORKSPACES_STORAGE_KEY } from '@/shared/config/constants';
import {
  closeGroupState,
  closeTabState,
  collapseLayout,
  createEmptyWorkspace,
  groupOfTab,
  type IdeGroup,
  type IdeSplitSide,
  type IdeWorkspaceState,
  moveTabState,
  setSplitRatioState,
  splitGroupState,
  upsertTabState,
  withActiveTabState,
} from './ide-layout';

export { firstGroupOfLayout, type IdeSplitNode, lastGroupOfLayout } from './ide-tree';

export type IdeTabKind = 'thread' | 'file';
export type IdeTab = {
  id: string;
  kind: IdeTabKind;
  workspaceId: string;
  agentId?: string;
  threadId?: string;
  path?: string;
  dirty?: boolean;
};
export type { IdeGroup, IdeSplitSide, IdeWorkspaceState } from './ide-layout';

type IdeState = { byWorkspace: Record<string, IdeWorkspaceState> };
type IdeStore = IdeState & {
  openThread: (workspaceId: string, agentId: string, threadId: string) => void;
  openFile: (workspaceId: string, path: string) => void;
  closeTab: (workspaceId: string, tabId: string) => void;
  closeAll: (workspaceId: string) => void;
  setActive: (workspaceId: string, tabId: string) => void;
  setFileDirty: (workspaceId: string, path: string, dirty: boolean) => void;
  closeByEntity: (workspaceId: string, kind: IdeTabKind, entityId: string) => void;
  reorderTab: (workspaceId: string, fromId: string, toId: string) => void;
  moveTab: (
    workspaceId: string,
    tabId: string,
    toGroupId: string,
    beforeTabId: string | null,
  ) => void;
  splitGroup: (workspaceId: string, groupId: string, side: IdeSplitSide) => void;
  closeGroup: (workspaceId: string, groupId: string) => void;
  setSplitRatio: (workspaceId: string, splitId: string, ratio: number) => void;
};

const EMPTY_WORKSPACE: IdeWorkspaceState = createEmptyWorkspace();
const EMPTY_IDE_TABS: IdeWorkspaceState = EMPTY_WORKSPACE;

function sanitizeWorkspace(ws: IdeWorkspaceState): IdeWorkspaceState | null {
  const alive = new Set(
    ws.tabs.filter((t) => t.kind === 'thread' || t.kind === 'file').map((t) => t.id),
  );
  if (
    alive.size === ws.tabs.length &&
    ws.groups.every((g) => g.tabIds.every((id) => alive.has(id)))
  ) {
    return ws;
  }
  let layout = ws.layout;
  const groups: IdeGroup[] = [];
  for (const group of ws.groups) {
    const tabIds = group.tabIds.filter((id) => alive.has(id));
    if (tabIds.length === 0) {
      if (layout) {
        layout = collapseLayout(layout, group.id);
      }
      continue;
    }
    groups.push({
      ...group,
      tabIds,
      activeId:
        group.activeId && alive.has(group.activeId)
          ? group.activeId
          : (tabIds[tabIds.length - 1] ?? null),
    });
  }
  const tabs = ws.tabs.filter((t) => alive.has(t.id));
  if (groups.length === 0) {
    return null;
  }
  const activeId = ws.activeId && alive.has(ws.activeId) ? ws.activeId : null;
  const activeGroupId =
    ws.activeGroupId && groups.some((g) => g.id === ws.activeGroupId)
      ? ws.activeGroupId
      : (groups[0]?.id ?? null);
  return { tabs, activeId, activeGroupId, groups, layout };
}

function loadPersisted(): IdeState {
  try {
    const raw = localStorage.getItem(IDE_WORKSPACES_STORAGE_KEY);
    if (!raw) {
      return { byWorkspace: {} };
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('byWorkspace' in parsed)) {
      return { byWorkspace: {} };
    }
    const byWorkspace = (parsed as { byWorkspace: Record<string, unknown> }).byWorkspace;
    const valid: Record<string, IdeWorkspaceState> = {};
    for (const [id, ws] of Object.entries(byWorkspace)) {
      if (
        ws &&
        typeof ws === 'object' &&
        Array.isArray((ws as IdeWorkspaceState).tabs) &&
        Array.isArray((ws as IdeWorkspaceState).groups) &&
        (ws as IdeWorkspaceState).layout
      ) {
        const sanitized = sanitizeWorkspace(ws as IdeWorkspaceState);
        if (sanitized) {
          valid[id] = sanitized;
        }
      }
    }
    return { byWorkspace: valid };
  } catch {
    return { byWorkspace: {} };
  }
}

function persist(state: IdeState) {
  try {
    localStorage.setItem(
      IDE_WORKSPACES_STORAGE_KEY,
      JSON.stringify({ byWorkspace: state.byWorkspace }),
    );
  } catch {
    // ignore quota / private mode
  }
}

function applyWs(state: IdeState, workspaceId: string, next: IdeWorkspaceState): IdeState {
  if (next.groups.length === 0) {
    const byWorkspace = { ...state.byWorkspace };
    delete byWorkspace[workspaceId];
    return { byWorkspace };
  }
  return { byWorkspace: { ...state.byWorkspace, [workspaceId]: next } };
}

function tabIdFor(kind: IdeTabKind, key: string): string {
  return `${kind}:${key}`;
}

export const useIdeStore = create<IdeStore>((set) => {
  const withWs = (
    state: IdeState,
    workspaceId: string,
    next: IdeWorkspaceState | null,
  ): IdeState => (next ? applyWs(state, workspaceId, next) : state);

  return {
    byWorkspace: loadPersisted().byWorkspace,
    openThread: (workspaceId, agentId, threadId) =>
      set((state) => {
        const id = tabIdFor('thread', threadId);
        const tab: IdeTab = { id, kind: 'thread', workspaceId, agentId, threadId };
        return withWs(state, workspaceId, upsertTabState(pick(state, workspaceId), tab));
      }),
    openFile: (workspaceId, path) =>
      set((state) => {
        const id = tabIdFor('file', path);
        const tab: IdeTab = { id, kind: 'file', workspaceId, path, dirty: false };
        return withWs(state, workspaceId, upsertTabState(pick(state, workspaceId), tab));
      }),
    closeTab: (workspaceId, tabId) =>
      set((state) => withWs(state, workspaceId, closeTabState(pick(state, workspaceId), tabId))),
    closeAll: (workspaceId) =>
      set((state) => {
        if (!state.byWorkspace[workspaceId]) {
          return state;
        }
        return applyWs(state, workspaceId, EMPTY_WORKSPACE);
      }),
    setActive: (workspaceId, tabId) =>
      set((state) =>
        withWs(state, workspaceId, withActiveTabState(pick(state, workspaceId), tabId)),
      ),
    setFileDirty: (workspaceId, path, dirty) =>
      set((state) => {
        const current = state.byWorkspace[workspaceId];
        if (!current) {
          return state;
        }
        const id = tabIdFor('file', path);
        const idx = current.tabs.findIndex((t) => t.id === id);
        if (idx === -1 || current.tabs[idx]?.dirty === dirty) {
          return state;
        }
        return applyWs(state, workspaceId, {
          ...current,
          tabs: current.tabs.map((t) => (t.id === id ? { ...t, dirty } : t)),
        });
      }),
    closeByEntity: (workspaceId, kind, entityId) =>
      set((state) =>
        withWs(
          state,
          workspaceId,
          closeTabState(pick(state, workspaceId), tabIdFor(kind, entityId)),
        ),
      ),
    reorderTab: (workspaceId, fromId, toId) =>
      set((state) => {
        const ws = pick(state, workspaceId);
        const group = groupOfTab(ws, fromId);
        if (!group) {
          return state;
        }
        return withWs(state, workspaceId, moveTabState(ws, fromId, group.id, toId));
      }),
    moveTab: (workspaceId, tabId, toGroupId, beforeTabId) =>
      set((state) =>
        withWs(
          state,
          workspaceId,
          moveTabState(pick(state, workspaceId), tabId, toGroupId, beforeTabId),
        ),
      ),
    splitGroup: (workspaceId, groupId, side) =>
      set((state) =>
        withWs(
          state,
          workspaceId,
          splitGroupState(pick(state, workspaceId), groupId, side, crypto.randomUUID()),
        ),
      ),
    closeGroup: (workspaceId, groupId) =>
      set((state) =>
        withWs(state, workspaceId, closeGroupState(pick(state, workspaceId), groupId)),
      ),
    setSplitRatio: (workspaceId, splitId, ratio) =>
      set((state) =>
        withWs(state, workspaceId, setSplitRatioState(pick(state, workspaceId), splitId, ratio)),
      ),
  };
});

useIdeStore.subscribe((state) => persist(state));

function pick(state: IdeState, workspaceId: string): IdeWorkspaceState {
  return state.byWorkspace[workspaceId] ?? EMPTY_WORKSPACE;
}

export function useIdeTabs(workspaceId: string | null) {
  return useIdeStore((state) => {
    if (!workspaceId) {
      return EMPTY_IDE_TABS;
    }
    return state.byWorkspace[workspaceId] ?? EMPTY_IDE_TABS;
  });
}

export function useIdeGroup(workspaceId: string | null, groupId: string): IdeGroup | null {
  return useIdeStore((state) => {
    if (!workspaceId) {
      return null;
    }
    return state.byWorkspace[workspaceId]?.groups.find((g) => g.id === groupId) ?? null;
  });
}

export function ideTabId(kind: IdeTabKind, key: string): string {
  return tabIdFor(kind, key);
}
