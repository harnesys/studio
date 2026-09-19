import type { PluginName } from '../../domain/plugin.ts';
import type { SkillSummary } from '../../domain/skill.ts';
import type { SkillRegistry } from '../../ports/skills.ts';

function withPrefixedName(summary: SkillSummary, pluginName: PluginName): SkillSummary {
  return {
    ...summary,
    name: `${pluginName}:${summary.name}`,
  };
}
export function prefixSkillRegistry(
  registry: SkillRegistry,
  pluginName: PluginName,
): SkillRegistry {
  const prefix = `${pluginName}:`;
  return {
    async list() {
      const items = await registry.list();
      return items.map((item) => withPrefixedName(item, pluginName));
    },
    async load(id: string) {
      if (!id.startsWith(prefix)) {
        throw new Error(`unknown skill: ${id}`);
      }
      const original = id.slice(prefix.length);
      if (original.length === 0) {
        throw new Error(`unknown skill: ${id}`);
      }
      return await registry.load(original);
    },
    async loadFile(id: string, relPath: string) {
      if (!id.startsWith(prefix)) {
        throw new Error(`unknown skill: ${id}`);
      }
      const original = id.slice(prefix.length);
      if (original.length === 0) {
        throw new Error(`unknown skill: ${id}`);
      }
      return await registry.loadFile(original, relPath);
    },
    reload() {
      return registry.reload();
    },
  };
}
