import type { ResolvedCapability } from './registry.ts';

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
  const parts = [...fragments];
  if (extra) {
    parts.push(`## Agent\n${extra}`);
  }
  return parts.join('\n\n');
}
