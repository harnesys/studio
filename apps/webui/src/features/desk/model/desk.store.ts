import type { WorkspaceMoveItem } from '@harnesys/studio-shared';
import { create } from 'zustand';
import { remapWorkspaceOpenFiles } from './desk-path-remap';
export type InspectorTab = 'inspector' | 'memory';
export type AgentFileTab = {
  path: string;
  dirty: boolean;
};
export type AgentOpenFiles = {
  tabs: AgentFileTab[];
  activePath: string | null;
};
export type WorkspaceFileTab = AgentFileTab;
export type WorkspaceOpenFiles = AgentOpenFiles;
export type DeskHydrateStatus = 'pending' | 'ready';
type DeskState = {
  inspectorTab: InspectorTab;
  inspectorOpen: boolean;
  hydrated: Record<string, DeskHydrateStatus>;
  focusedThreadId: string | null;
  filesByAgentId: Record<string, AgentOpenFiles>;
  filesByWorkspaceId: Record<string, WorkspaceOpenFiles>;
};
type DeskStore = DeskState & {
  setHydrateStatus: (workspaceId: string, status: DeskHydrateStatus | null) => void;
  setFocusedThreadId: (threadId: string | null) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  toggleInspector: () => void;
  setInspectorOpen: (open: boolean) => void;
  openAgentFile: (agentId: string, path: string) => void;
  closeAgentFile: (agentId: string, path: string) => void;
  setActiveAgentFile: (agentId: string, path: string) => void;
  setAgentFileDirty: (agentId: string, path: string, dirty: boolean) => void;
  openWorkspaceFile: (workspaceId: string, path: string) => void;
  closeWorkspaceFile: (workspaceId: string, path: string) => void;
  setActiveWorkspaceFile: (workspaceId: string, path: string) => void;
  setWorkspaceFileDirty: (workspaceId: string, path: string, dirty: boolean) => void;
  remapWorkspaceFiles: (workspaceId: string, moves: WorkspaceMoveItem[]) => void;
};
const emptyFiles = (): AgentOpenFiles => ({ tabs: [], activePath: null });
const initialDesk: DeskState = {
  inspectorTab: 'inspector',
  inspectorOpen: false,
  hydrated: {},
  focusedThreadId: null,
  filesByAgentId: {},
  filesByWorkspaceId: {},
};
export const useDeskStore = create<DeskStore>((set) => ({
  ...initialDesk,
  setHydrateStatus: (workspaceId, status) =>
    set((state) => {
      if (status === null) {
        if (!(workspaceId in state.hydrated)) {
          return state;
        }
        const { [workspaceId]: _, ...hydrated } = state.hydrated;
        return { hydrated };
      }
      if (state.hydrated[workspaceId] === status) {
        return state;
      }
      return { hydrated: { ...state.hydrated, [workspaceId]: status } };
    }),
  setFocusedThreadId: (threadId) => set({ focusedThreadId: threadId }),
  setInspectorTab: (tab) => set({ inspectorTab: tab }),
  toggleInspector: () => set((state) => ({ inspectorOpen: !state.inspectorOpen })),
  setInspectorOpen: (open) => set({ inspectorOpen: open }),
  openAgentFile: (agentId, path) =>
    set((state) => {
      const current = state.filesByAgentId[agentId] ?? emptyFiles();
      const existing = current.tabs.find((tab) => tab.path === path);
      if (existing) {
        return {
          filesByAgentId: {
            ...state.filesByAgentId,
            [agentId]: { ...current, activePath: path },
          },
        };
      }
      return {
        filesByAgentId: {
          ...state.filesByAgentId,
          [agentId]: {
            tabs: [...current.tabs, { path, dirty: false }],
            activePath: path,
          },
        },
      };
    }),
  closeAgentFile: (agentId, path) =>
    set((state) => {
      const current = state.filesByAgentId[agentId];
      if (!current) {
        return state;
      }
      const tabs = current.tabs.filter((tab) => tab.path !== path);
      if (tabs.length === 0) {
        const next = { ...state.filesByAgentId };
        delete next[agentId];
        return { filesByAgentId: next };
      }
      const activePath =
        current.activePath === path ? (tabs[tabs.length - 1]?.path ?? null) : current.activePath;
      return {
        filesByAgentId: {
          ...state.filesByAgentId,
          [agentId]: { tabs, activePath },
        },
      };
    }),
  setActiveAgentFile: (agentId, path) =>
    set((state) => {
      const current = state.filesByAgentId[agentId];
      if (!current?.tabs.some((tab) => tab.path === path)) {
        return state;
      }
      return {
        filesByAgentId: {
          ...state.filesByAgentId,
          [agentId]: { ...current, activePath: path },
        },
      };
    }),
  setAgentFileDirty: (agentId, path, dirty) =>
    set((state) => {
      const current = state.filesByAgentId[agentId];
      if (!current) {
        return state;
      }
      return {
        filesByAgentId: {
          ...state.filesByAgentId,
          [agentId]: {
            ...current,
            tabs: current.tabs.map((tab) => (tab.path === path ? { ...tab, dirty } : tab)),
          },
        },
      };
    }),
  openWorkspaceFile: (workspaceId, path) =>
    set((state) => {
      const current = state.filesByWorkspaceId[workspaceId] ?? emptyFiles();
      const existing = current.tabs.find((tab) => tab.path === path);
      if (existing) {
        return {
          filesByWorkspaceId: {
            ...state.filesByWorkspaceId,
            [workspaceId]: { ...current, activePath: path },
          },
        };
      }
      return {
        filesByWorkspaceId: {
          ...state.filesByWorkspaceId,
          [workspaceId]: {
            tabs: [...current.tabs, { path, dirty: false }],
            activePath: path,
          },
        },
      };
    }),
  closeWorkspaceFile: (workspaceId, path) =>
    set((state) => {
      const current = state.filesByWorkspaceId[workspaceId];
      if (!current) {
        return state;
      }
      const tabs = current.tabs.filter((tab) => tab.path !== path);
      if (tabs.length === 0) {
        const next = { ...state.filesByWorkspaceId };
        delete next[workspaceId];
        return { filesByWorkspaceId: next };
      }
      const activePath =
        current.activePath === path ? (tabs[tabs.length - 1]?.path ?? null) : current.activePath;
      return {
        filesByWorkspaceId: {
          ...state.filesByWorkspaceId,
          [workspaceId]: { tabs, activePath },
        },
      };
    }),
  setActiveWorkspaceFile: (workspaceId, path) =>
    set((state) => {
      const current = state.filesByWorkspaceId[workspaceId];
      if (!current?.tabs.some((tab) => tab.path === path)) {
        return state;
      }
      return {
        filesByWorkspaceId: {
          ...state.filesByWorkspaceId,
          [workspaceId]: { ...current, activePath: path },
        },
      };
    }),
  setWorkspaceFileDirty: (workspaceId, path, dirty) =>
    set((state) => {
      const current = state.filesByWorkspaceId[workspaceId];
      if (!current) {
        return state;
      }
      return {
        filesByWorkspaceId: {
          ...state.filesByWorkspaceId,
          [workspaceId]: {
            ...current,
            tabs: current.tabs.map((tab) => (tab.path === path ? { ...tab, dirty } : tab)),
          },
        },
      };
    }),
  remapWorkspaceFiles: (workspaceId, moves) =>
    set((state) => {
      const current = state.filesByWorkspaceId[workspaceId];
      if (!current || moves.length === 0) {
        return state;
      }
      const remapped = remapWorkspaceOpenFiles(current, moves);
      if (remapped === current) {
        return state;
      }
      return {
        filesByWorkspaceId: { ...state.filesByWorkspaceId, [workspaceId]: remapped },
      };
    }),
}));
