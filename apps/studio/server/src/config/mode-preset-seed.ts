import { readFileSync } from 'node:fs';
import { ASK_MODE, type ModePreset, PLAN_PACK_ID } from '@harnesys/studio-shared';
import { planModePromptPath } from '../adapters/store/studio-layout.ts';

function preset(
  p: Omit<ModePreset, 'createdAt' | 'updatedAt' | 'builtin'>,
): Omit<ModePreset, 'createdAt' | 'updatedAt'> {
  return { ...p, builtin: true };
}

export function builtinModePresetSeed(): Omit<ModePreset, 'createdAt' | 'updatedAt'>[] {
  const planInstructions = readFileSync(planModePromptPath(), 'utf8').trim();
  return [
    preset({
      ...ASK_MODE,
      description: 'Confirm every write or command.',
      installedByDefault: true,
    }),
    preset({
      id: 'auto',
      name: 'Edit automatically',
      description: 'File edits run without confirmation.',
      permissions: { 'fs.write': 'allow', process: 'ask', network: 'ask', mcp: 'ask' },
      installedByDefault: true,
    }),
    preset({
      id: 'plan',
      name: 'Plan mode',
      description: 'Research and propose a plan; no writes or shell.',
      instructions: planInstructions,
      packs: [PLAN_PACK_ID],
      permissions: { 'fs.write': 'deny', process: 'deny', network: 'allow', mcp: 'allow' },
      installedByDefault: true,
    }),
    preset({
      id: 'dont_ask',
      name: "Don't ask",
      description: 'Writes auto-run; network and MCP denied.',
      permissions: { 'fs.write': 'allow', process: 'deny', network: 'deny', mcp: 'deny' },
      installedByDefault: false,
    }),
    preset({
      id: 'bypass',
      name: 'Bypass',
      description: 'Run everything without confirmations.',
      permissions: { 'fs.write': 'allow', process: 'allow', network: 'allow', mcp: 'allow' },
      installedByDefault: false,
    }),
  ];
}
