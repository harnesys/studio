import type { ModeOpGate } from '@harnesys/studio-shared';
import { eq } from 'drizzle-orm';
import type { StudioDb } from './connection.ts';
import { agentsTable } from './schema/agents.ts';
import { modePresetsTable } from './schema/mode-presets.ts';

/**
 * Spec gates for the `agents` operation on builtin modes. Ids outside this
 * map are custom modes and legitimately inherit the agent base: untouched.
 */
const BUILTIN_AGENTS_GATES: Record<string, ModeOpGate> = {
  ask: 'ask',
  auto: 'ask',
  plan: 'deny',
  dont_ask: 'deny',
  bypass: 'allow',
};

function parseObject(json: string | null): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(json ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * The `agents` operation arrived after existing rows were stored: builtin
 * preset rows and agent `modes_json` copies of the five builtin ids may lack
 * the gate. Idempotent backfill; writes only when something actually changes.
 */
export function backfillAgentsModeGates(db: StudioDb): void {
  for (const row of db.select().from(modePresetsTable).all()) {
    if (!row.builtin) {
      continue;
    }
    const gate = Object.hasOwn(BUILTIN_AGENTS_GATES, row.id)
      ? BUILTIN_AGENTS_GATES[row.id]
      : undefined;
    const perms = parseObject(row.permissionsJson);
    if (gate === undefined || !perms || perms.agents !== undefined) {
      continue;
    }
    db.update(modePresetsTable)
      .set({ permissionsJson: JSON.stringify({ ...perms, agents: gate }) })
      .where(eq(modePresetsTable.id, row.id))
      .run();
  }

  for (const row of db.select().from(agentsTable).all()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.modesJson);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) {
      continue;
    }
    let changed = false;
    const next = parsed.map((mode) => {
      const rec =
        mode && typeof mode === 'object' && !Array.isArray(mode)
          ? (mode as Record<string, unknown>)
          : null;
      const gate =
        rec && typeof rec.id === 'string' && Object.hasOwn(BUILTIN_AGENTS_GATES, rec.id)
          ? BUILTIN_AGENTS_GATES[rec.id]
          : undefined;
      if (!rec || gate === undefined) {
        return mode;
      }
      const perms =
        rec.permissions && typeof rec.permissions === 'object' && !Array.isArray(rec.permissions)
          ? { ...(rec.permissions as Record<string, unknown>) }
          : {};
      if (perms.agents !== undefined) {
        return mode;
      }
      perms.agents = gate;
      changed = true;
      return { ...rec, permissions: perms };
    });
    if (changed) {
      db.update(agentsTable)
        .set({ modesJson: JSON.stringify(next) })
        .where(eq(agentsTable.id, row.id))
        .run();
    }
  }
}
