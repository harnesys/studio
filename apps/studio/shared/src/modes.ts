export const MODE_OPS = ['fs.write', 'process', 'network', 'mcp'] as const;
export type ModeOp = (typeof MODE_OPS)[number];
export type ModeOpGate = 'allow' | 'ask' | 'deny';
export type ModeOpPermissions = Partial<Record<ModeOp, ModeOpGate>>;

/** Underscore is legal: legacy system preset ids ('dont_ask') must keep resolving. */
export const MODE_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;
export const DEFAULT_MODE_ID = 'ask';
/** Pack id, not a mode name: plan preset preloads this pack (Capabilities key). */
export const PLAN_PACK_ID = 'plan';

export type AgentMode = {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  skills?: string[];
  packs?: string[];
  permissions?: ModeOpPermissions;
};

/** Ultimate fallback; mirrored by the builtin 'ask' preset seed. */
export const ASK_MODE: AgentMode = {
  id: DEFAULT_MODE_ID,
  name: 'Ask before changes',
  permissions: { 'fs.write': 'ask', process: 'ask', network: 'ask', mcp: 'ask' },
};

export type ModePreset = AgentMode & {
  builtin: boolean;
  installedByDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export function isModeId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 48 && MODE_ID_RE.test(value);
}

/** Chain: bodyMode > threadMode > defaultModeId > ask. A value is valid when it
 *  matches the id pattern and exists in the agent's modes; anything else falls through. */
export function resolveModeId(input: {
  bodyMode?: string | null;
  threadMode?: string | null;
  defaultModeId?: string | null;
  modes?: AgentMode[] | null;
}): string {
  const ids = new Set((input.modes ?? []).map((m) => m.id));
  for (const candidate of [input.bodyMode, input.threadMode, input.defaultModeId]) {
    if (isModeId(candidate) && (candidate === DEFAULT_MODE_ID || ids.has(candidate))) {
      return candidate;
    }
  }
  return DEFAULT_MODE_ID;
}

export function effectiveMode(modes: AgentMode[] | undefined, runModeId: string): AgentMode {
  return modes?.find((m) => m.id === runModeId) ?? ASK_MODE;
}

export function modeFromPreset(preset: ModePreset): AgentMode {
  return {
    id: preset.id,
    name: preset.name,
    ...(preset.description ? { description: preset.description } : {}),
    ...(preset.instructions ? { instructions: preset.instructions } : {}),
    ...(preset.skills?.length ? { skills: [...preset.skills] } : {}),
    ...(preset.packs?.length ? { packs: [...preset.packs] } : {}),
    ...(preset.permissions ? { permissions: { ...preset.permissions } } : {}),
  };
}
