import type { WorkspaceMoveItem } from '@harnesys/studio-shared';
import { create } from 'zustand';
import {
  closeGroupState,
  closeTabState,
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
import { remapWorkspacePaths } from './ide-path-remap';
import { loadPersisted, normalizeIdeFilePath, persist, tabIdFor } from './ide-persist';

export { firstGroupOfLayout, type IdeSplitNode, lastGroupOfLayout } from './ide-tree';

export type IdeTabKind = 'thread' | 'file' | 'spawn' | 'diff';
export type IdeTab = {
  id: string;
  kind: IdeTabKind;
  workspaceId: string;
  agentId?: string;
  threadId?: string;
  spawnId?: string;
  path?: string;
  dirty?: boolean;
};
export type { IdeGroup, IdeSplitSide, IdeWorkspaceState } from './ide-layout';

type IdeState = { byWorkspace: Record<string, IdeWorkspaceState> };
type IdeStore = IdeState & {
  openThread: (workspaceId: string, agentId: string, threadId: string) => void;
  openSpawn: (workspaceId: string, agentId: string, threadId: string, spawnId: string) => void;
  openFile: (workspaceId: string, path: string) => void;
  openDiff: (workspaceId: string, path: string) => void;
  closeTab: (workspaceId: string, tabId: string) => void;
  closeAll: (workspaceId: string) => void;
  setActive: (workspaceId: string, tabId: string) => void;
  setFileDirty: (workspaceId: string, path: string, dirty: boolean) => void;
  closeByEntity: (workspaceId: string, kind: IdeTabKind, entityId: string) => void;
  remapPaths: (workspaceId: string, moves: WorkspaceMoveItem[]) => void;
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

function applyWs(state: IdeState, workspaceId: string, next: IdeWorkspaceState): IdeState {
  if (next.groups.length === 0) {
    const byWorkspace = { ...state.byWorkspace };
    delete byWorkspace[workspaceId];
    return { byWorkspace };
  }
  return { byWorkspace: { ...state.byWorkspace, [workspaceId]: next } };
}

export const useIdeStore = create<IdeStore>((set) => {
  const withWs = (
    state: IdeState,
    workspaceId: string,
    next: IdeWorkspaceState | null,
  ): IdeState => (next ? applyWs(state, workspaceId, next) : state);

  return {
    byWorkspace: loadPersisted(),
    openThread: (workspaceId, agentId, threadId) =>
      set((state) => {
        const id = tabIdFor('thread', threadId);
        const tab: IdeTab = { id, kind: 'thread', workspaceId, agentId, threadId };
        return withWs(state, workspaceId, upsertTabState(pick(state, workspaceId), tab));
      }),
    openSpawn: (workspaceId, agentId, threadId, spawnId) =>
      set((state) => {
        const id = tabIdFor('spawn', `${threadId}:${spawnId}`);
        const tab: IdeTab = { id, kind: 'spawn', workspaceId, agentId, threadId, spawnId };
        return withWs(state, workspaceId, upsertTabState(pick(state, workspaceId), tab));
      }),
    openFile: (workspaceId, path) =>
      set((state) => {
        const normalized = normalizeIdeFilePath(path);
        const id = tabIdFor('file', normalized);
        const tab: IdeTab = { id, kind: 'file', workspaceId, path: normalized, dirty: false };
        return withWs(state, workspaceId, upsertTabState(pick(state, workspaceId), tab));
      }),
    openDiff: (workspaceId, path) =>
      set((state) => {
        const normalized = normalizeIdeFilePath(path);
        const id = tabIdFor('diff', normalized);
        const tab: IdeTab = { id, kind: 'diff', workspaceId, path: normalized };
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
        const id = tabIdFor('file', normalizeIdeFilePath(path));
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
          closeTabState(
            pick(state, workspaceId),
            kind === 'file'
              ? tabIdFor(kind, normalizeIdeFilePath(entityId))
              : tabIdFor(kind, entityId),
          ),
        ),
      ),
    remapPaths: (workspaceId, moves) =>
      set((state) => {
        const current = state.byWorkspace[workspaceId];
        if (!current || moves.length === 0) {
          return state;
        }
        const next = remapWorkspacePaths(current, moves);
        return next ? applyWs(state, workspaceId, next) : state;
      }),
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

useIdeStore.subscribe((state) => persist(state.byWorkspace));

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
