import { EDITOR_SPLIT_MAX_RATIO, EDITOR_SPLIT_MIN_RATIO } from '@/shared/config/constants';

export type IdeSplitSide = 'left' | 'right';
export type IdeSplitNode =
  | { kind: 'group'; groupId: string }
  | {
      kind: 'split';
      splitId: string;
      ratio: number;
      first: IdeSplitNode;
      second: IdeSplitNode;
    };

export function firstGroupOfLayout(node: IdeSplitNode): string {
  return node.kind === 'group' ? node.groupId : firstGroupOfLayout(node.first);
}

export function lastGroupOfLayout(node: IdeSplitNode): string {
  return node.kind === 'group' ? node.groupId : lastGroupOfLayout(node.second);
}

export function setSplitRatioState<T extends { layout: IdeSplitNode | null }>(
  ws: T,
  splitId: string,
  ratio: number,
): T | null {
  const clamped = Math.min(EDITOR_SPLIT_MAX_RATIO, Math.max(EDITOR_SPLIT_MIN_RATIO, ratio));
  const layout = updateRatio(ws.layout, splitId, clamped);
  if (layout === ws.layout) {
    return null;
  }
  return { ...ws, layout };
}

export function collapseLayout(node: IdeSplitNode | null, groupId: string): IdeSplitNode | null {
  if (!node) {
    return null;
  }
  if (node.kind === 'group') {
    return node.groupId === groupId ? null : node;
  }
  const first = collapseLayout(node.first, groupId);
  const second = collapseLayout(node.second, groupId);
  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }
  return { ...node, first, second };
}

export function replaceGroup(
  node: IdeSplitNode | null,
  groupId: string,
  replacement: IdeSplitNode,
): IdeSplitNode | null {
  if (!node) {
    return null;
  }
  if (node.kind === 'group') {
    return node.groupId === groupId ? replacement : node;
  }
  const first = replaceGroup(node.first, groupId, replacement);
  const second = replaceGroup(node.second, groupId, replacement);
  if (!first || !second) {
    return null;
  }
  return { ...node, first, second };
}

function updateRatio(node: IdeSplitNode | null, splitId: string, ratio: number) {
  if (!node) {
    return null;
  }
  if (node.kind === 'group') {
    return node;
  }
  if (node.splitId === splitId && node.ratio === ratio) {
    return node;
  }
  const first = updateRatio(node.first, splitId, ratio);
  const second = updateRatio(node.second, splitId, ratio);
  if (!first || !second) {
    return null;
  }
  return { ...node, ratio: node.splitId === splitId ? ratio : node.ratio, first, second };
}
