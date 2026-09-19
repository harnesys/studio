export function agentFallbackName(agentId: string): string {
  const ns = agentId.lastIndexOf(':');
  return ns === -1 ? agentId.slice(0, 8) : agentId.slice(ns + 1);
}
