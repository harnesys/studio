import type { AgentBudget, WebhookStatus } from '@harnesys/studio-shared';
import type { RunLifecycleStatus } from 'harnesys';

/** HTTP */
export const DEFAULT_PORT = 3000;

/** Paths */
export const HOME_DIR_NAME = '.harnesys';
/** Workspace meta dir: same name as host home (`<workspace>/.harnesys`). Legacy: `.studio`. */
export const STUDIO_DIR = HOME_DIR_NAME;
export const STUDIO_DIR_LEGACY = '.studio';
export const WORKSPACES_DIR = 'workspaces';
export const ATTACHMENTS_DIR = 'attachments';
/** Skills folder name under host home and under workspace meta. */
export const SKILLS_DIR = 'skills';
/** Host-wide plugin checkouts (`~/.harnesys/plugins/<name>`). */
export const PLUGINS_DIR = 'plugins';
/** Per-plugin PLUGIN_DATA (`~/.harnesys/plugins-data/<name>`). */
export const PLUGINS_DATA_DIR = 'plugins-data';
/** Marketplace checkouts (`~/.harnesys/marketplaces/<id>`). */
export const MARKETPLACES_DIR = 'marketplaces';
export const DEFAULT_PLUGIN_REGISTRY_SOURCE = 'anthropics/claude-plugins-official';
export const DB_FILE = 'studio.db';
/** NDJSON trace logs: `<home>/logs/studio-YYYY-MM-DD.log`. */
export const LOGS_DIR = 'logs';

/** Safety / skip */
export const SAFETY_NAMES = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  '.turbo',
  '.cache',
  'coverage',
  HOME_DIR_NAME,
  STUDIO_DIR_LEGACY,
]);

/** Limits */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const KNOWLEDGE_MAX_SIZE_BYTES = 2_000_000;
export const DEFAULT_CHUNK_CHARS = 1200;
export const DEFAULT_OVERLAP = 150;
export const SCHEDULE_PEEK_OUTPUT_LIMIT = 2000;
export const DEFAULT_LIST_LIMIT = 50;
export const AUTO_THREAD_TITLE_MAX_CHARS = 28;
export const TRACE_PREVIEW_LIMIT = 240;
export const EMBEDDING_ERROR_PREVIEW_CHARS = 240;
export const KNOWLEDGE_EMBED_BATCH_SIZE = 64;
export const CHARS_PER_TOKEN_ESTIMATE = 4;

/** SSE */
export const SSE_KEEP_ALIVE_MS = 4000;

/** Intervals / TTL */
export const FILES_WATCHER_DEBOUNCE_MS = 200;
export const DESK_PUBLISH_DEBOUNCE_MS = 150;
export const DEFAULT_ASK_TICK_INTERVAL_MS = 60_000;
/** Poll due control:wait timers; keep short so delayMs sleeps feel timely. */
export const DEFAULT_WAIT_TICK_INTERVAL_MS = 1_000;
export const EXPIRED_ASKS_BATCH = 50;
export const ASK_TTL_DEFAULT_MS = 7 * 24 * 3600 * 1000;
export const DEFAULT_SCHEDULE_TICK_INTERVAL_MS = 15_000;
export const KNOWLEDGE_WATCH_ENSURE_INTERVAL_MS = 30_000;
export const GIT_TIMEOUT_MS = 5000;
export const GIT_SLOW_THRESHOLD_MS = 800;
export const CLAIMER_SWEEP_MS = 5_000;
export const KNOWLEDGE_INDEX_SLOW_FILE_MS = 5000;
export const KNOWLEDGE_EMBED_SLOW_MS = 8000;
export const OLLAMA_EMBED_KEEP_ALIVE = '10m';

/** Knowledge */
export const KNOWLEDGE_TEXT_EXTS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.html',
  '.htm',
  '.yaml',
  '.yml',
  '.toml',
  '.xml',
  '.csv',
  '.rs',
  '.go',
  '.py',
  '.sh',
  '.sql',
]);

export const DEFAULT_KNOWLEDGE_SETTINGS = {
  entireWorkspace: false,
  backend: 'fts' as const,
  embedProvider: null,
  embedModel: null,
  watchEnabled: true,
};

/** Agent / thread / webhook defaults */
/** Default ReAct graph is cyclic; structural validate needs a step/deadline limit. */
export const DEFAULT_REACT_BUDGET: AgentBudget = { maxSteps: 50, policy: 'ask' };
export const DEFAULT_THREAD_TITLE = 'New thread';

/** Policy */
export const MUTATE_OPS = ['fs.write'] as const;
/** Shell. Plan mode denies this; write stays on MUTATE_OPS. */
export const PROCESS_OPS = ['process'] as const;
/** Fetch + MCP. Plan mode allows these for research. */
export const RESEARCH_OPS = ['network', 'mcp'] as const;
export const EXTERNAL_OPS = [...PROCESS_OPS, ...RESEARCH_OPS] as const;

/** Naming */
export const PRESETS_DIR = 'agent-creator/presets';
export const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
export const PRESET_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Status sets */
/** Хост-политика спеки §2.4: SessionStart-хуки не держат старт рана дольше 30s (у Claude событие 600s). */
export const PLUGIN_SESSION_START_HOOK_TIMEOUT_MS = 30_000;

export const WEBHOOK_STATUSES: readonly WebhookStatus[] = ['active', 'paused', 'failed'];
export const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed', 'cancelled']);
export const CONFLICT_CODES = new Set([
  'unknown_interrupt',
  'already_resumed',
  'run_terminal',
  'lease_stale',
  'already_queued',
]);
export const RUN_NON_TERMINAL_STATUSES: RunLifecycleStatus[] = [
  'queued',
  'running',
  'needs_input',
  'waiting',
];

/** SQLite */
export const SQLITE_PRAGMAS = [
  'PRAGMA journal_mode = WAL',
  'PRAGMA foreign_keys = ON',
  'PRAGMA synchronous = NORMAL',
] as const;
