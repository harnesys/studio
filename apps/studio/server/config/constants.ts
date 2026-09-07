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
export const DB_FILE = 'studio.db';

/** Limits */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** SSE */
export const SSE_KEEP_ALIVE_MS = 4000;

/** FS */
export const FILES_WATCHER_DEBOUNCE_MS = 200;
