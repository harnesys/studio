// biome-ignore-all lint/suspicious/noConfusingVoidType: brief specifies HookHandler.inline void union verbatim
/**
 * Полный набор hook-событий: 33 события контракта Claude Code плюс
 * 4 Harnesys-события (PreModelCall, PostModelCall, NodeStart, NodeEnd).
 */
export type HookEventName =
  | 'SessionStart'
  | 'SessionEnd'
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'PostToolBatch'
  | 'Stop'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'PreCompact'
  | 'PostCompact'
  | 'Notification'
  | 'PermissionRequest'
  | 'PermissionDenied'
  | 'FileChanged'
  | 'Setup'
  | 'UserPromptExpansion'
  | 'MessageDisplay'
  | 'TeammateIdle'
  | 'TaskCreated'
  | 'TaskCompleted'
  | 'WorktreeCreate'
  | 'WorktreeRemove'
  | 'ConfigChange'
  | 'CwdChanged'
  | 'DirectoryAdded'
  | 'InstructionsLoaded'
  | 'StopFailure'
  | 'PreModelSwitch'
  | 'PostModelSwitch'
  | 'Elicitation'
  | 'ElicitationResult'
  | 'PreModelCall'
  | 'PostModelCall'
  | 'NodeStart'
  | 'NodeEnd';

/**
 * События, которые рантайм диспатчит сам: 20 = 16 нативных Claude плюс 4 Harnesys-события.
 * PreModelCall/PostModelCall/NodeStart/NodeEnd — Harnesys-namespace, вне Claude-контракта,
 * биндятся как нативные.
 */
export const NATIVE_HOOK_EVENTS: readonly HookEventName[] = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PostToolBatch',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'PostCompact',
  'Notification',
  'PermissionRequest',
  'PermissionDenied',
  'FileChanged',
  'PreModelCall',
  'PostModelCall',
  'NodeStart',
  'NodeEnd',
];

/** Остальные 17 событий Claude, включая Setup: контракт их знает, рантайм не диспатчит. */
export const UNSUPPORTED_HOOK_EVENTS: readonly HookEventName[] = [
  'Setup',
  'UserPromptExpansion',
  'MessageDisplay',
  'TeammateIdle',
  'TaskCreated',
  'TaskCompleted',
  'WorktreeCreate',
  'WorktreeRemove',
  'ConfigChange',
  'CwdChanged',
  'DirectoryAdded',
  'InstructionsLoaded',
  'StopFailure',
  'PreModelSwitch',
  'PostModelSwitch',
  'Elicitation',
  'ElicitationResult',
];

/** Полезная нагрузка события: общие поля контекста плюс опциональные поля по типу события. */
export type HookPayload = {
  event: HookEventName;
  session_id: string;
  run_id: string;
  agent_id: string;
  thread_id: string;
  cwd: string;
  permission_mode: string;
  source?: 'startup' | 'resume' | 'clear' | 'compact' | 'fork'; // SessionStart
  trigger?: 'manual' | 'auto'; // *Compact
  tool_name?: string; // tool events
  tool_input?: unknown; // tool events
  tool_use_id?: string; // tool events
  tool_output?: unknown; // PostToolUse
  failure_reason?: string; // PostToolUseFailure
  tool_results?: unknown[]; // PostToolBatch
  agent_type?: string; // Subagent*
  notification?: { type: string; text: string }; // Notification
  file_path?: string; // FileChanged
  model?: { provider: string; model: string }; // Pre/PostModelCall
  usage?: { steps: number; tokens: number; cost?: number }; // PostModelCall
  node?: { id: string; type: string }; // NodeStart/NodeEnd
  reason?: string; // SessionEnd, PermissionDenied
  message?: string; // UserPromptSubmit; в stdin сериализуется полем `prompt` (спека §2.1)
};

/** Эффект, который возвращает обработчик: что рантайм делает после срабатывания. */
export type HookEffect =
  | { kind: 'block'; reason: string }
  | { kind: 'context'; text: string }
  | { kind: 'update_input'; input: unknown }
  | { kind: 'update_output'; output: unknown }
  | { kind: 'ask'; reason: string }
  | { kind: 'stop'; reason?: string };

/** Шесть видов обработчиков: command, http, mcp_tool, prompt, agent, inline. */
export type HookHandler =
  | {
      type: 'command';
      command: string;
      args?: string[];
      timeoutS?: number;
      async?: boolean;
      env?: Record<string, string>;
    }
  | {
      type: 'http';
      url: string;
      headers?: Record<string, string>;
      timeoutS?: number;
    }
  | {
      type: 'mcp_tool';
      server: string;
      tool: string;
      input?: Record<string, string>;
      timeoutS?: number;
    }
  | { type: 'prompt'; prompt: string; model?: string; timeoutS?: number }
  | { type: 'agent'; prompt: string; model?: string; timeoutS?: number } // inert до hook-verifier рантайма
  | {
      type: 'inline';
      fn: (payload: HookPayload) => HookEffect[] | void | Promise<HookEffect[] | void>;
    }; // host-код; парсеры не производят, origin 'host' без grant-фильтра

/** Событие плюс опциональный matcher. */
export type HookMatcher = { event: HookEventName; matcher?: string };

/** Привязка в hook-подсистеме: id стабилен между обновлениями источника привязки. */
export type HookBinding = HookMatcher & {
  id: string; // плагинные: `${plugin}:${event}:${sha1(canonicalHandlerJson).slice(0,8)}`; агентные: `${agentId}:${event}:${n}`; host: `${source}:${event}:${n}` — стабилен между обновлениями плагина
  origin: 'plugin' | 'agent' | 'host';
  handler: HookHandler;
  vars: { pluginRoot: string; pluginData: string }; // агентные биндинги: обе paths = workspace cwd; host-биндинги vars не читают
};

/** Декларативная форма биндинга в AgentDefinition. */
export type HooksBinding = HookMatcher & {
  handler: HookHandler;
  when?: 'agent' | 'mode';
};
