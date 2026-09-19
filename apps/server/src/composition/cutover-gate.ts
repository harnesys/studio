import { existsSync } from 'node:fs';
import {
  defaultHomePath,
  studioDbBakPath,
  studioDbPath,
  workspaceDbPath,
} from '../adapters/store/studio-layout.ts';
import { logger } from '../config/logger.ts';
import type { HostNodeRecord } from '../domain/machine-config.ts';

export type CutoverGateResult = { ok: true } | { ok: false; reason: string };

/**
 * Boot gate after Phase 4b:
 * - `studio.db` still present and a ready node lacks `workspace.db` → refuse API
 * - `studio.db.bak` (or no legacy file) and every ready node has `workspace.db` → ok
 * - no nodes → ok (empty desk)
 */
export function evaluateCutoverGate(
  nodes: HostNodeRecord[],
  home: string = defaultHomePath(),
): CutoverGateResult {
  const legacy = studioDbPath(home);
  const bak = studioDbBakPath(home);
  const ready = nodes.filter((node) => existsSync(node.path));
  if (ready.length === 0) {
    return { ok: true };
  }

  const missing = ready.filter((node) => !existsSync(workspaceDbPath(node.path)));
  if (existsSync(legacy) && missing.length > 0) {
    return {
      ok: false,
      reason:
        `studio.db is still present and ${missing.length} node(s) lack workspace.db. ` +
        `Stop the host and run: bun run cutover (in apps/server). ` +
        `Missing: ${missing.map((n) => n.id).join(', ')}`,
    };
  }

  if (missing.length > 0 && existsSync(bak)) {
    return {
      ok: false,
      reason:
        `studio.db.bak exists but ${missing.length} node(s) lack workspace.db. ` +
        `Re-run: bun run cutover. Missing: ${missing.map((n) => n.id).join(', ')}`,
    };
  }

  if (missing.length > 0) {
    return {
      ok: false,
      reason:
        `${missing.length} ready node(s) lack workspace.db. ` +
        `Create/cutover before serving API. Missing: ${missing.map((n) => n.id).join(', ')}`,
    };
  }

  return { ok: true };
}

export function logCutoverRefusal(reason: string): void {
  logger.error({ scope: 'boot' }, reason);
}
