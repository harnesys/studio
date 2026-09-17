import { IDE_WORKSPACES_STORAGE_KEY } from '@/shared/config/constants';
import type { IdeTab, IdeTabKind } from './ide.store';
import { collapseLayout, type IdeGroup, type IdeWorkspaceState } from './ide-layout';

export function tabIdFor(kind: IdeTabKind, key: string): string {
  return `${kind}:${key}`;
}

export function normalizeIdeFilePath(path: string): string {
  return path.replace(/^\/+/, '');
}

function normalizeIdeFileTab(tab: IdeTab): IdeTab {
  if (tab.kind !== 'file' || !tab.path) {
    return tab;
  }
  const path = normalizeIdeFilePath(tab.path);
  return { ...tab, path, id: tabIdFor('file', path) };
}

export function sanitizeWorkspace(ws: IdeWorkspaceState): IdeWorkspaceState | null {
  const remapped = new Map<string, string>();
  const tabs = dedupeTabs(
    ws.tabs.map((tab) => {
      const normalized = normalizeIdeFileTab(tab);
      if (normalized.id !== tab.id) {
        remapped.set(tab.id, normalized.id);
      }
      return normalized;
    }),
  );
  const remapId = (id: string): string => remapped.get(id) ?? id;
  const groups = ws.groups.map((group) => ({
    ...group,
    tabIds: [...new Set(group.tabIds.map(remapId))],
    activeId: group.activeId ? remapId(group.activeId) : null,
  }));
  const normalized: IdeWorkspaceState = {
    ...ws,
    tabs,
    groups,
    activeId: ws.activeId ? remapId(ws.activeId) : null,
  };
  const alive = new Set(
    tabs
      .filter(
        (t) =>
          t.kind === 'thread' ||
          t.kind === 'file' ||
          t.kind === 'spawn' ||
          t.kind === 'diff' ||
          t.kind === 'schedule' ||
          t.kind === 'webhook',
      )
      .map((t) => t.id),
  );
  if (alive.size === tabs.length && groups.every((g) => g.tabIds.every((id) => alive.has(id)))) {
    return normalized;
  }
  let layout = normalized.layout;
  const kept: IdeGroup[] = [];
  for (const group of groups) {
    const tabIds = group.tabIds.filter((id) => alive.has(id));
    if (tabIds.length === 0) {
      if (layout) {
        layout = collapseLayout(layout, group.id);
      }
      continue;
    }
    kept.push({
      ...group,
      tabIds,
      activeId:
        group.activeId && alive.has(group.activeId)
          ? group.activeId
          : (tabIds[tabIds.length - 1] ?? null),
    });
  }
  const aliveTabs = tabs.filter((t) => alive.has(t.id));
  if (kept.length === 0) {
    return null;
  }
  const activeId =
    normalized.activeId && alive.has(normalized.activeId) ? normalized.activeId : null;
  const activeGroupId =
    normalized.activeGroupId && kept.some((g) => g.id === normalized.activeGroupId)
      ? normalized.activeGroupId
      : (kept[0]?.id ?? null);
  return { tabs: aliveTabs, activeId, activeGroupId, groups: kept, layout };
}

function dedupeTabs(tabs: IdeTab[]): IdeTab[] {
  const seen = new Set<string>();
  return tabs.filter((tab) => {
    if (seen.has(tab.id)) {
      return false;
    }
    seen.add(tab.id);
    return true;
  });
}

export function loadPersisted(): Record<string, IdeWorkspaceState> {
  try {
    const raw = localStorage.getItem(IDE_WORKSPACES_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('byWorkspace' in parsed)) {
      return {};
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
    return valid;
  } catch {
    return {};
  }
}

export function persist(byWorkspace: Record<string, IdeWorkspaceState>) {
  try {
    localStorage.setItem(IDE_WORKSPACES_STORAGE_KEY, JSON.stringify({ byWorkspace }));
  } catch {
    // ignore quota / private mode
  }
}
