import type { ResolvedCapability } from './registry.ts';

export const CAPABILITY_IDENTITY = `You are an agent working in a workspace. Use only the tools listed in this session; never output <tool_call> XML tags, and if a tool you want is missing, describe your intent in plain text. Project conventions live in AGENTS.md at the workspace root; a nested AGENTS.md applies in its subtree — read it before editing there. Your role and extra rules follow at the end of this prompt.`;

export function composeSystemPrompt(agentText: string, enabled: ResolvedCapability[]): string {
  const fragments = enabled
    .map(
      (c) =>
        c.reg.pack.prompt?.({
          ports: c.reg.ports,
          resolveScope: c.reg.resolveScope,
          config: c.config,
        }) ?? '',
    )
    .filter((t) => t.trim().length > 0);
  const extra = agentText.trim();
  const parts = [CAPABILITY_IDENTITY, ...fragments];
  if (extra) {
    parts.push(`## Agent\n${extra}`);
  }
  return parts.join('\n\n');
}
