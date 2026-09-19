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
export type HookPayload = {
  event: HookEventName;
  session_id: string;
  run_id: string;
  agent_id: string;
  thread_id: string;
  cwd: string;
  permission_mode: string;
  source?: 'startup' | 'resume' | 'clear' | 'compact' | 'fork';
  trigger?: 'manual' | 'auto';
  tool_name?: string;
  tool_input?: unknown;
  tool_use_id?: string;
  tool_output?: unknown;
  failure_reason?: string;
  tool_results?: unknown[];
  agent_type?: string;
  notification?: {
    type: string;
    text: string;
  };
  file_path?: string;
  model?: {
    provider: string;
    model: string;
  };
  usage?: {
    steps: number;
    tokens: number;
    cost?: number;
  };
  node?: {
    id: string;
    type: string;
  };
  reason?: string;
  message?: string;
};
export type HookEffect =
  | {
      kind: 'block';
      reason: string;
    }
  | {
      kind: 'context';
      text: string;
    }
  | {
      kind: 'update_input';
      input: unknown;
    }
  | {
      kind: 'update_output';
      output: unknown;
    }
  | {
      kind: 'ask';
      reason: string;
    }
  | {
      kind: 'stop';
      reason?: string;
    };
export type HookCommandShell = 'bash' | 'powershell';
export type HookHandler =
  | {
      type: 'command';
      command: string;
      args?: string[];
      shell?: HookCommandShell;
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
  | {
      type: 'prompt';
      prompt: string;
      model?: string;
      timeoutS?: number;
    }
  | {
      type: 'agent';
      prompt: string;
      model?: string;
      timeoutS?: number;
    }
  | {
      type: 'inline';
      fn: (payload: HookPayload) => HookEffect[] | undefined | Promise<HookEffect[] | undefined>;
    };
export type HookMatcher = {
  event: HookEventName;
  matcher?: string;
};
export type HookBinding = HookMatcher & {
  id: string;
  origin: 'plugin' | 'agent' | 'host';
  handler: HookHandler;
  vars: {
    pluginRoot: string;
    pluginData: string;
  };
};
export type HooksBinding = HookMatcher & {
  handler: HookHandler;
  when?: 'agent' | 'mode';
};
