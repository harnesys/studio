import type { Thread } from '@/entities/thread';

export type ThreadTreeNode = { thread: Thread; children: ThreadTreeNode[] };

export function buildThreadTree(threads: Thread[]): ThreadTreeNode[] {
  const byId = new Map<string, ThreadTreeNode>(
    threads.map((thread) => [thread.id, { thread, children: [] }]),
  );
  const roots: ThreadTreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.thread.parentThreadId ? byId.get(node.thread.parentThreadId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  for (const node of byId.values()) {
    node.children.sort((a, b) =>
      (a.thread.createdAt ?? a.thread.updatedAt).localeCompare(
        b.thread.createdAt ?? b.thread.updatedAt,
      ),
    );
  }
  roots.sort((a, b) => {
    const pinDelta = Number(b.thread.pinned === true) - Number(a.thread.pinned === true);
    if (pinDelta !== 0) {
      return pinDelta;
    }
    return b.thread.updatedAt.localeCompare(a.thread.updatedAt);
  });
  return roots;
}

export function countSubtree(node: ThreadTreeNode): number {
  return node.children.reduce((sum, child) => sum + countSubtree(child), 1);
}

export function subtreeHas(node: ThreadTreeNode, threadId: string): boolean {
  if (node.thread.id === threadId) {
    return true;
  }
  return node.children.some((child) => subtreeHas(child, threadId));
}
