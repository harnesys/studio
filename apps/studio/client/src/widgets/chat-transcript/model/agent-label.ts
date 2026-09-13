/**
 * Имя для карточек, когда агента нет в сторе DB-агентов: каталожный id
 * `pluginName:agentName` → `agentName`, иначе префикс UUID.
 */
export function agentFallbackName(agentId: string): string {
  const ns = agentId.lastIndexOf(':');
  return ns === -1 ? agentId.slice(0, 8) : agentId.slice(ns + 1);
}
