import type { GitFileStatus, GitFileStatusMap } from '../../../shared/types.ts';

export function parsePorcelain(raw: string): GitFileStatusMap {
  const map: GitFileStatusMap = {};
  if (!raw) {
    return map;
  }
  const parts = raw.split('\0');
  for (const entry of parts) {
    if (!entry || entry.length < 3) {
      continue;
    }
    const xy = entry.slice(0, 2);
    const path = entry.slice(3);
    if (!path) {
      continue;
    }
    map[path] = xyToStatus(xy);
  }
  return map;
}

export function xyToStatus(xy: string): GitFileStatus {
  if (xy === '??') {
    return 'untracked';
  }
  if (xy === '!!') {
    return 'ignored';
  }
  const x = xy[0] ?? ' ';
  const y = xy[1] ?? ' ';
  if (x === 'U' || y === 'U' || xy === 'AA' || xy === 'DD') {
    return 'conflicted';
  }
  if (x === '?' || y === '?') {
    return 'untracked';
  }
  if (x !== ' ' && x !== '?' && x !== '!' && y === ' ') {
    if (x === 'A') {
      return 'added';
    }
    if (x === 'D') {
      return 'deleted';
    }
    if (x === 'R') {
      return 'renamed';
    }
    return 'staged';
  }
  if (y !== ' ') {
    return 'modified';
  }
  if (x === 'A') {
    return 'added';
  }
  return 'modified';
}

export function statusRank(status: GitFileStatus): number {
  switch (status) {
    case 'conflicted':
      return 6;
    case 'modified':
      return 5;
    case 'staged':
    case 'added':
      return 4;
    case 'renamed':
      return 3;
    case 'untracked':
      return 2;
    case 'deleted':
      return 1;
    case 'ignored':
      return 0;
    default:
      return -1;
  }
}
