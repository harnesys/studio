import { create } from 'zustand';
import type { LspBridgeStatus } from './lsp-bridge';
export type LspSessionEntry = {
  path: string;
  languageId: string;
  status: LspBridgeStatus;
};
const EMPTY_SESSIONS: LspSessionEntry[] = [];
type LspSessionsState = {
  byWorkspace: Record<string, LspSessionEntry[]>;
  upsert: (workspaceId: string, entry: LspSessionEntry) => void;
  remove: (workspaceId: string, path: string) => void;
};
export const useLspSessionsStore = create<LspSessionsState>((set) => ({
  byWorkspace: {},
  upsert: (workspaceId, entry) =>
    set((state) => {
      const list = state.byWorkspace[workspaceId] ?? EMPTY_SESSIONS;
      const idx = list.findIndex((item) => item.path === entry.path);
      if (idx === -1) {
        return { byWorkspace: { ...state.byWorkspace, [workspaceId]: [...list, entry] } };
      }
      const current = list[idx];
      if (current && current.languageId === entry.languageId && current.status === entry.status) {
        return state;
      }
      return {
        byWorkspace: {
          ...state.byWorkspace,
          [workspaceId]: list.map((item, i) => (i === idx ? entry : item)),
        },
      };
    }),
  remove: (workspaceId, path) =>
    set((state) => {
      const list = state.byWorkspace[workspaceId];
      if (!list) {
        return state;
      }
      return {
        byWorkspace: {
          ...state.byWorkspace,
          [workspaceId]: list.filter((item) => item.path !== path),
        },
      };
    }),
}));
export function useLspSessions(workspaceId: string | null): LspSessionEntry[] {
  return useLspSessionsStore((state) =>
    workspaceId ? (state.byWorkspace[workspaceId] ?? EMPTY_SESSIONS) : EMPTY_SESSIONS,
  );
}
