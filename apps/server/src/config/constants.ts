import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { AgentBudget, WebhookStatus } from '@harnesys/studio-shared';
import type { RunLifecycleStatus } from 'harnesys';
export const DEFAULT_PORT = 47474;
export const HOME_DIR_NAME = '.harnesys';
export const STUDIO_DIR = HOME_DIR_NAME;
export const STUDIO_DIR_LEGACY = '.studio';
export const WORKSPACES_DIR = 'workspaces';
export const ATTACHMENTS_DIR = 'attachments';
export const SKILLS_DIR = 'skills';
export const PLUGINS_DIR = 'plugins';
export const PLUGINS_DATA_DIR = 'plugins-data';
export const MARKETPLACES_DIR = 'marketplaces';
export const DEFAULT_PLUGIN_REGISTRY_SOURCE = 'anthropics/claude-plugins-official';
export const DB_FILE = 'studio.db';
export const DB_BAK_FILE = 'studio.db.bak';
export const WORKSPACE_DB_FILE = 'workspace.db';
export const CONFIG_FILE = 'config.json';
export const LOGS_DIR = 'logs';
export const BUNDLED_ASSETS_ENV = 'HARNESYS_BUNDLED_ASSETS';
export const SOURCE_ASSETS_DIR = join(import.meta.dir, '..', '..', 'assets');
export function bundledAssetsRoot(): string {
  const override = process.env[BUNDLED_ASSETS_ENV]?.trim();
  if (override) {
    return resolve(override);
  }
  const sibling = join(dirname(process.execPath), 'assets');
  if (existsSync(sibling)) {
    return sibling;
  }
  return SOURCE_ASSETS_DIR;
}
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
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const KNOWLEDGE_MAX_SIZE_BYTES = 2000000;
export const DEFAULT_CHUNK_CHARS = 1200;
export const DEFAULT_OVERLAP = 150;
export const SCHEDULE_PEEK_OUTPUT_LIMIT = 2000;
export const DEFAULT_LIST_LIMIT = 50;
export const AUTO_THREAD_TITLE_MAX_CHARS = 28;
export const TRACE_PREVIEW_LIMIT = 240;
export const EMBEDDING_ERROR_PREVIEW_CHARS = 240;
export const KNOWLEDGE_EMBED_BATCH_SIZE = 64;
export const CHARS_PER_TOKEN_ESTIMATE = 4;
export const SSE_KEEP_ALIVE_MS = 4000;
export const FILES_WATCHER_DEBOUNCE_MS = 200;
export const DESK_PUBLISH_DEBOUNCE_MS = 150;
export const DEFAULT_ASK_TICK_INTERVAL_MS = 60000;
export const DEFAULT_WAIT_TICK_INTERVAL_MS = 1000;
export const EXPIRED_ASKS_BATCH = 50;
export const ASK_TTL_DEFAULT_MS = 7 * 24 * 3600 * 1000;
export const DEFAULT_SCHEDULE_TICK_INTERVAL_MS = 15000;
export const KNOWLEDGE_WATCH_ENSURE_INTERVAL_MS = 30000;
export const GIT_TIMEOUT_MS = 5000;
export const GIT_SLOW_THRESHOLD_MS = 800;
export const CLAIMER_SWEEP_MS = 5000;
export const KNOWLEDGE_INDEX_SLOW_FILE_MS = 5000;
export const KNOWLEDGE_EMBED_SLOW_MS = 8000;
export const OLLAMA_EMBED_KEEP_ALIVE = '10m';
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
export const DEFAULT_REACT_BUDGET: AgentBudget = { maxSteps: 50, policy: 'ask' };
export const DEFAULT_THREAD_TITLE = 'New thread';
export const MUTATE_OPS = ['fs.write'] as const;
export const PROCESS_OPS = ['process'] as const;
export const RESEARCH_OPS = ['network', 'mcp'] as const;
export const EXTERNAL_OPS = [...PROCESS_OPS, ...RESEARCH_OPS] as const;
export const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
export const PRESET_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
export const PLUGIN_SESSION_START_HOOK_TIMEOUT_MS = 30000;
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
export const SQLITE_PRAGMAS = [
  'PRAGMA journal_mode = WAL',
  'PRAGMA foreign_keys = ON',
  'PRAGMA synchronous = NORMAL',
] as const;
