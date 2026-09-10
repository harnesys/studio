import type { PermissionMap } from './ports/permissions.ts';
import type { RunLifecycleStatus } from './ports/run-lifecycle-store.ts';

// Paths
export const WORKSPACE_META_DIR = '.harnesys';

// Files / shell / http
export const DEFAULT_MAX_READ_CHARS = 64_000;
export const DEFAULT_SHELL_TIMEOUT_MS = 30_000;
export const MAX_SHELL_TIMEOUT_MS = 600_000;
export const DEFAULT_LIST_DIR_LIMIT = 500;
export const DEFAULT_GREP_MAX_RESULTS = 100;
export const BINARY_PROBE_BYTES = 8192;
export const DEFAULT_READ_LIMIT = 400;
export const MAX_READ_LINES = 2000;
export const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
export const MAX_HTTP_TIMEOUT_MS = 600_000;

export const DEFAULT_PATH_BLOCKLIST = [
  '.env',
  '.env.*',
  '**/.ssh/**',
  '**/.gnupg/**',
  '**/.aws/**',
  '**/id_rsa',
  '**/id_ed25519',
  '**/*.pem',
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  'dist',
];

// Tool output defaults
export const DEFAULT_TOOL_OUTPUT_MAX_CHARS = 30_000;
export const DEFAULT_TOOL_OUTPUT_HEAD_CHARS = 8_000;
export const DEFAULT_TOOL_OUTPUT_TAIL_CHARS = 8_000;

// Run engine
export const JOURNAL_BATCH = 16;
export const IDLE_BACKSTOP_MS = 5_000;
export const DEFAULT_LIST_LIMIT = 50;
export const DEFAULT_ASK_TTL_MS = 7 * 24 * 3600 * 1000;
export const DEFAULT_LEASE_TTL_MS = 15_000;
export const DEFAULT_LEASE_RENEW_MS = 5_000;
export const DEFAULT_CLAIMER_SWEEP_MS = 5_000;
export const DEFAULT_CLAIMABLE_LIMIT = 10;

// Catalog / exposure
export const MAX_CATALOG_ENTRIES = 60;
export const MAX_CATALOG_CHARS = 4000;
export const MAX_ENTRIES = 40;
export const MAX_CHARS = 4000;
export const MAX_BATCH = 16;
export const MIN_PREFIX_LEN = 8;
export const STREAM_CHUNK_SIZE = 6;
export const LOAD_TOOLS_NAME = 'load_tools';

// Memory pack defaults
export const DEFAULT_PIN_BUDGET_TOKENS = 1500;
export const DEFAULT_PIN_MAX_ITEMS = 32;
export const DEFAULT_EPISODIC_TOP_K = 8;
export const DEFAULT_EPISODIC_INDEX_ON_COMPACT = true;
export const DEFAULT_KNOWLEDGE_TOP_K = 5;
export const DEFAULT_SEMANTIC_AUTO_PROJECT_SESSION = false;
export const DEFAULT_SEMANTIC_AUTO_PROJECT_LONG = true;
export const DEFAULT_SEMANTIC_PROJECT_LIMIT = 20;
export const DEFAULT_SEMANTIC_PROJECT_BUDGET_TOKENS = 800;

// Protocol names
export const EVENT_TYPES = {
  RUN_STARTED: 'run.started',
  RUN_COMPLETED: 'run.completed',
  RUN_FAILED: 'run.failed',
  RUN_NEEDS_INPUT: 'run.needs_input',
  CANCELLED: 'run.cancelled',
  RUN_TIMED_OUT: 'run.timed_out',
  RUN_BUDGET_EXCEEDED: 'run.budget_exceeded',
  RUN_DEAD_LETTERED: 'run.dead_lettered',
  NODE_SCHEDULED: 'node.scheduled',
  NODE_STARTED: 'node.started',
  NODE_COMPLETED: 'node.completed',
  NODE_FAILED: 'node.failed',
  STATE_COMMITTED: 'state.committed',
  USER_MESSAGE: 'user.message',
  MODEL_REQUESTED: 'model.requested',
  MODEL_DELTA: 'model.delta',
  MODEL_REASONING: 'model.reasoning',
  MODEL_REASONING_START: 'model.reasoning-start',
  MODEL_REASONING_END: 'model.reasoning-end',
  MODEL_TOOL_INPUT_START: 'model.tool-input-start',
  MODEL_TOOL_INPUT_DELTA: 'model.tool-input-delta',
  MODEL_TOOL_INPUT_END: 'model.tool-input-end',
  MODEL_TOOL_CALL: 'model.tool-call',
  MODEL_SOURCE: 'model.source',
  MODEL_FILE: 'model.file',
  MODEL_CHUNK: 'model.chunk',
  MODEL_COMPLETED: 'model.completed',
  MODEL_FAILED: 'model.failed',
  TOOL_REQUESTED: 'tool.requested',
  TOOL_COMPLETED: 'tool.completed',
  TOOL_FAILED: 'tool.failed',
  CONTROL_INTERRUPT: 'control.interrupt',
  CONTROL_APPROVAL: 'control.approval',
  CONTROL_POLICY: 'control.policy',
  CONTROL_BUDGET: 'control.budget',
  CONTROL_CANCELLATION: 'control.cancellation',
  CONTROL_REPAIR: 'control.repair',
  AGENT_SPAWNED: 'agent.spawned',
  AGENT_HANDOFF: 'agent.handoff',
  AGENT_COMPLETED: 'agent.completed',
  AGENT_FAILED: 'agent.failed',
  WORK_ISSUED: 'work.issued',
  WORK_COMPLETED: 'work.completed',
  WORK_FAILED: 'work.failed',
} as const;

export const THRESHOLD_SUMMARY_NAME = 'threshold-summary';
export const ASK_SCHEMA_KEYS = ['options', 'multi', 'allowText'] as const;
export const DRIVERS = [
  'openai',
  'openai-compatible',
  'anthropic',
  'openrouter',
  'google',
  'groq',
  'mistral',
  'xai',
  'together',
  'kimi',
  'zai',
  'ollama',
  'ollama-cloud',
  'nvidia',
  'cerebras',
  'minimax',
  'xiaomi',
  'qwen',
  'alibaba',
  'moonshotai',
] as const;
export const PLAN_ITEM_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
] as const;
export const PLAN_STATUSES = [
  'draft',
  'approved',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export const SUBAGENT_ROLES = ['explore', 'coder', 'verifier', 'general'] as const;
export const PERMISSION_MODES = ['ask', 'auto', 'dont_ask', 'bypass'] as const;
export const SCHEDULE_HISTORIES = ['none', 'last', 'all'] as const;
export const RUN_NON_TERMINAL: RunLifecycleStatus[] = ['queued', 'running', 'needs_input'];
export const ASK_USER_TOOL = 'ask_user';
export const AGENTS_SPAWN_TOOL = 'agents_spawn';
export const AGENTS_HANDOFF_TOOL = 'agents_handoff';
export const STATE_SPAWNS_KEY = 'spawns';
export const STATE_HANDOFF_AGENT_ID_KEY = 'handoffAgentId';
export const NODE_CHECKPOINT_KEY = '$nodeCheckpoint_';
export const DENIED_TOOLS_KEY = '$deniedTools';
export const SANDBOX_DENY_PREFIX = 'denied in subagent context: ';
export const CHAT_GENERATION_PARAMETERS = [
  'temperature',
  'top_p',
  'top_k',
  'frequency_penalty',
  'presence_penalty',
  'seed',
  'max_tokens',
  'max_completion_tokens',
] as const;

// Media
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
export const AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'];
export const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg'];
export const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.ts': 'application/typescript',
};
export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const;

// Provider default URLs
export const ANTHROPIC_DEFAULT_URL = 'https://api.anthropic.com/v1';
export const NVIDIA_DEFAULT_URL = 'https://integrate.api.nvidia.com/v1';
export const KIMI_DEFAULT_URL = 'https://api.moonshot.ai/v1';
export const CEREBRAS_DEFAULT_URL = 'https://api.cerebras.ai/v1';
export const TOGETHER_DEFAULT_URL = 'https://api.together.xyz/v1';
export const MOONSHOTAI_DEFAULT_URL = 'https://api.moonshot.ai/v1';
export const ALIBABA_DEFAULT_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
export const MISTRAL_DEFAULT_URL = 'https://api.mistral.ai/v1';
export const MINIMAX_DEFAULT_URL = 'https://api.minimax.io/v1';
export const OLLAMA_DEFAULT_URL = 'http://localhost:11434';
export const OLLAMA_CLOUD_DEFAULT_URL = 'https://ollama.com';
export const OPENROUTER_DEFAULT_URL = 'https://openrouter.ai/api/v1';
export const GROQ_DEFAULT_URL = 'https://api.groq.com/openai/v1';
export const OPENAI_COMPATIBLE_DEFAULT_URL = 'https://host/v1';
export const XIAOMI_DEFAULT_URL = 'https://api.xiaomimimo.com/v1';
export const OPENAI_DEFAULT_URL = 'https://api.openai.com/v1';
export const GOOGLE_DEFAULT_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const QWEN_DEFAULT_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
export const ZAI_DEFAULT_URL = 'https://api.z.ai/api/paas/v4';
export const XAI_DEFAULT_URL = 'https://api.x.ai/v1';

// Permissions
export const DEFAULT_PERMISSIONS: PermissionMap = {
  'fs.read': 'allow',
  'fs.write': 'ask',
  process: 'ask',
  network: 'ask',
  mcp: 'ask',
};

// Compaction prompts
export const SUMMARY_SYSTEM_PROMPT = `Output exactly the Markdown structure shown inside <template> and keep the section order unchanged. Do not include the <template> tags in your response.
<template>
## Objective
- [one or two brief sentences describing what the user is trying to accomplish]

## Important Details
- [constraints/preferences, decisions and why, important facts/assumptions, exact context needed to continue, or "(none)"]

## Work State
### Completed
- [finished work, verified facts, or changes made; otherwise "(none)"]

### Active
- [current work, partial changes, or investigation state; otherwise "(none)"]

### Blocked
- [blockers, failing commands, or unknowns; otherwise "(none)"]

## Next Move
1. [immediate concrete action, or "(none)"]
2. [next action if known, or "(none)"]

## Relevant Files
- [file or directory path: why it matters, or "(none)"]
</template>

Rules:
- Tools are not available in this pass. Respond with the summary text only; never call tools.
- Keep every section, even when empty.
- Use terse bullets, not prose paragraphs.
- Preserve exact file paths, symbols, commands, error strings, URLs, and identifiers when known.
- Do not mention the summary process or that context was compacted.
- Use only facts from the source.`;

export const SUMMARY_USER_PROMPT = 'Write the compaction summary now.';

// Validate
export const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
export const RESERVED = new Set([
  'input',
  'state',
  'output',
  'resume',
  'messages',
  'toolCalls',
  'finishReason',
  'text',
]);

// Misc maps
export const LLM_CHUNK_EVENTS: Record<string, string> = {
  delta: 'model.delta',
  'reasoning-delta': 'model.reasoning',
  'reasoning-start': 'model.reasoning-start',
  'reasoning-end': 'model.reasoning-end',
  'tool-input-start': 'model.tool-input-start',
  'tool-input-delta': 'model.tool-input-delta',
  'tool-input-end': 'model.tool-input-end',
  'tool-call': 'model.tool-call',
  source: 'model.source',
  file: 'model.file',
  chunk: 'model.chunk',
};

export const PASSTHROUGH_MODEL_EVENTS = new Set([
  'model.delta',
  'model.reasoning',
  'model.reasoning-start',
  'model.reasoning-end',
  'model.tool-input-start',
  'model.tool-input-delta',
  'model.tool-input-end',
  'model.tool-call',
  'model.source',
  'model.file',
  'model.stats',
]);

// Token estimate
export const CHARS_PER_TOKEN_ESTIMATE = 4;
