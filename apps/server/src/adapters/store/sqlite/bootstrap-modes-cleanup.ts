import { DEFAULT_MODE_ID } from '@harnesys/studio-shared';
import { eq } from 'drizzle-orm';
import type { StudioDb } from './connection.ts';
import { agentsTable } from './schema/agents.ts';
import { modePresetsTable } from './schema/mode-presets.ts';
export function cleanupReservedModeIds(db: StudioDb): void {
  db.delete(modePresetsTable).where(eq(modePresetsTable.id, DEFAULT_MODE_ID)).run();
  for (const row of db.select().from(agentsTable).all()) {
    try {
      const parsed: unknown = JSON.parse(row.modesJson);
      if (!Array.isArray(parsed)) {
        continue;
      }
      const kept = parsed.filter(
        (mode) =>
          !mode ||
          typeof mode !== 'object' ||
          (
            mode as {
              id?: unknown;
            }
          ).id !== DEFAULT_MODE_ID,
      );
      if (kept.length !== parsed.length) {
        db.update(agentsTable)
          .set({ modesJson: JSON.stringify(kept) })
          .where(eq(agentsTable.id, row.id))
          .run();
      }
    } catch {}
  }
}
