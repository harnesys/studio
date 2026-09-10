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

/** Workspace meta dir written by the runtime (mcp, skills, threads, tool-outputs). */
export const WORKSPACE_META_DIR = '.harnesys';

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
