import type { Context } from 'hono';
import { getConnInfo } from 'hono/bun';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
export function isLoopbackPeer(c: Context): boolean {
  try {
    const address = getConnInfo(c).remote.address;
    return typeof address === 'string' && LOOPBACK.has(address);
  } catch {
    return false;
  }
}
