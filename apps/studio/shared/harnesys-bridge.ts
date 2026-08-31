import type {
  AgentGenerationSettings,
  AgentMemoryConfig,
  AgentPaths,
  PermissionGate,
  PortRef,
  SessionEvent,
  ToolOutputSettings,
} from 'harnesys';
import {
  DEFAULT_TOOL_OUTPUT_HEAD_CHARS,
  DEFAULT_TOOL_OUTPUT_MAX_CHARS,
  DEFAULT_TOOL_OUTPUT_TAIL_CHARS,
  filterGenerationSettings,
  THRESHOLD_SUMMARY_NAME,
  withChatGenerationParameters,
} from 'harnesys';

export type {
  AgentGenerationSettings,
  AgentMemoryConfig,
  AgentPaths,
  PortRef,
  SessionEvent,
  ToolOutputSettings,
};
export {
  DEFAULT_TOOL_OUTPUT_HEAD_CHARS,
  DEFAULT_TOOL_OUTPUT_MAX_CHARS,
  DEFAULT_TOOL_OUTPUT_TAIL_CHARS,
  filterGenerationSettings,
  THRESHOLD_SUMMARY_NAME,
  withChatGenerationParameters,
};
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

export type ToolPermission = PermissionGate;
