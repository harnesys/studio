export type {
  CatalogDriver,
  DiscoveredModel,
  DiscoveredModelView,
  Driver,
  DriverEndpoint,
  Effort,
  IncompleteField,
  Modality,
  ModelArchitecture,
  ModelFeature,
  ModelFields,
  ModelHints,
  ModelKind,
  ModelOrigin,
  ModelPricing,
  ModelRecord,
  ModelTopProvider,
  StudioCatalog,
  StudioModel,
  StudioModelView,
} from './catalog.ts';
export {
  DRIVERS,
  EFFORTS,
  INCOMPLETE_FIELDS,
  isDriver,
  isEffort,
  MODALITIES,
  MODEL_FEATURES,
} from './catalog.ts';

import type {
  McpResourceInfo as WorkspaceMcpResource,
  ToolCatalogEntry as WorkspaceTool,
} from 'harnesys';
import type {
  AgentGenerationSettings,
  AgentMemoryConfig,
  PortRef,
  ToolOutputSettings,
} from './harnesys-bridge.ts';
import type { ThreadPlanRecord } from './plan-types.ts';

import type { ThreadRecord as ThreadRecordType } from './thread.ts';

export type {
  KnowledgeHit,
  McpResourceInfo as WorkspaceMcpResource,
  MemoryRecord,
  MemoryRecordSource,
  PinRecord,
  PinSource,
  SemanticScope,
  ToolCatalogEntry as WorkspaceTool,
} from 'harnesys';
export { defaultAgentCompaction, defaultAgentMemory } from './agent-runtime-defaults.ts';
export type {
  AgentGenerationSettings,
  AgentMemoryConfig,
  AgentProjectPaths,
  PortRef,
  ToolOutputSettings,
} from './harnesys-bridge.ts';
export {
  DEFAULT_TOOL_OUTPUT_HEAD_CHARS,
  DEFAULT_TOOL_OUTPUT_MAX_CHARS,
  DEFAULT_TOOL_OUTPUT_TAIL_CHARS,
  filterGenerationSettings,
  THRESHOLD_SUMMARY_NAME,
  withChatGenerationParameters,
} from './harnesys-bridge.ts';
export type {
  KnowledgeFileRecord,
  KnowledgeFileStatus,
  KnowledgeFilesByStatus,
  KnowledgeIndexState,
  KnowledgeIndexStatus,
  KnowledgeRootRecord,
  KnowledgeSettings,
  KnowledgeStats,
  MemorySearchBackend,
  UpsertKnowledgeRootRequest,
  UpsertKnowledgeSettingsRequest,
} from './knowledge.ts';
export type { ProviderModelPublic, ProviderPublic, ProviderRecord } from './provider.ts';
export {
  isScheduledHumanText,
  SCHEDULE_HUMAN_ORIGIN,
  scheduledTaskName,
  scheduledTaskText,
  visibleScheduledText,
} from './schedule-prompt.ts';
export type {
  AcceptedRunResponse,
  CompactThreadResponse,
  Event,
  SessionEvent,
  Snapshot,
  ThreadKind,
  ThreadRecord,
  ThreadSummary,
} from './thread.ts';
export { THREAD_KINDS } from './thread.ts';
export type { TranscriptItem } from './transcript.ts';
export { toTranscript } from './transcript.ts';

export type AgentRecord = {
  id: string;
  name: string;
  workspaceId: string;
  modelId?: string | null;
  role: string;
  instructions: string;
  effort?: string | null;
  generation?: AgentGenerationSettings | null;
  toolOutput?: ToolOutputSettings | null;
  compaction?: PortRef;
  memory?: AgentMemoryConfig | null;
  /** Empty = all workspace skills (omit allowlist). */
  skills?: string[];
  /** Empty = all configured MCP servers (omit allowlist). */
  mcpServers?: string[];
  /** Tool name allowlist; empty = all workspace tools. Memory tools are gated by `memory`. */
  tools?: string[];
  createdAt: string;
  updatedAt: string;
};

export type AttachmentKind = 'image' | 'audio' | 'video' | 'file';

export type ThreadAttachment = {
  id: string;
  kind: AttachmentKind;
  name: string;
  mediaType: string;
  path: string;
};

export const SCHEDULE_STATUSES = ['active', 'paused', 'failed'] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export const PERMISSION_MODES = ['ask', 'auto', 'dont_ask', 'bypass'] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];
/** `plan` is read-only planning, never sent to the library as permissionMode. */
export const RUN_MODES = [...PERMISSION_MODES, 'plan'] as const;
export type RunMode = (typeof RUN_MODES)[number];

export const SCHEDULE_HISTORIES = ['none', 'last', 'all'] as const;
export type ScheduleHistory = (typeof SCHEDULE_HISTORIES)[number];

export function isScheduleHistory(value: string): value is ScheduleHistory {
  return (SCHEDULE_HISTORIES as readonly string[]).includes(value);
}

export type ScheduleRecord = {
  id: string;
  workspaceId: string;
  name: string;
  status: ScheduleStatus;
  targetAgentId: string;
  detail: string;
  cron: string;
  mode: PermissionMode;
  history: ScheduleHistory;
  historyLast: number;
  threadId: string;
  nextRunAt?: string | null;
  lastFiredAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateScheduleResponse = {
  schedule: ScheduleRecord;
  thread: ThreadRecordType;
};
export type WorkspaceSkill = {
  name: string;
  description: string;
  whenToUse?: string;
};

export type CreateWorkspaceSkillRequest = {
  name: string;
  description: string;
  whenToUse?: string;
  instructions: string;
};

export type WorkspaceMcpTransport = 'stdio' | 'http' | 'sse';

export type WorkspaceMcpServer = {
  serverId: string;
  transport: WorkspaceMcpTransport;
  connected: boolean;
  toolCount: number;
  tools: WorkspaceTool[];
  resources: WorkspaceMcpResource[];
};

/** Editable `.studio/mcp.json` entry merged with live connection status. */
export type WorkspaceMcpConfigServer = {
  serverId: string;
  enabled: boolean;
  transport: WorkspaceMcpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  connected: boolean;
  toolCount: number;
};

export type UpsertWorkspaceMcpServerRequest = {
  enabled?: boolean;
  transport: WorkspaceMcpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
};

export type WorkspaceRecord = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
};

export type WorkspaceStatus = {
  exists: boolean;
  kind: 'folder' | 'git';
  branch?: string;
  dirty?: boolean;
};

export type {
  GitBranch,
  GitCheckoutRequest,
  GitCreateBranchRequest,
  GitDiffResponse,
  GitFileStatus,
  GitFileStatusMap,
  GitStatusBase,
  GitStatusCounts,
  GitStatusResponse,
} from './git.ts';

export type StudioErrorBody = {
  error: string;
};

export type WorkspaceFileEntry = {
  name: string;
  kind: 'file' | 'dir';
  path: string;
  size?: number;
  modifiedAt?: string;
};

export type WorkspaceFileEventKind = 'change' | 'create' | 'delete';

export type WorkspaceFileEvent = {
  kind: WorkspaceFileEventKind;
  dir: string;
  name: string;
};

export * from './plan-types.ts';

export type DeskEvent =
  | { type: 'thread'; thread: ThreadRecordType }
  | { type: 'schedule'; schedule: ScheduleRecord }
  | { type: 'schedule-deleted'; id: string }
  | { type: 'plan'; plan: ThreadPlanRecord };
