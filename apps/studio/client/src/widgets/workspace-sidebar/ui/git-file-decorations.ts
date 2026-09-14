import type { GitFileStatus, GitFileStatusMap } from '@harnesys/studio-shared';

export function gitFileStatusLabel(status: GitFileStatus): string {
  switch (status) {
    case 'untracked':
      return 'U';
    case 'modified':
      return 'M';
    case 'added':
      return 'A';
    case 'deleted':
      return 'D';
    case 'staged':
      return 'S';
    case 'conflicted':
      return 'C';
    case 'renamed':
      return 'R';
    case 'ignored':
      return 'I';
    default:
      return (status as string).slice(0, 1).toUpperCase();
  }
}

export function getDirAggregatedStatus(
  dirPath: string,
  map?: GitFileStatusMap,
): GitFileStatus | undefined {
  if (!map) {
    return undefined;
  }
  const prefix = `${dirPath}/`;
  let best: GitFileStatus | undefined;
  let bestRank = -1;
  for (const [key, status] of Object.entries(map)) {
    if (key === dirPath || key.startsWith(prefix)) {
      const rank = statusRank(status as GitFileStatus);
      if (rank > bestRank) {
        bestRank = rank;
        best = status as GitFileStatus;
      }
    }
  }
  return best;
}

function statusRank(status: GitFileStatus): number {
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
