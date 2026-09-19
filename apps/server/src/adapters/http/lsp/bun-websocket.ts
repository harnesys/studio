import { createBunWebSocket } from 'hono/bun';

/**
 * Single shared instance for the whole server: the `websocket` handlers must be
 * passed to Bun.serve (index.ts) and `upgradeWebSocket` used by controllers.
 */
export const { upgradeWebSocket, websocket } = createBunWebSocket();
