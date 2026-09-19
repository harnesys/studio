import type {
  AgentCapabilitiesView,
  AgentCapabilityRegistryEntry,
  PackAssignment,
  PackOverride,
} from '@harnesys/studio-shared';
import type { ExplainEntry, ExplainKind, ExplainStatus, ToolExposure } from 'harnesys';
import { z } from 'zod';
export const CORE_SOURCE = 'core';
export type PackAssignmentMap = Record<string, PackAssignment | null>;
const disabledToolsSchema = z.array(z.string().trim().min(1)).max(64);
const toolExposureSchema = z.enum(['direct', 'deferred']);
export const PackOverrideSchema = z.object({
  spec: z.record(z.string(), z.unknown()).optional(),
  disabledTools: disabledToolsSchema.optional(),
  exposure: z.record(z.string(), toolExposureSchema).optional(),
});
export type PackOverrideDraft = z.infer<typeof PackOverrideSchema>;
export const ModeDisabledToolsSchema = disabledToolsSchema;
export const ModeToolExposureSchema = z.record(z.string(), toolExposureSchema);
export const PackAssignmentSchema = z.union([
  z.literal(true),
  z.literal(false),
  PackOverrideSchema,
  z.null(),
]);
export type PackAssignmentDraft = z.infer<typeof PackAssignmentSchema>;
export function isSourceGranted(value: PackAssignment | null | undefined): boolean {
  return value !== undefined && value !== null && value !== false;
}
export function overrideOfAssignment(value: PackAssignment | null | undefined): PackOverride {
  if (typeof value === 'object' && value !== null) {
    return value;
  }
  return {};
}
function asStoredMap(map: PackAssignmentMap): PackAssignmentMap {
  return { ...map };
}
export function setSourceGrant(
  map: PackAssignmentMap,
  name: string,
  granted: boolean,
): PackAssignmentMap {
  const next = asStoredMap(map);
  if (granted) {
    const current = map[name];
    next[name] = typeof current === 'object' && current !== null ? current : {};
    return next;
  }
  next[name] = null;
  return next;
}
export function expandEmptyPreload(map: PackAssignmentMap, packNames: string[]): PackAssignmentMap {
  if (Object.keys(map).length > 0) {
    return map;
  }
  const next: PackAssignmentMap = {};
  for (const name of packNames) {
    next[name] = {};
  }
  return next;
}
export function withDisabledTool(base: PackOverride, tool: string, disable: boolean): PackOverride {
  const current = base.disabledTools ?? [];
  let nextList: string[];
  if (!disable) {
    nextList = current.filter((item) => item !== tool);
  } else if (current.includes(tool)) {
    nextList = current;
  } else {
    nextList = [...current, tool];
  }
  const next: PackOverride = { ...base };
  if (nextList.length > 0) {
    next.disabledTools = nextList;
  } else {
    delete next.disabledTools;
  }
  return next;
}
export function withToolExposure(
  base: PackOverride,
  tool: string,
  exposure: ToolExposure,
): PackOverride {
  return { ...base, exposure: { ...base.exposure, [tool]: exposure } };
}
export function toggleDisabledTool(
  map: PackAssignmentMap,
  name: string,
  tool: string,
  disable: boolean,
): PackAssignmentMap {
  return { ...map, [name]: withDisabledTool(overrideOfAssignment(map[name]), tool, disable) };
}
export function setToolExposure(
  map: PackAssignmentMap,
  name: string,
  tool: string,
  exposure: ToolExposure,
): PackAssignmentMap {
  return { ...map, [name]: withToolExposure(overrideOfAssignment(map[name]), tool, exposure) };
}
export type SourceCardTool = {
  name: string;
  exposure: ToolExposure;
  disabled: boolean;
  overridden: boolean;
  provenance: string;
  status: ExplainStatus;
  reason: string;
};
function registryOf(
  view: AgentCapabilitiesView | undefined,
  name: string,
): AgentCapabilityRegistryEntry | undefined {
  return view?.registry.find((entry) => entry.name === name);
}
const TERMINAL_STATUSES: ExplainStatus[] = ['disabled', 'dropped-by-mode', 'denied-by-universe'];
function isTerminal(entry: ExplainEntry): boolean {
  return TERMINAL_STATUSES.includes(entry.status);
}
export function sourceToolRows(
  view: AgentCapabilitiesView | undefined,
  source: string,
  override: PackOverride,
): SourceCardTool[] {
  const entries = (view?.explain ?? [])
    .filter((entry) => entry.kind === 'tool' && entry.source === source)
    .sort((a, b) => a.item.localeCompare(b.item));
  const chosen = new Map<string, ExplainEntry>();
  for (const entry of entries) {
    const prev = chosen.get(entry.item);
    if (prev === undefined || !isTerminal(prev)) {
      chosen.set(entry.item, entry);
    }
  }
  const rows: SourceCardTool[] = [];
  for (const entry of chosen.values()) {
    const draftDisabled = override.disabledTools?.includes(entry.item) ?? false;
    const draftExposure = override.exposure?.[entry.item];
    rows.push({
      name: entry.item,
      exposure: draftExposure ?? registryOf(view, entry.item)?.exposure ?? 'direct',
      disabled: draftDisabled || isTerminal(entry),
      overridden: draftDisabled || draftExposure !== undefined,
      provenance: entry.source,
      status: entry.status,
      reason: entry.reason,
    });
  }
  return rows;
}
export type SourceCardSection = {
  kind: ExplainKind;
  label: string;
  items: string[];
};
const PLUGIN_SECTION_LABEL: Record<string, string> = {
  skill: 'Skills',
  mcp: 'MCP',
  hook: 'Hooks',
};
export function sourceSections(
  view: AgentCapabilitiesView | undefined,
  source: string,
): SourceCardSection[] {
  const sections: SourceCardSection[] = [];
  for (const kind of ['skill', 'mcp', 'hook'] as const) {
    const items = [
      ...new Set(
        (view?.explain ?? [])
          .filter((entry) => entry.kind === kind && entry.source === source)
          .map((entry) => entry.item),
      ),
    ].sort((a, b) => a.localeCompare(b));
    if (items.length > 0) {
      sections.push({ kind, label: PLUGIN_SECTION_LABEL[kind] ?? kind, items });
    }
  }
  return sections;
}
