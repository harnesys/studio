import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentBudget, PackConfig } from '@harnesys/studio-shared';
import type { PermissionMap } from 'harnesys';
import { z } from 'zod';
import { PRESET_ID_RE, PRESETS_DIR } from '../config/constants.ts';
import { NotFoundError, ValidationError } from '../domain/studio.error.ts';
import { bundledSkillsPath, systemSkillsPath } from './store/studio-layout.ts';

const budgetSchema = z
  .object({
    maxSteps: z.number().int().positive().optional(),
    maxTokens: z.number().int().positive().optional(),
    deadlineMs: z.number().int().positive().optional(),
    policy: z.enum(['ask', 'error']).optional(),
  })
  .optional();

const capabilitiesSchema = z
  .record(z.string(), z.object({ spec: z.record(z.string(), z.unknown()).optional() }).nullable())
  .optional();

const permissionsSchema = z.record(z.string(), z.enum(['allow', 'ask', 'deny'])).optional();

const graphSchema = z
  .object({
    nodes: z.record(z.string(), z.unknown()),
    edges: z.array(z.unknown()),
  })
  .optional();

const agentPresetBodySchema = z.object({
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  instructions: z.string().trim().min(1),
  tools: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  mcpServers: z.array(z.string()).optional(),
  budget: budgetSchema,
  capabilities: capabilitiesSchema,
  permissions: permissionsSchema,
  graph: graphSchema,
});

export type AgentPresetGraph = {
  nodes: Record<string, unknown>;
  edges: unknown[];
};

export type AgentPreset = {
  id: string;
  name: string;
  role: string;
  instructions: string;
  tools?: string[];
  skills?: string[];
  mcpServers?: string[];
  budget?: AgentBudget;
  capabilities?: Record<string, PackConfig | null>;
  permissions?: PermissionMap;
  graph?: AgentPresetGraph;
};

/** Presets dir under a given skills root. */
export function agentPresetsDir(skillsRoot: string): string {
  return join(skillsRoot, PRESETS_DIR);
}

/** Skills roots that may carry presets, ascending precedence (home overrides bundle). */
function presetRoots(): string[] {
  return [bundledSkillsPath(), systemSkillsPath()];
}

function presetIdsIn(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .filter((id) => PRESET_ID_RE.test(id));
}

/**
 * List presets from bundled app assets and `~/.harnesys/skills/agent-creator/presets`
 * (id = filename stem). A same-id preset in home shadows the bundled one.
 */
export function listAgentPresets(): AgentPreset[] {
  const byId = new Map<string, { id: string; dir: string }>();
  for (const root of presetRoots()) {
    const dir = agentPresetsDir(root);
    for (const id of presetIdsIn(dir)) {
      byId.set(id, { id, dir });
    }
  }
  const out = [...byId.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((entry) => parsePreset(entry.id, join(entry.dir, `${entry.id}.json`)));
  return out;
}

export function readAgentPreset(id: string): AgentPreset {
  if (!PRESET_ID_RE.test(id)) {
    throw new ValidationError(`invalid preset id: ${id}`);
  }
  const roots = presetRoots();
  for (let i = roots.length - 1; i >= 0; i -= 1) {
    const path = join(agentPresetsDir(roots[i]), `${id}.json`);
    if (existsSync(path)) {
      return parsePreset(id, path);
    }
  }
  throw new NotFoundError(`preset not found: ${id}`);
}

function parsePreset(id: string, path: string): AgentPreset {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new ValidationError(
      `invalid preset JSON ${id}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const parsed = agentPresetBodySchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(`invalid preset ${id}: ${parsed.error.message}`);
  }
  const body = parsed.data;
  return {
    id,
    name: body.name,
    role: body.role,
    instructions: body.instructions,
    ...(body.tools !== undefined ? { tools: body.tools } : {}),
    ...(body.skills !== undefined ? { skills: body.skills } : {}),
    ...(body.mcpServers !== undefined ? { mcpServers: body.mcpServers } : {}),
    ...(body.budget !== undefined ? { budget: body.budget } : {}),
    ...(body.capabilities !== undefined ? { capabilities: body.capabilities } : {}),
    ...(body.permissions !== undefined ? { permissions: body.permissions } : {}),
    ...(body.graph !== undefined ? { graph: body.graph } : {}),
  };
}
