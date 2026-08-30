import type {
  AgentEntry,
  AgentRunStatus,
  AgentStep,
  AgentStepStatus,
  AnswerInput,
  CompactionEntry,
  CompactionPayload,
  CompactionPayloadStats,
  ConfirmDecision,
  GenerationUsage,
  HitlBatchSnapshot,
  HumanEntry,
  Journal,
  JournalAttachment,
  JournalAttachmentKind,
  JournalEntry,
  StreamEvent,
  SystemEntry,
  TokenUsage,
} from 'harnesys';

export {
  isAgentEntry,
  isBuiltinStep,
  isCompactionEntry,
  isHumanEntry,
  isSystemEntry,
  isTextAttachment,
} from 'harnesys';

export type {
  AgentEntry,
  AgentRunStatus,
  AgentStep,
  AgentStepStatus,
  AnswerInput,
  CompactionEntry,
  CompactionPayload,
  CompactionPayloadStats,
  ConfirmDecision,
  GenerationUsage,
  HitlBatchSnapshot,
  HumanEntry,
  Journal,
  JournalAttachment,
  JournalAttachmentKind,
  JournalEntry,
  StreamEvent,
  SystemEntry,
  TokenUsage,
};

/** Studio attachment helpers still use this name. */
export type ThreadAttachment = JournalAttachment;
export type ThreadAttachmentKind = JournalAttachmentKind;

export const THREAD_KINDS = ['chat', 'schedule'] as const;
export type ThreadKind = (typeof THREAD_KINDS)[number];

export type ThreadRecord = {
  id: string;
  title: string;
  agentId: string;
  agentName: string;
  workspaceId: string;
  kind: ThreadKind;
  createdAt: string;
  updatedAt: string;
  lastReadAt: string;
  unread: boolean;
  journal: Journal;
};

export type ThreadSummary = Pick<
  ThreadRecord,
  | 'id'
  | 'title'
  | 'agentId'
  | 'agentName'
  | 'workspaceId'
  | 'kind'
  | 'createdAt'
  | 'updatedAt'
  | 'lastReadAt'
  | 'unread'
>;

/** Accepted send: live agent entry id (= AgentRun.id). */
export type AcceptedRunResponse = {
  runId: string;
  status: 'accepted';
  journal: Journal;
};

/** Manual `/compact`: journal after the phase; `compacted` when a CompactionEntry was written. */
export type CompactThreadResponse = {
  journal: Journal;
  compacted: boolean;
};

export function addGenerationUsage(
  left: GenerationUsage | undefined,
  right: GenerationUsage,
): GenerationUsage {
  if (!left) {
    return right;
  }
  return {
    input: left.input + right.input,
    output: left.output + right.output,
    cacheRead: sumOptional(left.cacheRead, right.cacheRead),
    cacheWrite: sumOptional(left.cacheWrite, right.cacheWrite),
    reasoning: sumOptional(left.reasoning, right.reasoning),
    total: sumOptional(left.total, right.total),
    ms: sumOptional(left.ms, right.ms),
  };
}

function sumOptional(left?: number, right?: number): number | undefined {
  if (left == null && right == null) {
    return undefined;
  }
  return (left ?? 0) + (right ?? 0);
}
