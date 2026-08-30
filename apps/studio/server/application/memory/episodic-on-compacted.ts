import type { CompactedRange, EpisodicPort, PortRef } from 'harnesys';

export type EpisodicOnCompactedInput = {
  episodic: EpisodicPort;
  workspaceId: string;
  threadId: string;
  episodicRef: PortRef | undefined;
};

/** Host hook: after CompactionEntry, index covered journal range when enabled. */
export function createEpisodicOnCompacted(
  input: EpisodicOnCompactedInput,
): (range: CompactedRange) => Promise<void> {
  return async (range) => {
    const ref = input.episodicRef;
    if (ref == null) {
      return;
    }
    if (!indexOnCompactEnabled(ref)) {
      return;
    }
    if (!input.episodic.index) {
      return;
    }
    await input.episodic.index({
      workspaceId: input.workspaceId,
      threadId: input.threadId,
      fromSeq: range.fromSeq,
      toSeq: range.toSeq,
      compactionEntryId: range.compactionEntryId,
    });
  };
}

function indexOnCompactEnabled(ref: Exclude<PortRef, null>): boolean {
  const value = ref.spec?.indexOnCompact;
  return value !== false;
}
