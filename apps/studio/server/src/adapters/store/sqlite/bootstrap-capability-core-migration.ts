/** `capability_core_v1`: каждому агенту += `{"core":{}}` в `capabilities_json`
 *  (спека 2026-09-15 §2: core обязателен по правилу хоста; до флипа таргетов
 *  агент без core потерял бы ask_user/map/wait). Идемпотентно по маркеру
 *  `schema_meta`, как соседние миграции. Modes не трогаем: там core-правило с T7. */
import { eq, sql } from 'drizzle-orm';
import { logger } from '../../../config/logger.ts';
import type { StudioDb } from './connection.ts';
import { agentsTable } from './schema/agents.ts';

const MARKER = 'capability_core_v1';
const CREATE_META = sql.raw(
  'CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
);

export function migrateCapabilityCore(db: StudioDb): void {
  db.run(CREATE_META);
  const seen = db.all<{ key: string }>(sql`SELECT key FROM schema_meta WHERE key = ${MARKER}`);
  if (seen.length > 0) {
    return;
  }
  const rows = db
    .select({
      id: agentsTable.id,
      name: agentsTable.name,
      capabilitiesJson: agentsTable.capabilitiesJson,
    })
    .from(agentsTable)
    .all();
  for (const row of rows) {
    const capabilities = parseCapabilities(row.capabilitiesJson);
    if (isOnAssignment(capabilities.core)) {
      continue;
    }
    capabilities.core = {};
    db.update(agentsTable)
      .set({ capabilitiesJson: JSON.stringify(capabilities) })
      .where(eq(agentsTable.id, row.id))
      .run();
    logger.info({ scope: 'migration' }, `capability_core_v1: agent "${row.name}" granted core`);
  }
  db.run(sql`INSERT INTO schema_meta(key, value) VALUES (${MARKER}, '1')`);
}

function parseCapabilities(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Та же литеральная семантика assignment, что у резолвера: true|{}|{...} = on. */
function isOnAssignment(value: unknown): boolean {
  if (value === true) {
    return true;
  }
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
