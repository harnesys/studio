import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { AgentBudget, CapabilityConfig } from '../../shared/types.ts';
import { NotFoundError, ValidationError } from '../domain/studio.error.ts';
import { systemSkillsPath } from './store/studio-layout.ts';

const PRESETS_DIR = 'author-agents/presets';
const PRESET_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

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
  capabilities?: Record<string, CapabilityConfig | null>;
  graph?: AgentPresetGraph;
};

export function agentPresetsDir(homeSkills: string = systemSkillsPath()): string {
  return join(homeSkills, PRESETS_DIR);
}

/** List `~/.harnesys/skills/author-agents/presets/*.json` (id = filename stem). */
export function listAgentPresets(): AgentPreset[] {
  const dir = agentPresetsDir();
  if (!existsSync(dir)) {
    return [];
  }
  const names = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .filter((id) => PRESET_ID_RE.test(id))
    .sort((a, b) => a.localeCompare(b));
  const out: AgentPreset[] = [];
  for (const id of names) {
    out.push(readAgentPreset(id));
  }
  return out;
}

export function readAgentPreset(id: string): AgentPreset {
  if (!PRESET_ID_RE.test(id)) {
    throw new ValidationError(`invalid preset id: ${id}`);
  }
  const path = join(agentPresetsDir(), `${id}.json`);
  if (!existsSync(path)) {
    throw new NotFoundError(`preset not found: ${id}`);
  }
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
    ...(body.graph !== undefined ? { graph: body.graph } : {}),
  };
}
