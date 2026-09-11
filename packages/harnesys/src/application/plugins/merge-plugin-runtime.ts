import { join } from 'node:path';
import { FsSkillRegistry } from '../../adapters/fs-skill-registry.ts';
import type { Plugin } from '../../domain/plugin.ts';
import type { CursorMcpJson } from '../../ports/mcp.ts';
import type { SkillRegistry } from '../../ports/skills.ts';
import { prefixSkillRegistry } from './prefixed-skill-registry.ts';

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

/** One prefixed `FsSkillRegistry` per plugin `skills/` root. */
export function buildPluginSkillRegistries(plugins: Plugin[]): SkillRegistry[] {
  return plugins.map((plugin) =>
    prefixSkillRegistry(
      new FsSkillRegistry({ roots: [join(plugin.root, 'skills')] }),
      plugin.manifest.name,
    ),
  );
}
