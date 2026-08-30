import type { IdeTab } from './ide.store';
import { collapseLayout, type IdeSplitNode, type IdeSplitSide, replaceGroup } from './ide-tree';

export type { IdeSplitNode, IdeSplitSide } from './ide-tree';
export { collapseLayout, replaceGroup, setSplitRatioState } from './ide-tree';

export type IdeGroup = { id: string; tabIds: string[]; activeId: string | null };
export type IdeWorkspaceState = {
  tabs: IdeTab[];
  activeId: string | null;
  activeGroupId: string | null;
  groups: IdeGroup[];
  layout: IdeSplitNode | null;
};

export function createEmptyWorkspace(): IdeWorkspaceState {
  return { tabs: [], activeId: null, activeGroupId: null, groups: [], layout: null };
}

export function createWorkspaceWithTab(tab: IdeTab): IdeWorkspaceState {
  const groupId = crypto.randomUUID();
  return {
    tabs: [tab],
    activeId: tab.id,
    activeGroupId: groupId,
    groups: [{ id: groupId, tabIds: [tab.id], activeId: tab.id }],
    layout: { kind: 'group', groupId },
  };
}

export function findGroup(ws: IdeWorkspaceState, groupId: string): IdeGroup | null {
  return ws.groups.find((g) => g.id === groupId) ?? null;
}

export function groupOfTab(ws: IdeWorkspaceState, tabId: string): IdeGroup | null {
  return ws.groups.find((g) => g.tabIds.includes(tabId)) ?? null;
}

export function upsertTabState(ws: IdeWorkspaceState, tab: IdeTab): IdeWorkspaceState | null {
  if (ws.tabs.some((t) => t.id === tab.id)) {
    return withActiveTabState(ws, tab.id);
  }
  const target = findGroup(ws, ws.activeGroupId ?? '') ?? ws.groups[0];
  if (!target) {
    return createWorkspaceWithTab(tab);
  }
  return {
    ...ws,
    tabs: [...ws.tabs, tab],
    activeId: tab.id,
    activeGroupId: target.id,
    groups: ws.groups.map((g) =>
      g.id === target.id ? { ...g, tabIds: [...g.tabIds, tab.id], activeId: tab.id } : g,
    ),
  };
}

export function withActiveTabState(ws: IdeWorkspaceState, tabId: string): IdeWorkspaceState | null {
  const group = groupOfTab(ws, tabId);
  if (!group) {
    return null;
  }
  if (ws.activeId === tabId && ws.activeGroupId === group.id) {
    return null;
  }
  return {
    ...ws,
    activeId: tabId,
    activeGroupId: group.id,
    groups: ws.groups.map((g) => (g.id === group.id ? { ...g, activeId: tabId } : g)),
  };
}

export function closeTabState(ws: IdeWorkspaceState, tabId: string): IdeWorkspaceState | null {
  const group = groupOfTab(ws, tabId);
  if (!group) {
    return null;
  }
  const tabs = ws.tabs.filter((t) => t.id !== tabId);
  const tabIds = group.tabIds.filter((id) => id !== tabId);
  let groups = ws.groups;
  let layout = ws.layout;
  let activeGroupId = ws.activeGroupId;
  if (tabIds.length === 0) {
    groups = groups.filter((g) => g.id !== group.id);
    layout = collapseLayout(layout, group.id);
    if (activeGroupId === group.id) {
      activeGroupId = groups[0]?.id ?? null;
    }
  } else {
    const idx = group.tabIds.indexOf(tabId);
    const nextActive = tabIds[Math.min(idx, tabIds.length - 1)] ?? null;
    groups = groups.map((g) => (g.id === group.id ? { ...g, tabIds, activeId: nextActive } : g));
  }
  if (groups.length === 0) {
    return createEmptyWorkspace();
  }
  const activeId =
    ws.activeId === tabId
      ? (groups.find((g) => g.id === activeGroupId)?.activeId ?? null)
      : ws.activeId;
  return { tabs, activeId, activeGroupId, groups, layout };
}

export function moveTabState(
  ws: IdeWorkspaceState,
  tabId: string,
  toGroupId: string,
  beforeTabId: string | null,
): IdeWorkspaceState | null {
  const from = groupOfTab(ws, tabId);
  const to = findGroup(ws, toGroupId);
  if (!from || !to) {
    return null;
  }
  if (from.id === to.id) {
    return reorderInGroup(ws, from, tabId, beforeTabId);
  }
  const fromTabIds = from.tabIds.filter((id) => id !== tabId);
  let groups = ws.groups.map((g) => {
    if (g.id === from.id) {
      return { ...g, tabIds: fromTabIds, activeId: g.activeId === tabId ? null : g.activeId };
    }
    return g;
  });
  let layout = ws.layout;
  let activeGroupId = ws.activeGroupId;
  if (fromTabIds.length === 0) {
    groups = groups.filter((g) => g.id !== from.id);
    layout = collapseLayout(layout, from.id);
    if (activeGroupId === from.id) {
      activeGroupId = null;
    }
  }
  const target = groups.find((g) => g.id === to.id) ?? to;
  const insertAt = beforeTabId ? target.tabIds.indexOf(beforeTabId) : -1;
  const tabIds = [...target.tabIds];
  tabIds.splice(insertAt === -1 ? tabIds.length : insertAt, 0, tabId);
  groups = groups.map((g) => (g.id === to.id ? { ...g, tabIds, activeId: tabId } : g));
  if (groups.length === 0) {
    return createEmptyWorkspace();
  }
  if (!activeGroupId) {
    activeGroupId = groups[0]?.id ?? null;
  }
  return {
    tabs: ws.tabs,
    activeId: tabId,
    activeGroupId: to.id,
    groups,
    layout,
  };
}

function reorderInGroup(
  ws: IdeWorkspaceState,
  group: IdeGroup,
  tabId: string,
  beforeTabId: string | null,
): IdeWorkspaceState | null {
  const fromIdx = group.tabIds.indexOf(tabId);
  const toIdx = beforeTabId ? group.tabIds.indexOf(beforeTabId) : group.tabIds.length - 1;
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) {
    return null;
  }
  const tabIds = [...group.tabIds];
  const [moved] = tabIds.splice(fromIdx, 1);
  if (!moved) {
    return null;
  }
  tabIds.splice(toIdx > fromIdx ? toIdx - 1 : toIdx, 0, moved);
  return {
    ...ws,
    groups: ws.groups.map((g) => (g.id === group.id ? { ...g, tabIds } : g)),
  };
}

export function splitGroupState(
  ws: IdeWorkspaceState,
  groupId: string,
  side: IdeSplitSide,
  newGroupId: string,
): IdeWorkspaceState | null {
  const group = findGroup(ws, groupId);
  if (!group) {
    return null;
  }
  const movingId = group.activeId;
  const newGroup: IdeGroup = {
    id: newGroupId,
    tabIds: movingId ? [movingId] : [],
    activeId: movingId,
  };
  const rest: IdeGroup = {
    ...group,
    tabIds: group.tabIds.filter((id) => id !== movingId),
    activeId: group.tabIds.find((id) => id !== movingId) ?? null,
  };
  const groups = ws.groups.map((g) => (g.id === group.id ? rest : g)).concat(newGroup);
  const fresh: IdeSplitNode = { kind: 'group', groupId: newGroupId };
  const anchor: IdeSplitNode = { kind: 'group', groupId };
  const split: IdeSplitNode = {
    kind: 'split',
    splitId: crypto.randomUUID(),
    ratio: 0.5,
    first: side === 'left' ? fresh : anchor,
    second: side === 'left' ? anchor : fresh,
  };
  const layout = replaceGroup(ws.layout, groupId, split);
  return {
    tabs: ws.tabs,
    activeId: movingId ?? ws.activeId,
    activeGroupId: movingId ? newGroupId : ws.activeGroupId,
    groups,
    layout,
  };
}

export function closeGroupState(ws: IdeWorkspaceState, groupId: string): IdeWorkspaceState | null {
  const group = findGroup(ws, groupId);
  if (!group) {
    return null;
  }
  const tabs = ws.tabs.filter((t) => !group.tabIds.includes(t.id));
  const groups = ws.groups.filter((g) => g.id !== groupId);
  if (groups.length === 0) {
    return createEmptyWorkspace();
  }
  const layout = collapseLayout(ws.layout, groupId);
  const activeGroupId = ws.activeGroupId === groupId ? (groups[0]?.id ?? null) : ws.activeGroupId;
  const activeId = group.tabIds.includes(ws.activeId ?? '')
    ? (groups.find((g) => g.id === activeGroupId)?.activeId ?? null)
    : ws.activeId;
  return { tabs, activeId, activeGroupId, groups, layout };
}
