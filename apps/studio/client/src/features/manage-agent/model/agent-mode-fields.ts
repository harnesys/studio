import {
  type AgentMode,
  DEFAULT_MODE_ID,
  MODE_ID_RE,
  type ModeOpGate,
} from '@harnesys/studio-shared';
import { z } from 'zod';

export const MODE_INSTRUCTIONS_MAX = 6000;

export const agentModeSchema = z.object({
  id: z.string().regex(MODE_ID_RE, 'lowercase letters, digits, dash').max(48),
  name: z.string().trim().min(1, 'Name required').max(80),
  description: z.string().max(200),
  instructions: z.string().max(MODE_INSTRUCTIONS_MAX, `Max ${MODE_INSTRUCTIONS_MAX} characters`),
  skills: z.array(z.string()),
  packs: z.array(z.string()),
  permWrite: z.enum(['allow', 'ask', 'deny']),
  permProcess: z.enum(['allow', 'ask', 'deny']),
  permNetwork: z.enum(['allow', 'ask', 'deny']),
  permMcp: z.enum(['allow', 'ask', 'deny']),
  permAgents: z.enum(['allow', 'ask', 'deny']),
});

export type AgentModeFields = z.infer<typeof agentModeSchema>;

export const agentModesSchema = z.array(agentModeSchema).superRefine((modes, ctx) => {
  const seen = new Set<string>();
  modes.forEach((mode, index) => {
    if (mode.id === DEFAULT_MODE_ID) {
      ctx.addIssue({ code: 'custom', path: [index, 'id'], message: 'id "default" is reserved' });
    }
    if (seen.has(mode.id)) {
      ctx.addIssue({ code: 'custom', path: [index, 'id'], message: 'Duplicate mode id' });
    }
    seen.add(mode.id);
  });
});

const FALLBACK_GATE: ModeOpGate = 'ask';

export function modeToFields(mode: AgentMode): AgentModeFields {
  return {
    id: mode.id,
    name: mode.name,
    description: mode.description ?? '',
    instructions: mode.instructions ?? '',
    skills: [...(mode.skills ?? [])],
    packs: [...(mode.packs ?? [])],
    permWrite: mode.permissions?.['fs.write'] ?? FALLBACK_GATE,
    permProcess: mode.permissions?.process ?? FALLBACK_GATE,
    permNetwork: mode.permissions?.network ?? FALLBACK_GATE,
    permMcp: mode.permissions?.mcp ?? FALLBACK_GATE,
    permAgents: mode.permissions?.agents ?? FALLBACK_GATE,
  };
}

export function fieldsToMode(fields: AgentModeFields): AgentMode {
  return {
    id: fields.id,
    name: fields.name.trim(),
    ...(fields.description.trim() ? { description: fields.description.trim() } : {}),
    ...(fields.instructions.trim() ? { instructions: fields.instructions.trim() } : {}),
    ...(fields.skills.length ? { skills: [...fields.skills] } : {}),
    ...(fields.packs.length ? { packs: [...fields.packs] } : {}),
    permissions: {
      'fs.write': fields.permWrite,
      process: fields.permProcess,
      network: fields.permNetwork,
      mcp: fields.permMcp,
      agents: fields.permAgents,
    },
  };
}

export function blankModeFields(): AgentModeFields {
  return modeToFields({ id: '', name: '' });
}
