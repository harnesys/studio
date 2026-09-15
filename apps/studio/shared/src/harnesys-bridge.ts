import type {
  AgentGenerationSettings,
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
} from 'harnesys/domain';

export type { AgentGenerationSettings, AgentPaths, PortRef, SessionEvent, ToolOutputSettings };
export {
  DEFAULT_TOOL_OUTPUT_HEAD_CHARS,
  DEFAULT_TOOL_OUTPUT_MAX_CHARS,
  DEFAULT_TOOL_OUTPUT_TAIL_CHARS,
  filterGenerationSettings,
  THRESHOLD_SUMMARY_NAME,
  withChatGenerationParameters,
};
export type AgentProjectPaths = AgentPaths;

export type ToolPermission = PermissionGate;
