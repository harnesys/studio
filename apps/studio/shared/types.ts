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
} from './src/catalog.ts';
export {
  DRIVERS,
  EFFORTS,
  INCOMPLETE_FIELDS,
  isDriver,
  isEffort,
  MODALITIES,
  MODEL_FEATURES,
} from './src/catalog.ts';

import type {
  ScheduleHistory,
  McpResourceInfo as WorkspaceMcpResource,
  ToolCatalogEntry as WorkspaceTool,
} from 'harnesys';
import { SCHEDULE_HISTORIES } from 'harnesys/domain';
import type { ThreadPlanRecord } from './src/plan-types.ts';
import type { ThreadRecord as ThreadRecordType } from './src/thread.ts';

export type {
  KnowledgeHit,
  MemoryRecord,
  MemoryRecordSource,
  PackCatalogEntry,
  PackConfig,
  PinRecord,
  PinSource,
  SemanticScope,
  ToolCatalogEntry as WorkspaceTool,
} from 'harnesys';
export type {
  AgentBudget,
  AgentGraph,
  AgentGraphLayout,
  AgentGraphPosition,
  AgentGraphRankdir,
  AgentRecord,
  BudgetPolicy,
} from './src/agent.ts';
export { defaultAgentCompaction } from './src/agent-runtime-defaults.ts';
export type {
  AgentGenerationSettings,
  AgentProjectPaths,
  PortRef,
  ToolOutputSettings,
} from './src/harnesys-bridge.ts';
export {
  DEFAULT_TOOL_OUTPUT_HEAD_CHARS,
  DEFAULT_TOOL_OUTPUT_MAX_CHARS,
  DEFAULT_TOOL_OUTPUT_TAIL_CHARS,
  filterGenerationSettings,
  THRESHOLD_SUMMARY_NAME,
  withChatGenerationParameters,
} from './src/harnesys-bridge.ts';
export type {
  AskPayload,
  ConfirmPayload,
  HitlPayload,
  PermissionPayload,
} from './src/hitl-payload.ts';
export { payloadForSource } from './src/hitl-payload.ts';
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
} from './src/knowledge.ts';
export type { AgentMode, ModeOp, ModeOpGate, ModeOpPermissions, ModePreset } from './src/modes.ts';
export {
  ASK_MODE,
  DEFAULT_MODE_ID,
  effectiveMode,
  isModeId,
  MODE_ID_RE,
  MODE_OPS,
  modeFromPreset,
  PLAN_PACK_ID,
  resolveModeId,
} from './src/modes.ts';
export type {
  AddPluginRegistryRequest,
  CatalogInstallSource,
  EnableWorkspacePluginRequest,
  InstallPluginRequest,
  PluginCatalogEntry,
  PluginListItem,
  PluginLoadDiagnostic,
  PluginMutationResponse,
  PluginName,
  PluginRecord,
  PluginRegistryKind,
  PluginRegistrySummary,
  PluginSourceFormat,
  PluginSummary,
  RemovePluginRequest,
  TrustPluginRequest,
} from './src/plugin.ts';
export type {
  ImportProvidersRequest,
  ImportProvidersSummary,
  ProviderExportBundle,
  ProviderExportEntry,
  ProviderExportModel,
  ProviderModelPublic,
  ProviderPublic,
  ProviderRecord,
} from './src/provider.ts';
export {
  isScheduledHumanText,
  SCHEDULE_HUMAN_ORIGIN,
  scheduledTaskName,
  scheduledTaskText,
  visibleScheduledText,
} from './src/schedule-prompt.ts';
export type {
  AcceptedRunResponse,
  CompactThreadResponse,
  Event,
  SessionEvent,
  SessionEventType,
  Snapshot,
  ThreadActiveRun,
  ThreadAgentRef,
  ThreadKind,
  ThreadRecord,
  ThreadSummary,
} from './src/thread.ts';
export { THREAD_KINDS, threadsForAgent } from './src/thread.ts';
export type { TranscriptItem } from './src/transcript.ts';
export { toTranscript } from './src/transcript.ts';
export { WEBHOOK_HUMAN_ORIGIN, webhookTaskText } from './src/webhook-prompt.ts';

export type AttachmentKind = 'image' | 'audio' | 'video' | 'file';

export type ThreadAttachment = {
  id: string;
  kind: AttachmentKind;
  name: string;
  mediaType: string;
  path: string;
};

export type HumanEntry = {
  id: string;
  text?: string;
  createdAt: string;
  attachments?: ThreadAttachment[];
  origin?: string;
};

export const SCHEDULE_STATUSES = ['active', 'paused', 'failed'] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

/** Library SchedulerPort still speaks PermissionMode; consumed by the studio bridge only. */
export type { PermissionMode, ScheduleHistory } from 'harnesys/domain';
export { PERMISSION_MODES, SCHEDULE_HISTORIES } from 'harnesys/domain';

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
  modeId: string;
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

export type WebhookStatus = ScheduleStatus;

export type WebhookRecord = {
  id: string;
  workspaceId: string;
  name: string;
  status: ScheduleStatus;
  targetAgentId: string;
  detail: string;
  endpoint: string;
  threadId: string;
  lastFiredAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateWebhookResponse = {
  webhook: WebhookRecord;
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

/** Editable `.harnesys/mcp.json` entry merged with live connection status. */
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
} from './src/git.ts';

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

export * from './src/plan-types.ts';
export { isTextAttachment } from './src/text-attachment.ts';

export type DeskEvent =
  | { type: 'thread'; thread: ThreadRecordType }
  | { type: 'schedule'; schedule: ScheduleRecord }
  | { type: 'schedule-deleted'; id: string }
  | { type: 'plan'; plan: ThreadPlanRecord }
  | { type: 'webhook'; webhook: WebhookRecord }
  | { type: 'webhook-deleted'; id: string };
