/** Словарь провенанса capability-набора: source-строки, меченые записи реестра и
 *  журнал explain. Провенанс — метаданные: движок на `source` не ветвится.
 *  Слои сборки (грант/overrides/режим/legacy) живут в `capability-set.ts`. */

import type { PackAssignment, PackOverride } from '../domain/pack.ts';
import type { ToolDefinition, ToolExposure } from '../ports/tools.ts';

/** Составная провенанс-строка: `'pack:<name>' | 'plugin:<name>' | 'mcp:<server>' | 'host'`. */
export type CapabilitySource = string;

export const PACK_PREFIX = 'pack:';

export type RunToolEntry = {
  def: ToolDefinition;
  exposure: ToolExposure;
  source: CapabilitySource;
};

export type RunRegistry = Map<string, RunToolEntry>;

/** Плоская проекция реестра рана в исполняемый tool-map: exposure едет копией
 *  на деф (`RunTarget.toolRegistry`-форма; движок читает флаги из дефов). */
export function projectToolRegistry(registry: RunRegistry): Map<string, ToolDefinition> {
  return new Map(
    [...registry].map(([name, entry]) => [name, { ...entry.def, exposure: entry.exposure }]),
  );
}

export type ExplainKind = 'tool' | 'skill' | 'mcp' | 'hook' | 'subagent' | 'note' | 'path';

export type ExplainStatus =
  | 'granted'
  | 'deferred'
  | 'disabled'
  | 'dropped-by-mode'
  | 'denied-by-universe'
  | 'overrode-host';

export type ExplainEntry = {
  item: string;
  kind: ExplainKind;
  source: CapabilitySource;
  status: ExplainStatus;
  reason: string;
};

type NoteFn = (item: string, kind: ExplainKind, source: CapabilitySource, reason: string) => void;

/** Аккумулирующий explain-журнал: по методу на статус, записи идут в `entries` по порядку слоёв. */
export type ExplainLog = {
  entries: ExplainEntry[];
  granted: NoteFn;
  deferred: NoteFn;
  disabled: NoteFn;
  droppedByMode: NoteFn;
  deniedByUniverse: NoteFn;
  overrodeHost: NoteFn;
};

export function createExplainLog(): ExplainLog {
  const entries: ExplainEntry[] = [];
  const note =
    (status: ExplainStatus): NoteFn =>
    (item, kind, source, reason) => {
      entries.push({ item, kind, source, status, reason });
    };
  return {
    entries,
    granted: note('granted'),
    deferred: note('deferred'),
    disabled: note('disabled'),
    droppedByMode: note('dropped-by-mode'),
    deniedByUniverse: note('denied-by-universe'),
    overrodeHost: note('overrode-host'),
  };
}

/** Семантика assignment-литералов (спека §3, эталон `enabledConfig`): `true|{}|{spec}|PackOverride` = on. */
export function isOn(assignment: PackAssignment | undefined): boolean {
  return assignment !== undefined && assignment !== null && assignment !== false;
}

/** Объектный assignment как PackOverride: `true`/отсутствие дают пустой override. */
export function overrideOf(assignment: PackAssignment | undefined): PackOverride {
  if (typeof assignment === 'object' && assignment !== null) {
    return assignment;
  }
  return {};
}

/** Имя пака из провенанс-строки; undefined для не-паковых источников. */
export function packNameOf(source: CapabilitySource): string | undefined {
  return source.startsWith(PACK_PREFIX) ? source.slice(PACK_PREFIX.length) : undefined;
}
