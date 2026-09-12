import type { CursorMcpJson } from '../../ports/mcp.ts';

/** Merge MCP fragments; later fragments overwrite the same `serverId`. */
export function mergePluginMcpFragments(
  base: CursorMcpJson,
  fragments: CursorMcpJson[],
): CursorMcpJson {
  const mcpServers = { ...base.mcpServers };
  for (const fragment of fragments) {
    Object.assign(mcpServers, fragment.mcpServers);
  }
  return { mcpServers };
}
