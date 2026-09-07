// Browser-safe entry: pure domain constants and helpers, no node builtins.
export { THRESHOLD_SUMMARY_NAME } from './src/domain/compaction.ts';
export type { CompactionMessage, CompactionSpec, ParsedCompactionSpec } from './src/domain/compaction.ts';
export { isCompactionMessage, parseThresholdSpec } from './src/domain/compaction.ts';
export type { AgentGenerationSettings } from './src/domain/agent-definition.ts';
export { filterGenerationSettings, withChatGenerationParameters } from './src/domain/generation-settings.ts';
export {
  DEFAULT_TOOL_OUTPUT_HEAD_CHARS,
  DEFAULT_TOOL_OUTPUT_MAX_CHARS,
  DEFAULT_TOOL_OUTPUT_TAIL_CHARS,
} from './src/domain/tool-output.ts';
export { PLAN_ITEM_STATUSES, PLAN_STATUSES, SUBAGENT_ROLES } from './src/domain/plan.ts';
export type { PlanItemStatus, PlanStatus, SubagentRole } from './src/domain/plan.ts';
export { PERMISSION_MODES, SCHEDULE_HISTORIES } from './src/domain/schedule.ts';
export type { PermissionMode, ScheduleHistory } from './src/domain/schedule.ts';
export { DRIVERS } from './src/ports/models.ts';
export { isDriver } from './src/adapters/models/binding.ts';
export type { Driver } from './src/ports/models.ts';
