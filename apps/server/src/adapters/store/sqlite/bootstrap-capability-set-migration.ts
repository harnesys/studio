/** `capability_set_v1`: данные под строгую §7-валидацию (спека 2026-09-15 §9).
 *  Однократно для каждой БД, идемпотентно по маркеру `schema_meta`:
 *  (a) колонка `agents.tools` удаляется (allowlist-снимки B6 не конвертируются
 *      в overrides — они отражают старый открытый мир; намеренные ограничения
 *      пересоздаются override'ами через UI);
 *  (b) `agents.modes_json[].packs` и `mode_presets.packs_json` массив→map
 *      (`"plan"` → `{"plan":{}}`, `[]` → `{}`);
 *  (c) merge `{"core":{}}` в непустые `modes_json[].packs` и в
 *      `agents.capabilities_json` (legacy-родители без core-ключа иначе
 *      отторгают детей по §7.2; отсутствие ключа = авто-provision T7).
 *  Вызывается из `bootstrap` ПОСЛЕ сида mode-пресетов и бэкфилла модов агентов,
 *  чтобы свежезасиженные строки тоже прошли конверсию. */
import { eq, sql } from 'drizzle-orm';
import { logger } from '../../../config/logger.ts';
import type { StudioDb } from './connection.ts';
import { agentsTable } from './schema/agents.ts';
import { modePresetsTable } from './schema/mode-presets.ts';

const MARKER = 'capability_set_v1';
const CREATE_META = sql.raw(
  'CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
);

export function migrateCapabilitySet(db: StudioDb): void {
  db.run(CREATE_META);
  // DROP вне маркера: безусловно идемпотентен (PRAGMA guard) и чинит колонку,
  // если её пере-создал старый код между перезапусками.
  dropToolsColumn(db);
  const seen = db.all<{ key: string }>(sql`SELECT key FROM schema_meta WHERE key = ${MARKER}`);
  if (seen.length > 0) {
    return;
  }
  healAgentRows(db);
  healModePresetRows(db);
  db.run(sql`INSERT INTO schema_meta(key, value) VALUES (${MARKER}, '1')`);
}

/** `DROP COLUMN` с guard: колонку уже могла съесть предыдущая итерация. */
function dropToolsColumn(db: StudioDb): void {
  const columns = db.all<{ name: string }>(sql`PRAGMA table_info(agents)`);
  if (!columns.some((column) => column.name === 'tools')) {
    return;
  }
  db.run(sql.raw('ALTER TABLE agents DROP COLUMN tools;'));
  logger.info({ scope: 'migration' }, 'capability_set_v1: agents.tools dropped');
}

function healAgentRows(db: StudioDb): void {
  const rows = db
    .select({
      id: agentsTable.id,
      name: agentsTable.name,
      capabilitiesJson: agentsTable.capabilitiesJson,
      modesJson: agentsTable.modesJson,
    })
    .from(agentsTable)
    .all();
  for (const row of rows) {
    const capabilities = parseRecord(row.capabilitiesJson);
    if (capabilities !== null && !('core' in capabilities)) {
      capabilities.core = {};
      db.update(agentsTable)
        .set({ capabilitiesJson: JSON.stringify(capabilities) })
        .where(eq(agentsTable.id, row.id))
        .run();
      logger.info({ scope: 'migration' }, `capability_set_v1: agent "${row.name}" granted core`);
    }
    const modes = parseModes(row.modesJson);
    if (modes === null) {
      logger.warn(
        { scope: 'migration' },
        `capability_set_v1: agent "${row.name}" has unparseable modes_json, skipped`,
      );
      continue;
    }
    let changed = false;
    for (const mode of modes) {
      if (mode === null || typeof mode !== 'object' || Array.isArray(mode)) {
        continue;
      }
      const record = mode as Record<string, unknown>;
      const packs = record.packs;
      if (Array.isArray(packs)) {
        record.packs = Object.fromEntries(
          packs
            .filter((name): name is string => typeof name === 'string')
            .map((name) => [name, {}]),
        );
        changed = true;
      }
      const packMap = record.packs;
      if (
        packMap !== null &&
        typeof packMap === 'object' &&
        !Array.isArray(packMap) &&
        Object.keys(packMap).length > 0 &&
        !('core' in (packMap as Record<string, unknown>))
      ) {
        (packMap as Record<string, unknown>).core = {};
        changed = true;
      }
    }
    if (changed) {
      db.update(agentsTable)
        .set({ modesJson: JSON.stringify(modes) })
        .where(eq(agentsTable.id, row.id))
        .run();
    }
  }
}

function healModePresetRows(db: StudioDb): void {
  const rows = db
    .select({ id: modePresetsTable.id, packsJson: modePresetsTable.packsJson })
    .from(modePresetsTable)
    .all();
  for (const row of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.packsJson);
    } catch {
      logger.warn(
        { scope: 'migration' },
        `capability_set_v1: mode preset "${row.id}" has unparseable packs_json, skipped`,
      );
      continue;
    }
    if (!Array.isArray(parsed)) {
      continue;
    }
    const map = Object.fromEntries(
      parsed.filter((name): name is string => typeof name === 'string').map((name) => [name, {}]),
    );
    db.update(modePresetsTable)
      .set({ packsJson: JSON.stringify(map) })
      .where(eq(modePresetsTable.id, row.id))
      .run();
  }
}

function parseRecord(json: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseModes(json: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
