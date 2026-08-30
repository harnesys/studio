import type { AgentDefinition, PermissionGate, PortRef, ToolOutputSettings } from 'harnesys';
import {
  DEFAULT_TOOL_OUTPUT_HEAD_CHARS,
  DEFAULT_TOOL_OUTPUT_MAX_CHARS,
  DEFAULT_TOOL_OUTPUT_TAIL_CHARS,
  filterGenerationSettings,
  THRESHOLD_SUMMARY_NAME,
  withChatGenerationParameters,
} from 'harnesys';
import type { SessionEvent } from 'harnesys';

export {
  DEFAULT_TOOL_OUTPUT_HEAD_CHARS,
  DEFAULT_TOOL_OUTPUT_MAX_CHARS,
  DEFAULT_TOOL_OUTPUT_TAIL_CHARS,
  filterGenerationSettings,
  THRESHOLD_SUMMARY_NAME,
  withChatGenerationParameters,
};
export type { SessionEvent };

export type AgentGenerationSettings = NonNullable<AgentDefinition['model']>['generation'];

export type AgentMemoryConfig = NonNullable<AgentDefinition['memory']>;

export type AgentPaths = NonNullable<AgentDefinition['paths']>;
export type AgentProjectPaths = AgentPaths;

export type AgentSpec = {
  model: {
    provider: string;
    model: string;
    effort?: string;
    generation?: AgentGenerationSettings;
  };
  instructions?: {
    system?: string;
    project?: string[];
  };
  skills?: string[];
  mcpServers?: string[];
  tools?: string[];
  toolOutput?: ToolOutputSettings;
  compaction?: PortRef;
  memory?: AgentMemoryConfig;
};

export type AnswerInput = {
  optionIds?: string[];
  text?: string;
};

export type ConfirmDecision =
  | { allow: true; modifiedInput?: unknown }
  | { deny: true; reason?: string };

export type HitlBatchSnapshot = {
  awaiting: readonly string[];
  resumed: boolean;
};

export type ToolPermission = PermissionGate;
