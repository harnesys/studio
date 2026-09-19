import type { PermissionMap } from 'harnesys';

/**
 * Shape-guard for the stored `permissions_json` column: malformed or
 * non-object content returns `null` (= DEFAULT_PERMISSIONS); entries with
 * non-gate values drop.
 */
export function parsePermissionMap(raw: string | null): PermissionMap | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const out: PermissionMap = {};
    for (const [op, gate] of Object.entries(parsed as Record<string, unknown>)) {
      if (gate === 'allow' || gate === 'ask' || gate === 'deny') {
        out[op] = gate;
      }
    }
    return out;
  } catch {
    return null;
  }
}
