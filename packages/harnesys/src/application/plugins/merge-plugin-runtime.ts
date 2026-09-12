import { dirname } from 'node:path';
import { FsSkillRegistry } from '../../adapters/fs-skill-registry.ts';
import type { PluginIr } from '../../domain/plugin-ir.ts';
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

/** One prefixed `FsSkillRegistry` per plugin: roots = parent dirs of IR SkillSpec entries. */
export function buildPluginSkillRegistries(plugins: PluginIr[]): SkillRegistry[] {
  return plugins.map((ir) => {
    const roots = new Set<string>();
    for (const component of ir.components) {
      if (component.kind === 'skill' && component.status !== 'dropped' && 'dir' in component.spec) {
        roots.add(dirname(component.spec.dir));
      }
    }
    return prefixSkillRegistry(new FsSkillRegistry({ roots: [...roots] }), ir.identity.name);
  });
}
