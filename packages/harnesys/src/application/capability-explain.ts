import type { PackAssignment, PackOverride } from '../domain/pack.ts';
import type { ToolDefinition, ToolExposure } from '../ports/tools.ts';
export type CapabilitySource = string;
export const PACK_PREFIX = 'pack:';
export type RunToolEntry = {
  def: ToolDefinition;
  exposure: ToolExposure;
  source: CapabilitySource;
};
export type RunRegistry = Map<string, RunToolEntry>;
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
export function isOn(assignment: PackAssignment | undefined): boolean {
  return assignment !== undefined && assignment !== null && assignment !== false;
}
export function overrideOf(assignment: PackAssignment | undefined): PackOverride {
  if (typeof assignment === 'object' && assignment !== null) {
    return assignment;
  }
  return {};
}
export function packNameOf(source: CapabilitySource): string | undefined {
  return source.startsWith(PACK_PREFIX) ? source.slice(PACK_PREFIX.length) : undefined;
}
